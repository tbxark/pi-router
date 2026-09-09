import { describe, expect, it } from 'vitest';
import { LEGACY_OPENAI_CODEX_SECRET, LEGACY_PROVIDERS_SECRET, migrateLegacySecrets } from './migration';
import { parseStore } from './serialization';
import { type StoredProviderCredentials } from './types';
import { type SecretStorage } from '../test-utils/vscode';

function createMemorySecretStorage(
  seed: Record<string, string> = {}
): SecretStorage & { entries: Map<string, string> } {
  const entries = new Map(Object.entries(seed));
  return {
    entries,
    get: async (key) => entries.get(key),
    store: async (key, value) => {
      entries.set(key, value);
    },
    delete: async (key) => {
      entries.delete(key);
    }
  };
}

// migrateLegacySecrets mutates the store it is given (it writes migrated
// entries back into `store.providers`), so every test needs a fresh object.
function emptyStore(): StoredProviderCredentials {
  return { version: 1, providers: {} };
}

describe('migrateLegacySecrets', () => {
  it('folds legacy providers into an empty store and deletes the legacy key', async () => {
    const legacy = { version: 1, providers: { anthropic: { type: 'api_key', key: 'k', updatedAt: 1 } } };
    const secrets = createMemorySecretStorage({ [LEGACY_PROVIDERS_SECRET]: JSON.stringify(legacy) });
    const saved: StoredProviderCredentials[] = [];

    const store = await migrateLegacySecrets(secrets, emptyStore(), async (next) => saved.push(next), 100);

    expect(store.providers.anthropic).toMatchObject({ type: 'api_key', key: 'k' });
    expect(saved).toHaveLength(1);
    expect(secrets.entries.has(LEGACY_PROVIDERS_SECRET)).toBe(false);
  });

  it('folds the legacy openai-codex OAuth secret into a keyed entry', async () => {
    const secrets = createMemorySecretStorage({
      [LEGACY_OPENAI_CODEX_SECRET]: '{"access":"a","refresh":"r","expires":1}'
    });

    const store = await migrateLegacySecrets(secrets, emptyStore(), async () => {}, 555);

    expect(store.providers['openai-codex']).toEqual({
      type: 'oauth',
      credentials: { access: 'a', refresh: 'r', expires: 1 },
      updatedAt: 555
    });
    expect(secrets.entries.has(LEGACY_OPENAI_CODEX_SECRET)).toBe(false);
  });

  it('deletes an unparseable legacy OAuth secret without creating an entry', async () => {
    const secrets = createMemorySecretStorage({ [LEGACY_OPENAI_CODEX_SECRET]: '{broken' });

    const store = await migrateLegacySecrets(secrets, emptyStore(), async () => {}, 1);

    expect(store.providers['openai-codex']).toBeUndefined();
    expect(secrets.entries.has(LEGACY_OPENAI_CODEX_SECRET)).toBe(false);
  });

  it('does not fold legacy providers when the store already has entries', async () => {
    const existing: StoredProviderCredentials = {
      version: 1,
      providers: { openai: { type: 'api_key', key: 'k', updatedAt: 1 } }
    };
    const secrets = createMemorySecretStorage({ [LEGACY_PROVIDERS_SECRET]: '{"version":1,"providers":{}}' });

    const store = await migrateLegacySecrets(secrets, existing, async () => {}, 1);

    expect(Object.keys(store.providers)).toEqual(['openai']);
  });

  it('is idempotent once legacy keys are gone', async () => {
    const secrets = createMemorySecretStorage({ [LEGACY_PROVIDERS_SECRET]: '{"version":1,"providers":{}}' });
    const first = await migrateLegacySecrets(secrets, emptyStore(), async () => {}, 1);
    const second = await migrateLegacySecrets(secrets, first, async () => {}, 2);

    expect(second).toEqual(first);
    expect([...secrets.entries.keys()]).toEqual([]);
    expect(parseStore(undefined)).toEqual({ version: 1, providers: {} });
  });
});
