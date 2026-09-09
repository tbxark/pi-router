import { describe, expect, it } from 'vitest';
import { normalizeEnv, parseOAuthCredentials, parseStore } from './serialization';

const VALID_STORE = {
  version: 1,
  providers: {
    anthropic: {
      type: 'api_key',
      key: 'sk-test',
      env: { ANTHROPIC_BASE_URL: 'https://example.com' },
      reasoning: { 'claude-3': 'high' },
      updatedAt: 123
    },
    'openai-codex': {
      type: 'oauth',
      credentials: { access: 'a', refresh: 'r', expires: 456 },
      updatedAt: 789
    }
  }
};

describe('parseStore', () => {
  it('returns an empty store for undefined input', () => {
    expect(parseStore(undefined)).toEqual({ version: 1, providers: {} });
  });

  it('returns an empty store for invalid JSON', () => {
    expect(parseStore('{not json')).toEqual({ version: 1, providers: {} });
  });

  it('round-trips valid api_key and oauth entries', () => {
    const store = parseStore(JSON.stringify(VALID_STORE));
    expect(store.version).toBe(1);
    expect(Object.keys(store.providers).sort()).toEqual(['anthropic', 'openai-codex']);
    expect(store.providers.anthropic).toMatchObject({ type: 'api_key', key: 'sk-test' });
    expect(store.providers['openai-codex']).toMatchObject({ type: 'oauth' });
  });

  it('rejects an array or non-object providers field', () => {
    expect(parseStore(JSON.stringify({ version: 1, providers: [] })).providers).toEqual({});
    expect(parseStore(JSON.stringify({ version: 1, providers: 'nope' })).providers).toEqual({});
    expect(parseStore(JSON.stringify({})).providers).toEqual({});
  });

  it('drops malformed entries instead of loading them', () => {
    const raw = JSON.stringify({
      version: 1,
      providers: {
        'missing-updated-at': { type: 'api_key', key: 'k' },
        'bad-type': { type: 'something-else', updatedAt: 1 },
        'oauth-without-credentials': { type: 'oauth', updatedAt: 1 },
        'not-an-object': 42,
        valid: { type: 'api_key', key: 'k', updatedAt: 1 }
      }
    });

    const store = parseStore(raw);
    expect(Object.keys(store.providers)).toEqual(['valid']);
  });
});

describe('parseOAuthCredentials', () => {
  it('parses a valid credentials object', () => {
    expect(parseOAuthCredentials('{"access":"a","refresh":"r","expires":1}')).toEqual({
      access: 'a',
      refresh: 'r',
      expires: 1
    });
  });

  it('returns undefined for invalid JSON or non-objects', () => {
    expect(parseOAuthCredentials('{nope')).toBeUndefined();
    expect(parseOAuthCredentials('null')).toBeUndefined();
    expect(parseOAuthCredentials('"str"')).toBeUndefined();
  });
});

describe('normalizeEnv', () => {
  it('trims keys and values and drops empty entries', () => {
    expect(normalizeEnv({ ' A ': ' 1 ', B: '', '  ': 'x', C: '  ' })).toEqual({ A: '1' });
  });
});
