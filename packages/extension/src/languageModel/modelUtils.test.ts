import { type Api, type Model } from '@earendil-works/pi-ai';
import { describe, expect, it } from 'vitest';
import { decodeLanguageModelId, encodeLanguageModelId, resolveReasoningLevel } from './modelUtils';

function makeModel(overrides: Partial<Model<Api>> = {}): Model<Api> {
  return {
    id: 'model-1',
    name: 'Model 1',
    api: 'openai-completions',
    provider: 'test-provider',
    baseUrl: 'https://example.com',
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1000,
    maxTokens: 100,
    ...overrides
  } as Model<Api>;
}

describe('language model id encoding', () => {
  it('round-trips provider/model pairs', () => {
    const id = encodeLanguageModelId('openrouter', 'anthropic/claude-3');
    expect(id).toBe('openrouter/anthropic/claude-3');
    expect(decodeLanguageModelId(id)).toEqual({ providerId: 'openrouter', modelId: 'anthropic/claude-3' });
  });

  it('returns undefined for ids without a separator or with a leading one', () => {
    expect(decodeLanguageModelId('no-separator')).toBeUndefined();
    expect(decodeLanguageModelId('/leading')).toBeUndefined();
    expect(decodeLanguageModelId('')).toBeUndefined();
  });
});

describe('resolveReasoningLevel', () => {
  it('omits thinking for models without reasoning support', () => {
    expect(resolveReasoningLevel(makeModel({ reasoning: false }), 'high')).toBeUndefined();
  });

  it('defaults reasoning-capable models to medium', () => {
    expect(resolveReasoningLevel(makeModel(), undefined)).toBe('medium');
  });

  it('omits thinking when configured off', () => {
    expect(resolveReasoningLevel(makeModel(), 'off')).toBeUndefined();
  });

  it('honors a configured level the model supports', () => {
    expect(resolveReasoningLevel(makeModel(), 'minimal')).toBe('minimal');
  });

  it('steps down from an unsupported xhigh even when explicitly configured', () => {
    const model = makeModel({ thinkingLevelMap: { xhigh: null } });
    expect(resolveReasoningLevel(model, 'xhigh')).toBe('high');
  });

  it('steps down to high when xhigh is not mapped for the model', () => {
    expect(resolveReasoningLevel(makeModel(), 'xhigh')).toBe('high');
  });
});
