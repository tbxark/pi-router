import { type ProviderEnv } from '@earendil-works/pi-ai';
import { type OAuthCredentials } from '@earendil-works/pi-ai';
import { type StoredProviderCredential, type StoredProviderCredentials } from './types';

export function parseStore(raw: string | undefined): StoredProviderCredentials {
  if (!raw) {
    return { version: 1, providers: {} };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredProviderCredentials>;
    const rawProviders = parsed.providers;
    if (typeof rawProviders !== 'object' || rawProviders === null || Array.isArray(rawProviders)) {
      return { version: 1, providers: {} };
    }

    const providers: Record<string, StoredProviderCredential> = {};
    for (const [providerId, entry] of Object.entries(rawProviders)) {
      const credential = parseProviderCredential(entry);
      if (credential) {
        providers[providerId] = credential;
      }
    }
    return { version: 1, providers };
  } catch {
    return { version: 1, providers: {} };
  }
}

// A corrupted entry (hand-edited or partially written blob) is dropped rather
// than flowing into credential reads, where missing fields fail late and
// confusingly.
function parseProviderCredential(value: unknown): StoredProviderCredential | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const entry = value as Record<string, unknown>;
  if (entry.type !== 'api_key' && entry.type !== 'oauth') {
    return undefined;
  }
  if (typeof entry.updatedAt !== 'number') {
    return undefined;
  }
  if (entry.type === 'oauth' && (typeof entry.credentials !== 'object' || entry.credentials === null)) {
    return undefined;
  }

  return value as StoredProviderCredential;
}

export function parseOAuthCredentials(raw: string): OAuthCredentials | undefined {
  try {
    const parsed = JSON.parse(raw) as OAuthCredentials;
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeEnv(env: ProviderEnv): ProviderEnv {
  return Object.fromEntries(
    Object.entries(env)
      .map(([key, value]) => [key.trim(), value.trim()])
      .filter(([key, value]) => key && value)
  );
}
