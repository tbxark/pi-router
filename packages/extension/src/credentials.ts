import * as vscode from 'vscode';
import { getEnvApiKey, type ProviderEnv } from '@earendil-works/pi-ai';
import {
  getOAuthApiKey,
  getOAuthProvider,
  type OAuthCredentials,
  type OAuthDeviceCodeInfo,
  type OAuthSelectPrompt
} from '@earendil-works/pi-ai/oauth';

const PROVIDERS_SECRET = 'piRouter.providers.v1';
const LEGACY_PROVIDERS_SECRET = 'piModelProvider.providers.v1';
const LEGACY_CUSTOM_API_KEY_SECRET = 'piModelProvider.custom.apiKey';
const LEGACY_OPENAI_CODEX_SECRET = 'piModelProvider.oauth.openai-codex';
const OPENAI_CODEX_PROVIDER_ID = 'openai-codex';

type StoredProviderCredential = StoredApiKeyCredential | StoredOAuthCredential;

interface StoredApiKeyCredential {
  type: 'api_key';
  key?: string;
  env?: ProviderEnv;
  updatedAt: number;
}

interface StoredOAuthCredential {
  type: 'oauth';
  credentials: OAuthCredentials;
  env?: ProviderEnv;
  updatedAt: number;
}

interface StoredProviderCredentials {
  version: 1;
  providers: Record<string, StoredProviderCredential>;
}

export interface ProviderCredentialSummary {
  providerId: string;
  type: StoredProviderCredential['type'];
  hasKey: boolean;
  envKeys: string[];
  updatedAt: number;
}

export interface ResolvedProviderCredentials {
  type: StoredProviderCredential['type'];
  apiKey?: string;
  env: ProviderEnv;
  oauthCredentials?: OAuthCredentials;
}

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
      updatedAt: Date.now()
    };
    await this.saveStore(store);
  }

  async loginOAuthProvider(providerId: string): Promise<void> {
    const provider = getOAuthProvider(providerId);
    if (!provider) {
      throw new Error(`pi-ai OAuth provider is not available for ${providerId}.`);
    }

    const existingEnv = (await this.getStoredCredential(providerId))?.env ?? {};
    const credentials = await provider.login(createOAuthCallbacks(provider.name));
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
        env
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
      oauthCredentials: result.newCredentials
    };
  }

  async clearAll(): Promise<void> {
    await this.context.secrets.delete(PROVIDERS_SECRET);
    await this.context.secrets.delete(LEGACY_PROVIDERS_SECRET);
    await this.context.secrets.delete(LEGACY_CUSTOM_API_KEY_SECRET);
    await this.context.secrets.delete(LEGACY_OPENAI_CODEX_SECRET);
  }

  private async getStoredCredential(providerId: string): Promise<StoredProviderCredential | undefined> {
    return (await this.loadStore()).providers[providerId];
  }

  private async loadStore(): Promise<StoredProviderCredentials> {
    const raw = await this.context.secrets.get(PROVIDERS_SECRET);
    let store = parseStore(raw);

    if (Object.keys(store.providers).length === 0) {
      const legacyProviders = await this.context.secrets.get(LEGACY_PROVIDERS_SECRET);
      if (legacyProviders) {
        store = parseStore(legacyProviders);
        await this.saveStore(store);
        await this.context.secrets.delete(LEGACY_PROVIDERS_SECRET);
      }
    }

    if (!store.providers[OPENAI_CODEX_PROVIDER_ID]) {
      const legacyOpenAI = await this.context.secrets.get(LEGACY_OPENAI_CODEX_SECRET);
      if (legacyOpenAI) {
        const credentials = parseOAuthCredentials(legacyOpenAI);
        if (credentials) {
          store.providers[OPENAI_CODEX_PROVIDER_ID] = {
            type: 'oauth',
            credentials,
            updatedAt: Date.now()
          };
          await this.saveStore(store);
        }
        await this.context.secrets.delete(LEGACY_OPENAI_CODEX_SECRET);
      }
    }

    return store;
  }

  private async saveStore(store: StoredProviderCredentials): Promise<void> {
    await this.context.secrets.store(PROVIDERS_SECRET, JSON.stringify(store));
  }
}

function parseStore(raw: string | undefined): StoredProviderCredentials {
  if (!raw) {
    return { version: 1, providers: {} };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredProviderCredentials>;
    return {
      version: 1,
      providers: parsed.providers && typeof parsed.providers === 'object' ? parsed.providers : {}
    };
  } catch {
    return { version: 1, providers: {} };
  }
}

function parseOAuthCredentials(raw: string): OAuthCredentials | undefined {
  try {
    const parsed = JSON.parse(raw) as OAuthCredentials;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function normalizeEnv(env: ProviderEnv): ProviderEnv {
  return Object.fromEntries(
    Object.entries(env)
      .map(([key, value]) => [key.trim(), value.trim()])
      .filter(([key, value]) => key && value)
  );
}

function createOAuthCallbacks(providerName: string) {
  return {
    onAuth: (info: { url: string; instructions?: string }) => {
      void vscode.env.openExternal(vscode.Uri.parse(info.url));
      void vscode.window.showInformationMessage(info.instructions ?? `Complete ${providerName} login in the browser.`);
    },
    onDeviceCode: (info: OAuthDeviceCodeInfo) => {
      void vscode.env.clipboard.writeText(info.userCode);
      void vscode.window
        .showInformationMessage(`${providerName} device code copied: ${info.userCode}`, 'Open Login Page')
        .then((choice) => {
          if (choice === 'Open Login Page') {
            void vscode.env.openExternal(vscode.Uri.parse(info.verificationUri));
          }
        });
    },
    onPrompt: async (prompt: { message: string; placeholder?: string; allowEmpty?: boolean }) => {
      const value = await vscode.window.showInputBox({
        prompt: prompt.message,
        placeHolder: prompt.placeholder,
        ignoreFocusOut: true
      });
      if (!value && !prompt.allowEmpty) {
        throw new Error('Login cancelled.');
      }
      return value ?? '';
    },
    onManualCodeInput: async () => {
      const value = await vscode.window.showInputBox({
        prompt: `Paste the ${providerName} authorization code or full redirect URL.`,
        ignoreFocusOut: true
      });
      if (!value) {
        throw new Error('Login cancelled.');
      }
      return value;
    },
    onSelect: async (prompt: OAuthSelectPrompt) => {
      const picked = await vscode.window.showQuickPick(
        prompt.options.map((option) => ({ label: option.label, id: option.id })),
        { placeHolder: prompt.message, ignoreFocusOut: true }
      );
      return picked?.id;
    },
    onProgress: (message: string) => {
      void vscode.window.setStatusBarMessage(message, 5000);
    }
  };
}
