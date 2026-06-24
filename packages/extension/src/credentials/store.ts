import * as vscode from 'vscode';
import {
  defaultProviderAuthContext,
  type Api,
  type ApiKeyCredential,
  type AuthContext,
  type AuthLoginCallbacks,
  type Credential as PiCredential,
  type CredentialStore as PiCredentialStore,
  type Model,
  type ModelThinkingLevel,
  type OAuthCredential,
  type OAuthCredentials,
  type ProviderEnv
} from '@earendil-works/pi-ai';
import { LEGACY_SECRET_KEYS, migrateLegacySecrets } from './migration';
import { normalizeEnv, parseStore } from './serialization';
import { createPiModels } from '../shared/piModels';
import { type ProviderCredentialSummary, type StoredProviderCredential, type StoredProviderCredentials } from './types';

const PROVIDERS_SECRET = 'piRouter.providers.v1';

// Persists provider credentials to VS Code SecretStorage. This is pure storage:
// it carries no UI. OAuth login UX is supplied by the caller as `AuthLoginCallbacks`
// (see oauth/nativeCallbacks.ts and oauth/webviewCallbacks.ts).
export class CredentialStore implements PiCredentialStore {
  private readonly models = createPiModels(this);
  private readonly authContext = defaultProviderAuthContext();
  private readonly modifyChains = new Map<string, Promise<void>>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  async listProviderCredentials(): Promise<ProviderCredentialSummary[]> {
    const store = await this.loadStore();
    const entries = Object.entries(store.providers).sort(([a], [b]) => a.localeCompare(b));
    return Promise.all(
      entries.map(async ([providerId, credential]) => ({
        providerId,
        type: credential.type,
        hasKey: credential.type === 'api_key' ? await this.canResolveApiKeyCredential(providerId, credential) : true,
        envKeys: Object.keys(credential.env ?? {}).sort(),
        reasoning: credential.reasoning ?? {},
        updatedAt: credential.updatedAt
      }))
    );
  }

  async getConfiguredProviderIds(): Promise<string[]> {
    return (await this.listProviderCredentials()).map((summary) => summary.providerId);
  }

  async setProviderApiKey(providerId: string, apiKey: string, env: ProviderEnv = {}): Promise<void> {
    const trimmedKey = apiKey.trim();
    const normalizedEnv = normalizeEnv(env);
    const credential = { type: 'api_key', key: trimmedKey || undefined, env: normalizedEnv } satisfies ApiKeyCredential;
    if (!(await this.canResolveApiKeyCredential(providerId, credential))) {
      throw new Error('Enter an API key, or provide provider-scoped environment values that resolve credentials.');
    }

    await this.modify(providerId, async () => credential);
  }

  async setProviderOAuthCredentials(
    providerId: string,
    credentials: OAuthCredential | OAuthCredentials,
    env: ProviderEnv = {}
  ): Promise<void> {
    await this.enqueueModify(providerId, async () => {
      const store = await this.loadStore();
      const credential = { ...credentials, type: 'oauth' } satisfies OAuthCredential;
      const stored = toStoredCredential(credential, store.providers[providerId]);
      const normalizedEnv = normalizeEnv(env);
      stored.env = Object.keys(normalizedEnv).length > 0 ? normalizedEnv : stored.env;
      store.providers[providerId] = stored;
      await this.saveStore(store);
    });
  }

  async setModelReasoning(providerId: string, modelId: string, level: ModelThinkingLevel | null): Promise<void> {
    const store = await this.loadStore();
    const credential = store.providers[providerId];
    if (!credential) {
      return;
    }

    const reasoning = { ...credential.reasoning };
    if (level === null) {
      delete reasoning[modelId];
    } else {
      reasoning[modelId] = level;
    }

    store.providers[providerId] = {
      ...credential,
      reasoning: Object.keys(reasoning).length > 0 ? reasoning : undefined,
      updatedAt: Date.now()
    };
    await this.saveStore(store);
  }

  async loginOAuthProviderWithCallbacks(providerId: string, callbacks: AuthLoginCallbacks): Promise<void> {
    const oauth = this.models.getProvider(providerId)?.auth.oauth;
    if (!oauth) {
      throw new Error(`pi-ai OAuth provider is not available for ${providerId}.`);
    }

    const credentials = await oauth.login(callbacks);
    await this.modify(providerId, async () => credentials);
  }

  async removeProvider(providerId: string): Promise<void> {
    await this.delete(providerId);
  }

  async clearAll(): Promise<void> {
    await this.context.secrets.delete(PROVIDERS_SECRET);
    for (const key of LEGACY_SECRET_KEYS) {
      await this.context.secrets.delete(key);
    }
  }

  async read(providerId: string): Promise<PiCredential | undefined> {
    return toPiCredential(await this.getStoredCredential(providerId));
  }

  async modify(
    providerId: string,
    fn: (current: PiCredential | undefined) => Promise<PiCredential | undefined>
  ): Promise<PiCredential | undefined> {
    return this.enqueueModify(providerId, async () => {
      const store = await this.loadStore();
      const currentStored = store.providers[providerId];
      const current = toPiCredential(currentStored);
      const next = await fn(current);
      if (!next) {
        return current;
      }

      store.providers[providerId] = toStoredCredential(next, currentStored);
      await this.saveStore(store);
      return toPiCredential(store.providers[providerId]);
    });
  }

  async delete(providerId: string): Promise<void> {
    await this.enqueueModify(providerId, async () => {
      const store = await this.loadStore();
      delete store.providers[providerId];
      await this.saveStore(store);
    });
  }

  async getProviderRequestSettings(
    providerId: string
  ): Promise<{ env: ProviderEnv; reasoning?: Record<string, ModelThinkingLevel> } | undefined> {
    const credential = await this.getStoredCredential(providerId);
    if (!credential) {
      return undefined;
    }

    return { env: credential.env ?? {}, reasoning: credential.reasoning };
  }

  async canResolveModelAuth(model: Model<Api>, env: ProviderEnv = {}): Promise<boolean> {
    const provider = this.models.getProvider(model.provider);
    if (!provider) {
      return false;
    }

    const stored = await this.read(provider.id);
    if (stored?.type === 'api_key') {
      return this.canResolveApiKeyCredential(
        provider.id,
        {
          ...stored,
          env: { ...stored.env, ...env }
        },
        model
      );
    }

    return Boolean(await this.models.getAuth(model));
  }

  private async getStoredCredential(providerId: string): Promise<StoredProviderCredential | undefined> {
    return (await this.loadStore()).providers[providerId];
  }

  private async canResolveApiKeyCredential(
    providerId: string,
    credential: ApiKeyCredential | StoredProviderCredential,
    model?: Model<Api>
  ): Promise<boolean> {
    if (credential.type !== 'api_key') {
      return false;
    }

    const provider = this.models.getProvider(providerId);
    const requestModel = model ?? this.models.getModels(providerId)[0];
    if (!provider?.auth.apiKey || !requestModel) {
      return false;
    }

    try {
      const auth = await provider.auth.apiKey.resolve({
        model: requestModel,
        ctx: this.authContextWithEnv(credential.env ?? {}),
        credential: {
          type: 'api_key',
          key: credential.key,
          env: credential.env
        }
      });
      return Boolean(auth);
    } catch {
      return false;
    }
  }

  private authContextWithEnv(env: ProviderEnv): AuthContext {
    return {
      env: async (name) => env[name] || (await this.authContext.env(name)),
      fileExists: (path) => this.authContext.fileExists(path)
    };
  }

  private enqueueModify<T>(providerId: string, run: () => Promise<T>): Promise<T> {
    const previous = this.modifyChains.get(providerId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(run);
    const chain = next.then(
      () => undefined,
      () => undefined
    );
    this.modifyChains.set(providerId, chain);
    void chain.finally(() => {
      if (this.modifyChains.get(providerId) === chain) {
        this.modifyChains.delete(providerId);
      }
    });
    return next;
  }

  private async loadStore(): Promise<StoredProviderCredentials> {
    const raw = await this.context.secrets.get(PROVIDERS_SECRET);
    const store = parseStore(raw);
    return migrateLegacySecrets(this.context.secrets, store, (next) => this.saveStore(next), Date.now());
  }

  private async saveStore(store: StoredProviderCredentials): Promise<void> {
    await this.context.secrets.store(PROVIDERS_SECRET, JSON.stringify(store));
  }
}

function toPiCredential(credential: StoredProviderCredential | undefined): PiCredential | undefined {
  if (!credential) {
    return undefined;
  }

  if (credential.type === 'api_key') {
    return { type: 'api_key', key: credential.key, env: credential.env };
  }

  return { ...credential.credentials, type: 'oauth' };
}

function toStoredCredential(
  credential: PiCredential,
  previous: StoredProviderCredential | undefined
): StoredProviderCredential {
  const env = credential.type === 'api_key' ? normalizeEnv(credential.env ?? {}) : previous?.env;
  const shared = {
    env: env && Object.keys(env).length > 0 ? env : undefined,
    reasoning: previous?.reasoning,
    updatedAt: Date.now()
  };

  if (credential.type === 'api_key') {
    return {
      ...shared,
      type: 'api_key',
      key: credential.key?.trim() || undefined
    };
  }

  const credentials = { ...credential } as OAuthCredentials & { type?: 'oauth' };
  delete credentials.type;
  return {
    ...shared,
    type: 'oauth',
    credentials
  };
}
