// Message contract for the config-panel webview (extension side).
//
// This is the extension half of a contract duplicated in the webview package
// (`WebviewMessage`/`ExtensionMessage` in
// packages/config-panel/src/types/messages.ts). Keep both in sync when adding
// messages — this file is the single place to look on the extension side.

export type ConfigMessage =
  | { type: 'ready' }
  | { type: 'saveApiKey'; providerId: string; apiKey?: unknown; envText?: unknown }
  | { type: 'loginOAuth'; providerId: string }
  | { type: 'removeProvider'; providerId: string }
  | { type: 'saveModelReasoning'; providerId: string; modelId: string; level: string }
  | { type: 'clearCredentials' }
  | { type: 'oauthPromptResponse'; value: string }
  | { type: 'oauthSelectResponse'; id: string }
  | { type: 'oauthManualCodeResponse'; value: string }
  | { type: 'oauthOpenUrl'; url: string };

export function isConfigMessage(value: unknown): value is ConfigMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }

  const message = value as Record<string, unknown>;
  const type = String(message.type);

  if (type === 'ready' || type === 'clearCredentials') {
    return true;
  }

  if (type === 'oauthPromptResponse' && typeof message.value === 'string') {
    return true;
  }

  if (type === 'oauthSelectResponse' && typeof message.id === 'string') {
    return true;
  }

  if (type === 'oauthManualCodeResponse' && typeof message.value === 'string') {
    return true;
  }

  if (type === 'oauthOpenUrl' && typeof message.url === 'string') {
    return true;
  }

  if (
    type === 'saveModelReasoning' &&
    typeof message.providerId === 'string' &&
    typeof message.modelId === 'string' &&
    typeof message.level === 'string'
  ) {
    return true;
  }

  return ['saveApiKey', 'loginOAuth', 'removeProvider'].includes(type) && typeof message.providerId === 'string';
}
