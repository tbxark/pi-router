import * as vscode from 'vscode';
import { getEnvApiKey, type ModelThinkingLevel, type ProviderEnv } from '@earendil-works/pi-ai';
import {
  getOAuthApiKey,
  getOAuthProvider,
  type OAuthCredentials,
  type OAuthLoginCallbacks
} from '@earendil-works/pi-ai/oauth';
import { LEGACY_SECRET_KEYS, migrateLegacySecrets } from './migration';
import { normalizeEnv, parseStore } from './serialization';
import {
  type ProviderCredentialSummary,
  type ResolvedProviderCredentials,
  type StoredProviderCredential,
  type StoredProviderCredentials
} from './types';

const PROVIDERS_SECRET = 'piRouter.providers.v1';

// Persists provider credentials to VS Code SecretStorage. This is pure storage:
// it carries no UI. OAuth login UX is supplied by the caller as `OAuthLoginCallbacks`
// (see oauth/nativeCallbacks.ts and oauth/webviewCallbacks.ts).
export class CredentialStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async listProviderCredentials(): Promise<ProviderCredentialSummary[]> {
    const store = await this.loadStore();
    return Object.entries(store.providers)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([providerId, credential]) => ({
        providerId,
        type: credential.type,
        hasKey:
          credential.type === 'api_key' ? Boolean(credential.key || getEnvApiKey(providerId, credential.env)) : true,
        envKeys: Object.keys(credential.env ?? {}).sort(),
        reasoning: credential.reasoning ?? {},
        updatedAt: credential.updatedAt
      }));
  }

  async getConfiguredProviderIds(): Promise<string[]> {
    return (await this.listProviderCredentials()).map((summary) => summary.providerId);
  }

  async setProviderApiKey(providerId: string, apiKey: string, env: ProviderEnv = {}): Promise<void> {
    const trimmedKey = apiKey.trim();
    const normalizedEnv = normalizeEnv(env);
    if (!trimmedKey && !getEnvApiKey(providerId, normalizedEnv)) {
      throw new Error('Enter an API key, or provide provider-scoped environment values that resolve credentials.');
    }

    const store = await this.loadStore();
    store.providers[providerId] = {
      type: 'api_key',
      key: trimmedKey || undefined,
      env: normalizedEnv,
      reasoning: store.providers[providerId]?.reasoning,
      updatedAt: Date.now()
    };
    await this.saveStore(store);
  }

  async setProviderOAuthCredentials(
    providerId: string,
    credentials: OAuthCredentials,
    env: ProviderEnv = {}
  ): Promise<void> {
    const store = await this.loadStore();
    store.providers[providerId] = {
      type: 'oauth',
      credentials,
      env: normalizeEnv(env),
      reasoning: store.providers[providerId]?.reasoning,
      updatedAt: Date.now()
    };
    await this.saveStore(store);
  }

  async setModelReasoning(providerId: string, modelId: string, level: ModelThinkingLevel | null): Promise<void> {
    const store = await this.loadStore();
    const credential = store.providers[providerId];
    if (!credential) {
      return;
    }

    const reasoning = { ...(credential.reasoning ?? {}) };
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

  async loginOAuthProviderWithCallbacks(providerId: string, callbacks: OAuthLoginCallbacks): Promise<void> {
    const provider = getOAuthProvider(providerId);
    if (!provider) {
      throw new Error(`pi-ai OAuth provider is not available for ${providerId}.`);
    }

    const existingEnv = (await this.getStoredCredential(providerId))?.env ?? {};
    const credentials = await provider.login(callbacks);
    await this.setProviderOAuthCredentials(providerId, credentials, existingEnv);
  }

  async removeProvider(providerId: string): Promise<void> {
    const store = await this.loadStore();
    delete store.providers[providerId];
    await this.saveStore(store);
  }

  async resolveProviderCredentials(providerId: string): Promise<ResolvedProviderCredentials | undefined> {
    const store = await this.loadStore();
    const credential = store.providers[providerId];
    if (!credential) {
      return undefined;
    }

    const env = credential.env ?? {};
    if (credential.type === 'api_key') {
      return {
        type: credential.type,
        apiKey: credential.key || getEnvApiKey(providerId, env),
        env,
        reasoning: credential.reasoning
      };
    }

    const result = await getOAuthApiKey(providerId, { [providerId]: credential.credentials });
    if (!result) {
      return undefined;
    }

    store.providers[providerId] = {
      ...credential,
      credentials: result.newCredentials,
      updatedAt: Date.now()
    };
    await this.saveStore(store);

    return {
      type: credential.type,
      apiKey: result.apiKey,
      env,
      oauthCredentials: result.newCredentials,
      reasoning: credential.reasoning
    };
  }

  async clearAll(): Promise<void> {
    await this.context.secrets.delete(PROVIDERS_SECRET);
    for (const key of LEGACY_SECRET_KEYS) {
      await this.context.secrets.delete(key);
    }
  }

  private async getStoredCredential(providerId: string): Promise<StoredProviderCredential | undefined> {
    return (await this.loadStore()).providers[providerId];
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
