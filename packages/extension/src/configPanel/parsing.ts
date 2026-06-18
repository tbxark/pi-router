import { type ModelThinkingLevel, type ProviderEnv } from '@earendil-works/pi-ai';

const THINKING_LEVELS: readonly ModelThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

function isThinkingLevel(value: string): value is ModelThinkingLevel {
  return (THINKING_LEVELS as readonly string[]).includes(value);
}

// Maps a level string from the webview to a stored value. Unknown values reset the
// override (null) so the model falls back to the default `medium`.
export function normalizeReasoningLevel(level: string): ModelThinkingLevel | null {
  return isThinkingLevel(level) ? level : null;
}

export function parseEnvText(text: string): ProviderEnv {
  const env: ProviderEnv = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator <= 0) {
      throw new Error(`Invalid env line: ${line}`);
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) {
      throw new Error(`Invalid env key: ${key}`);
    }
    env[key] = value;
  }
  return env;
}
