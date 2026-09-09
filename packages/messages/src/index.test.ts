import { describe, expect, it } from 'vitest';
import { isWebviewMessage } from './index';

describe('isWebviewMessage', () => {
  it('accepts valid messages', () => {
    const valid: unknown[] = [
      { type: 'ready' },
      { type: 'clearCredentials' },
      { type: 'saveLogLevel', level: 'debug' },
      { type: 'saveApiKey', providerId: 'p', apiKey: 'k', envText: 'A=1' },
      { type: 'loginOAuth', providerId: 'p' },
      { type: 'removeProvider', providerId: 'p' },
      { type: 'saveModelReasoning', providerId: 'p', modelId: 'm', level: 'high' },
      { type: 'oauthPromptResponse', value: 'v' },
      { type: 'oauthSelectResponse', id: 'opt' },
      { type: 'oauthManualCodeResponse', value: 'v' },
      { type: 'oauthOpenUrl', url: 'https://example.com' },
      { type: 'oauthCancel', providerId: 'p' },
      { type: 'confirmAction', requestId: 'r', message: 'm', confirmLabel: 'OK' }
    ];

    for (const message of valid) {
      expect(isWebviewMessage(message), JSON.stringify(message)).toBe(true);
    }
  });

  it('rejects messages with missing or mistyped fields', () => {
    const invalid: unknown[] = [
      { type: 'saveLogLevel', level: 'verbose' },
      { type: 'saveApiKey', providerId: 'p', apiKey: 'k' },
      { type: 'loginOAuth' },
      { type: 'removeProvider', providerId: 42 },
      { type: 'saveModelReasoning', providerId: 'p', modelId: 'm' },
      { type: 'oauthPromptResponse' },
      { type: 'oauthSelectResponse', id: 1 },
      { type: 'oauthOpenUrl' },
      { type: 'oauthCancel' },
      { type: 'confirmAction', requestId: 'r', message: 'm' }
    ];

    for (const message of invalid) {
      expect(isWebviewMessage(message), JSON.stringify(message)).toBe(false);
    }
  });

  it('rejects non-messages', () => {
    const invalid: unknown[] = [null, undefined, 42, 'ready', {}, { type: 'unknown' }];

    for (const message of invalid) {
      expect(isWebviewMessage(message)).toBe(false);
    }
  });
});
