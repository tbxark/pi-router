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

export type WebviewMessage =
  | ReadyMessage
  | SaveApiKeyMessage
  | LoginOAuthMessage
  | RemoveProviderMessage
  | ClearCredentialsMessage;

// ── Extension → Webview ──────────────────────────────────────────────

export interface StateMessage {
  type: 'state';
  state: PanelState;
}

export interface ErrorMessage {
  type: 'error';
  error: string;
}

export type ExtensionMessage = StateMessage | ErrorMessage;
