import { type PiCredential } from '@earendil-works/pi-ai';
import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { LEGACY_SECRET_KEYS } from './migration';
import { CredentialStore } from './store';
import { type SecretStorage } from '../test-utils/vscode';

function createMemorySecretStorage(): SecretStorage & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
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

function createStore(): { secrets: ReturnType<typeof createMemorySecretStorage>; store: CredentialStore } {
  const secrets = createMemorySecretStorage();
  return { secrets, store: new CredentialStore({ secrets } as vscode.ExtensionContext) };
}

function oauthCredential(access: string): PiCredential {
  return { type: 'oauth', access, refresh: 'r', expires: 1 };
}

describe('CredentialStore', () => {
  it('persists api key credentials and reports them via listProviderCredentials', async () => {
    const { store } = createStore();
    await store.modify('alpha', async () => ({ type: 'api_key', key: '  k  ', env: { FOO: 'bar' } }));

    const summaries = await store.listProviderCredentials();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ providerId: 'alpha', type: 'api_key', envKeys: ['FOO'] });
    expect(await store.read('alpha')).toEqual({ type: 'api_key', key: 'k', env: { FOO: 'bar' } });
  });

  it('preserves provider env when the credential switches to OAuth', async () => {
    const { store } = createStore();
    await store.modify('alpha', async () => ({ type: 'api_key', key: 'k', env: { FOO: 'bar' } }));
    await store.modify('alpha', async () => oauthCredential('a'));

    const summary = (await store.listProviderCredentials())[0];
    expect(summary.type).toBe('oauth');
    expect(summary.envKeys).toEqual(['FOO']);
  });

  it('applies a reasoning update and a concurrent credential refresh without losing either', async () => {
    const { store } = createStore();
    await store.modify('alpha', async () => oauthCredential('stale'));

    await Promise.all([
      store.setModelReasoning('alpha', 'model-1', 'high'),
      store.modify('alpha', async () => oauthCredential('refreshed'))
    ]);

    const settings = await store.getProviderRequestSettings('alpha');
    expect(settings?.reasoning?.['model-1']).toBe('high');
    expect(await store.read('alpha')).toMatchObject({ type: 'oauth', access: 'refreshed' });
  });

  it('ignores reasoning updates for unknown providers', async () => {
    const { store } = createStore();
    await store.setModelReasoning('ghost', 'model-1', 'high');
    expect(await store.listProviderCredentials()).toEqual([]);
  });

  it('drops the reasoning map entirely when the last override is removed', async () => {
    const { store } = createStore();
    await store.modify('alpha', async () => oauthCredential('a'));
    await store.setModelReasoning('alpha', 'model-1', 'high');
    await store.setModelReasoning('alpha', 'model-2', 'low');
    await store.setModelReasoning('alpha', 'model-1', null);
    expect((await store.listProviderCredentials())[0].reasoning).toEqual({ 'model-2': 'low' });

    await store.setModelReasoning('alpha', 'model-2', null);
    expect((await store.listProviderCredentials())[0].reasoning).toEqual({});
  });

  it('serializes overlapping modifications per provider', async () => {
    const { store } = createStore();
    const order: string[] = [];

    const first = store.modify('alpha', async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push('first');
      return oauthCredential('first');
    });
    const second = store.modify('alpha', async () => {
      order.push('second');
      return oauthCredential('second');
    });

    await Promise.all([first, second]);
    expect(order).toEqual(['first', 'second']);
    expect(await store.read('alpha')).toMatchObject({ access: 'second' });
  });

  it('keeps the modify queue usable after a failing modification', async () => {
    const { store } = createStore();
    await expect(
      store.modify('alpha', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    await store.modify('alpha', async () => oauthCredential('ok'));
    expect(await store.read('alpha')).toMatchObject({ access: 'ok' });
  });

  it('removes single providers and clears everything including legacy keys', async () => {
    const { secrets, store } = createStore();
    await store.modify('alpha', async () => oauthCredential('a'));
    await store.modify('beta', async () => oauthCredential('b'));

    await store.removeProvider('alpha');
    expect((await store.listProviderCredentials()).map((summary) => summary.providerId)).toEqual(['beta']);

    secrets.entries.set(LEGACY_SECRET_KEYS[0], '{"version":1,"providers":{}}');
    await store.clearAll();
    expect(await store.listProviderCredentials()).toEqual([]);
    expect(secrets.entries.size).toBe(0);
  });
});
