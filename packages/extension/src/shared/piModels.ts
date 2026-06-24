import {
  type AuthLoginCallbacks,
  type CredentialStore,
  type MutableModels,
  type OAuthAuth,
  type OAuthCredential,
  type Provider
} from '@earendil-works/pi-ai';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import {
  getGitHubCopilotBaseUrl,
  getOAuthProvider,
  normalizeDomain,
  type OAuthLoginCallbacks
} from '@earendil-works/pi-ai/oauth';

const EAGER_OAUTH_PROVIDER_IDS = ['anthropic', 'github-copilot', 'openai-codex'] as const;

export function createPiModels(credentials?: CredentialStore): MutableModels {
  const models = builtinModels(credentials ? { credentials } : undefined);
  for (const providerId of EAGER_OAUTH_PROVIDER_IDS) {
    const provider = models.getProvider(providerId);
    const oauth = createEagerOAuthAuth(providerId);
    if (provider && oauth) {
      models.setProvider(withOAuthAuth(provider, oauth));
    }
  }
  return models;
}

function withOAuthAuth(provider: Provider, oauth: OAuthAuth): Provider {
  return {
    ...provider,
    auth: {
      ...provider.auth,
      oauth
    }
  };
}

function createEagerOAuthAuth(providerId: string): OAuthAuth | undefined {
  const provider = getOAuthProvider(providerId);
  if (!provider) {
    return undefined;
  }

  return {
    name: provider.name,
    login: async (callbacks) => ({ ...(await provider.login(toLegacyOAuthCallbacks(callbacks))), type: 'oauth' }),
    refresh: async (credential) => ({ ...(await provider.refreshToken(credential)), type: 'oauth' }),
    toAuth: async (credential) => ({
      apiKey: provider.getApiKey(credential),
      baseUrl: resolveOAuthBaseUrl(providerId, credential)
    })
  };
}

function toLegacyOAuthCallbacks(callbacks: AuthLoginCallbacks): OAuthLoginCallbacks {
  return {
    signal: callbacks.signal,
    onAuth: (info) => callbacks.notify({ type: 'auth_url', url: info.url, instructions: info.instructions }),
    onDeviceCode: (info) => callbacks.notify({ type: 'device_code', ...info }),
    onPrompt: (prompt) => callbacks.prompt({ type: 'text', message: prompt.message, placeholder: prompt.placeholder }),
    onProgress: (message) => callbacks.notify({ type: 'progress', message }),
    onManualCodeInput: () =>
      callbacks.prompt({
        type: 'manual_code',
        message: 'Complete login in your browser, or paste the authorization code / redirect URL here:'
      }),
    onSelect: (prompt) =>
      callbacks.prompt({
        type: 'select',
        message: prompt.message,
        options: prompt.options
      })
  };
}

function resolveOAuthBaseUrl(providerId: string, credential: OAuthCredential): string | undefined {
  if (providerId !== 'github-copilot') {
    return undefined;
  }

  const enterpriseUrl = credential.enterpriseUrl;
  const enterpriseDomain =
    typeof enterpriseUrl === 'string' && enterpriseUrl ? (normalizeDomain(enterpriseUrl) ?? undefined) : undefined;
  return getGitHubCopilotBaseUrl(credential.access, enterpriseDomain);
}
