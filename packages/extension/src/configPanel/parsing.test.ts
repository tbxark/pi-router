import { describe, expect, it } from 'vitest';
import { normalizeReasoningLevel, parseEnvText } from './parsing';

describe('parseEnvText', () => {
  it('parses KEY=value lines, ignoring blanks and comments', () => {
    expect(parseEnvText('A=1\n\n# comment\n  B = 2  \n')).toEqual({ A: '1', B: '2' });
  });

  it('keeps separators inside the value', () => {
    expect(parseEnvText('URL=https://example.com?a=b')).toEqual({ URL: 'https://example.com?a=b' });
  });

  it('lets later duplicate keys win', () => {
    expect(parseEnvText('A=1\nA=2')).toEqual({ A: '2' });
  });

  it('returns an empty env for empty input', () => {
    expect(parseEnvText('')).toEqual({});
    expect(parseEnvText('# only a comment')).toEqual({});
  });

  it('rejects lines without a separator, empty keys, and non-uppercase keys', () => {
    expect(() => parseEnvText('NOEQ')).toThrow('Invalid env line');
    expect(() => parseEnvText('=value')).toThrow('Invalid env line');
    expect(() => parseEnvText('lower=1')).toThrow('Invalid env key');
  });
});

describe('normalizeReasoningLevel', () => {
  it('passes known thinking levels through, including off', () => {
    expect(normalizeReasoningLevel('high')).toBe('high');
    expect(normalizeReasoningLevel('off')).toBe('off');
    expect(normalizeReasoningLevel('minimal')).toBe('minimal');
  });

  it('maps unknown values to null so the default level applies', () => {
    expect(normalizeReasoningLevel('maximum')).toBeNull();
  });
});
