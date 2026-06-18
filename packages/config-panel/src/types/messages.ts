/** State the extension sends to the webview on connect / refresh. */
export interface PanelState {
  providers: ProviderOption[];
  configured: ConfiguredProvider[];
  oauthProviderIds: string[];
}

export interface ProviderOption {
  id: string;
  label: string;
  modelCount: number;
  sampleModels: string[];
  oauthName?: string;
  apiKeyEnvVars: string[];
  envHints: string[];
}

export interface ConfiguredProvider {
  id: string;
  label: string;
  authType: 'api_key' | 'oauth';
  hasKey: boolean;
  envKeys: string[];
  modelCount: number;
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
