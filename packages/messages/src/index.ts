/** State the extension sends to the webview on connect / refresh. */
export interface PanelState {
  providers: ProviderOption[];
  configured: ConfiguredProvider[];
  oauthProviderIds: string[];
  logLevel: LogLevel;
}

export type LogLevel = 'off' | 'error' | 'info' | 'debug';

export interface ProviderOption {
  id: string;
  label: string;
  modelCount: number;
  sampleModels: string[];
  oauthName?: string;
  apiKeyEnvVars: string[];
  envHints: string[];
}

export interface ReasoningModelInfo {
  id: string;
  name: string;
  /** Supported thinking levels excluding `off`, in pi-ai's canonical order. */
  supportedLevels: string[];
  /** The currently effective level: `off` or one of supportedLevels. Defaults to `medium`. */
  configuredLevel: string;
}

export interface ConfiguredProvider {
  id: string;
  label: string;
  authType: 'api_key' | 'oauth';
  hasKey: boolean;
  envKeys: string[];
  modelCount: number;
  reasoningModels: ReasoningModelInfo[];
}

// ── Webview → Extension ──────────────────────────────────────────────

export interface ReadyMessage {
  type: 'ready';
}

export interface SaveApiKeyMessage {
  type: 'saveApiKey';
  providerId: string;
  apiKey: string;
  envText: string;
}

export interface LoginOAuthMessage {
  type: 'loginOAuth';
  providerId: string;
}

export interface RemoveProviderMessage {
  type: 'removeProvider';
  providerId: string;
}

export interface ClearCredentialsMessage {
  type: 'clearCredentials';
}

export interface SaveLogLevelMessage {
  type: 'saveLogLevel';
  level: LogLevel;
}

export interface SaveModelReasoningMessage {
  type: 'saveModelReasoning';
  providerId: string;
  modelId: string;
  level: string;
}

export interface OAuthPromptResponseMessage {
  type: 'oauthPromptResponse';
  value: string;
}

export interface OAuthSelectResponseMessage {
  type: 'oauthSelectResponse';
  id: string;
}

export interface OAuthManualCodeResponseMessage {
  type: 'oauthManualCodeResponse';
  value: string;
}

export interface OAuthOpenUrlMessage {
  type: 'oauthOpenUrl';
  url: string;
}

export type WebviewMessage =
  | ReadyMessage
  | SaveApiKeyMessage
  | LoginOAuthMessage
  | RemoveProviderMessage
  | ClearCredentialsMessage
  | SaveLogLevelMessage
  | SaveModelReasoningMessage
  | OAuthPromptResponseMessage
  | OAuthSelectResponseMessage
  | OAuthManualCodeResponseMessage
  | OAuthOpenUrlMessage;

// ── Extension → Webview ──────────────────────────────────────────────

export interface StateMessage {
  type: 'state';
  state: PanelState;
}

export interface ErrorMessage {
  type: 'error';
  error: string;
}

export interface OAuthAuthMessage {
  type: 'oauthAuth';
  providerId: string;
  url: string;
  instructions?: string;
}

export interface OAuthDeviceCodeMessage {
  type: 'oauthDeviceCode';
  providerId: string;
  userCode: string;
  verificationUri: string;
}

export interface OAuthPromptMessage {
  type: 'oauthPrompt';
  providerId: string;
  message: string;
  placeholder?: string;
  allowEmpty?: boolean;
}

export interface OAuthSelectMessage {
  type: 'oauthSelect';
  providerId: string;
  message: string;
  options: { id: string; label: string }[];
}

export interface OAuthManualCodeInputMessage {
  type: 'oauthManualCodeInput';
  providerId: string;
}

export interface OAuthProgressMessage {
  type: 'oauthProgress';
  providerId: string;
  message: string;
}

export interface OAuthDoneMessage {
  type: 'oauthDone';
  providerId: string;
}

export type ExtensionMessage =
  | StateMessage
  | ErrorMessage
  | OAuthAuthMessage
  | OAuthDeviceCodeMessage
  | OAuthPromptMessage
  | OAuthSelectMessage
  | OAuthManualCodeInputMessage
  | OAuthProgressMessage
  | OAuthDoneMessage;

export function isWebviewMessage(value: unknown): value is WebviewMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }

  const message = value as Record<string, unknown>;

  switch (message.type) {
    case 'ready':
    case 'clearCredentials':
      return true;

    case 'saveLogLevel':
      return (
        message.level === 'off' || message.level === 'error' || message.level === 'info' || message.level === 'debug'
      );

    case 'saveApiKey':
      return (
        typeof message.providerId === 'string' &&
        typeof message.apiKey === 'string' &&
        typeof message.envText === 'string'
      );

    case 'loginOAuth':
    case 'removeProvider':
      return typeof message.providerId === 'string';

    case 'saveModelReasoning':
      return (
        typeof message.providerId === 'string' &&
        typeof message.modelId === 'string' &&
        typeof message.level === 'string'
      );

    case 'oauthPromptResponse':
    case 'oauthManualCodeResponse':
      return typeof message.value === 'string';

    case 'oauthSelectResponse':
      return typeof message.id === 'string';

    case 'oauthOpenUrl':
      return typeof message.url === 'string';

    default:
      return false;
  }
}

export const isConfigMessage = isWebviewMessage;
