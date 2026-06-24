import { type ProviderEnv } from '@earendil-works/pi-ai';
import { type OAuthCredentials } from '@earendil-works/pi-ai';
import { type StoredProviderCredentials } from './types';

export function parseStore(raw: string | undefined): StoredProviderCredentials {
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
