import * as vscode from 'vscode';
import { parseOAuthCredentials, parseStore } from './serialization';
import { type StoredProviderCredentials } from './types';

const LEGACY_PROVIDERS_SECRET = 'piModelProvider.providers.v1';
const LEGACY_CUSTOM_API_KEY_SECRET = 'piModelProvider.custom.apiKey';
const LEGACY_OPENAI_CODEX_SECRET = 'piModelProvider.oauth.openai-codex';
const OPENAI_CODEX_PROVIDER_ID = 'openai-codex';

// Legacy secret keys that predate the `piRouter.*` namespace. Cleared alongside
// the current store on `clearAll`.
export const LEGACY_SECRET_KEYS = [
  LEGACY_PROVIDERS_SECRET,
  LEGACY_CUSTOM_API_KEY_SECRET,
  LEGACY_OPENAI_CODEX_SECRET
] as const;

// One-time migration from legacy secret keys into the current store. Reads (and
// deletes) any legacy secrets, folding them into `store`, persisting through
// `save` as it goes. Returns the (possibly replaced) store.
export async function migrateLegacySecrets(
  secrets: vscode.SecretStorage,
  store: StoredProviderCredentials,
  save: (store: StoredProviderCredentials) => Promise<void>,
  now: number
): Promise<StoredProviderCredentials> {
  if (Object.keys(store.providers).length === 0) {
    const legacyProviders = await secrets.get(LEGACY_PROVIDERS_SECRET);
    if (legacyProviders) {
      store = parseStore(legacyProviders);
      await save(store);
      await secrets.delete(LEGACY_PROVIDERS_SECRET);
    }
  }

  if (!store.providers[OPENAI_CODEX_PROVIDER_ID]) {
    const legacyOpenAI = await secrets.get(LEGACY_OPENAI_CODEX_SECRET);
    if (legacyOpenAI) {
      const credentials = parseOAuthCredentials(legacyOpenAI);
      if (credentials) {
        store.providers[OPENAI_CODEX_PROVIDER_ID] = {
          type: 'oauth',
          credentials,
          updatedAt: now
        };
        await save(store);
      }
      await secrets.delete(LEGACY_OPENAI_CODEX_SECRET);
    }
  }

  return store;
}
