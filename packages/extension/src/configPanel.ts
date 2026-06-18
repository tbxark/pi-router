import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as vscode from 'vscode';
import {
  clampThinkingLevel,
  getModels,
  getProviders,
  getSupportedThinkingLevels,
  type Api,
  type KnownProvider,
  type Model,
  type ModelThinkingLevel,
  type ProviderEnv
} from '@earendil-works/pi-ai';
import { getOAuthProviders } from '@earendil-works/pi-ai/oauth';
import { CredentialStore } from './credentials';
import { PiLanguageModelProvider } from './provider';
import { getProviderApiKeyEnvVars, getProviderDisplayName, getProviderEnvHints } from './providerMetadata';

export function openConfigPanel(
  context: vscode.ExtensionContext,
  credentials: CredentialStore,
  provider: PiLanguageModelProvider
): void {
  const panel = vscode.window.createWebviewPanel(
    'piRouter.configure',
    'Pi Router Providers',
    vscode.ViewColumn.Active,
    { enableScripts: true }
  );

  const nonce = randomUUID();
  const webviewDist = vscode.Uri.joinPath(context.extensionUri, 'out', 'webview');
  panel.webview.options = {
    enableScripts: true,
    localResourceRoots: [webviewDist]
  };
  panel.webview.html = getHtml(panel.webview, webviewDist, nonce);
  const disposables: vscode.Disposable[] = [];
  panel.onDidDispose(() => vscode.Disposable.from(...disposables).dispose());

  async function postState(): Promise<void> {
    await panel.webview.postMessage({ type: 'state', state: await getPanelState(credentials) });
  }

  // OAuth-in-webview state: resolvers that bridge async callbacks → webview messages
  let oauthResolver: ((value: string) => void) | null = null;

  disposables.push(
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      try {
        if (!isConfigMessage(message)) {
          return;
        }

        switch (message.type) {
          case 'ready':
            await postState();
            break;

          case 'saveApiKey':
            await credentials.setProviderApiKey(
              message.providerId,
              String(message.apiKey ?? ''),
              parseEnvText(String(message.envText ?? ''))
            );
            provider.refreshModels();
            await postState();
            break;

          case 'loginOAuth':
            await credentials.loginOAuthProviderWithCallbacks(message.providerId, {
              onAuth: (info: { url: string; instructions?: string }) => {
                void panel.webview.postMessage({
                  type: 'oauthAuth',
                  providerId: message.providerId,
                  url: info.url,
                  instructions: info.instructions
                });
                void vscode.env.openExternal(vscode.Uri.parse(info.url));
              },
              onDeviceCode: (info: { userCode: string; verificationUri: string }) => {
                void panel.webview.postMessage({
                  type: 'oauthDeviceCode',
                  providerId: message.providerId,
                  userCode: info.userCode,
                  verificationUri: info.verificationUri
                });
              },
              onPrompt: async (prompt: { message: string; placeholder?: string; allowEmpty?: boolean }) => {
                return new Promise<string>((resolve) => {
                  oauthResolver = resolve;
                  void panel.webview.postMessage({
                    type: 'oauthPrompt',
                    providerId: message.providerId,
                    message: prompt.message,
                    placeholder: prompt.placeholder,
                    allowEmpty: prompt.allowEmpty
                  });
                });
              },
              onSelect: async (prompt: { message: string; options: { id: string; label: string }[] }) => {
                return new Promise<string>((resolve) => {
                  oauthResolver = resolve;
                  void panel.webview.postMessage({
                    type: 'oauthSelect',
                    providerId: message.providerId,
                    message: prompt.message,
                    options: prompt.options
                  });
                });
              },
              onManualCodeInput: async () => {
                return new Promise<string>((resolve) => {
                  oauthResolver = resolve;
                  void panel.webview.postMessage({
                    type: 'oauthManualCodeInput',
                    providerId: message.providerId
                  });
                });
              },
              onProgress: (msg: string) => {
                void panel.webview.postMessage({
                  type: 'oauthProgress',
                  providerId: message.providerId,
                  message: msg
                });
              }
            });
            provider.refreshModels();
            await postState();
            void panel.webview.postMessage({ type: 'oauthDone', providerId: message.providerId });
            break;

          case 'oauthPromptResponse':
            oauthResolver?.(message.value);
            oauthResolver = null;
            break;

          case 'oauthSelectResponse':
            oauthResolver?.(message.id);
            oauthResolver = null;
            break;

          case 'oauthManualCodeResponse':
            oauthResolver?.(message.value);
            oauthResolver = null;
            break;

          case 'oauthOpenUrl':
            void vscode.env.openExternal(vscode.Uri.parse(message.url));
            break;

          case 'removeProvider':
            if (
              !(await confirmDangerousAction(
                `Remove ${getProviderDisplayName(message.providerId)} and delete its saved credentials? This cannot be undone.`,
                'Remove'
              ))
            ) {
              return;
            }

            await credentials.removeProvider(message.providerId);
            provider.refreshModels();
            await postState();
            break;

          case 'saveModelReasoning':
            await credentials.setModelReasoning(
              message.providerId,
              message.modelId,
              normalizeReasoningLevel(message.level)
            );
            provider.refreshModels();
            await postState();
            break;

          case 'clearCredentials':
            if (
              !(await confirmDangerousAction(
                'Clear all saved Pi Router credentials? This cannot be undone.',
                'Clear All'
              ))
            ) {
              return;
            }

            await credentials.clearAll();
            provider.refreshModels();
            await postState();
            break;
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        await panel.webview.postMessage({ type: 'error', error: text });
      }
    }, undefined)
  );
}

interface ProviderOption {
  id: string;
  label: string;
  modelCount: number;
  sampleModels: string[];
  oauthName?: string;
  apiKeyEnvVars: string[];
  envHints: string[];
}

interface ReasoningModelInfo {
  id: string;
  name: string;
  // Supported thinking levels excluding `off`, in pi-ai's canonical order.
  supportedLevels: string[];
  // The currently effective level: `off` or one of supportedLevels. Defaults to `medium`.
  configuredLevel: string;
}

interface ConfiguredProvider {
  id: string;
  label: string;
  authType: 'api_key' | 'oauth';
  hasKey: boolean;
  envKeys: string[];
  modelCount: number;
  reasoningModels: ReasoningModelInfo[];
}

interface PanelState {
  providers: ProviderOption[];
  configured: ConfiguredProvider[];
  oauthProviderIds: string[];
}

type ConfigMessage =
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

function isConfigMessage(value: unknown): value is ConfigMessage {
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

const THINKING_LEVELS: readonly ModelThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

function isThinkingLevel(value: string): value is ModelThinkingLevel {
  return (THINKING_LEVELS as readonly string[]).includes(value);
}

// Maps a level string from the webview to a stored value. Unknown values reset the
// override (null) so the model falls back to the default `medium`.
function normalizeReasoningLevel(level: string): ModelThinkingLevel | null {
  return isThinkingLevel(level) ? level : null;
}

async function confirmDangerousAction(message: string, confirmLabel: string): Promise<boolean> {
  const selected = await vscode.window.showWarningMessage(message, { modal: true }, confirmLabel);
  return selected === confirmLabel;
}

async function getPanelState(credentials: CredentialStore): Promise<PanelState> {
  const oauthProviders = new Map(getOAuthProviders().map((oauthProvider) => [oauthProvider.id, oauthProvider]));
  const providers = getProviders()
    .map((providerId) => {
      const models = getModels(providerId as KnownProvider);
      return {
        id: providerId,
        label: getProviderDisplayName(providerId),
        modelCount: models.length,
        sampleModels: models.slice(0, 6).map((model) => model.name),
        oauthName: oauthProviders.get(providerId)?.name,
        apiKeyEnvVars: getProviderApiKeyEnvVars(providerId),
        envHints: getProviderEnvHints(providerId)
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const configured = (await credentials.listProviderCredentials())
    .map((summary) => {
      const models = getModels(summary.providerId as KnownProvider);
      return {
        id: summary.providerId,
        label: getProviderDisplayName(summary.providerId),
        authType: summary.type,
        hasKey: summary.hasKey,
        envKeys: summary.envKeys,
        modelCount: models.length,
        reasoningModels: buildReasoningModels(models as Model<Api>[], summary.reasoning)
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    providers,
    configured,
    oauthProviderIds: Array.from(oauthProviders.keys())
  };
}

function buildReasoningModels(
  models: Model<Api>[],
  reasoning: Record<string, ModelThinkingLevel>
): ReasoningModelInfo[] {
  return models
    .filter((model) => model.reasoning)
    .map((model) => {
      const supportedLevels = getSupportedThinkingLevels(model).filter((level) => level !== 'off');
      const stored = reasoning[model.id];
      const configuredLevel = stored ?? clampThinkingLevel(model, 'medium');
      return {
        id: model.id,
        name: model.name,
        supportedLevels,
        configuredLevel
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function parseEnvText(text: string): ProviderEnv {
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

function getHtml(webview: vscode.Webview, webviewDist: vscode.Uri, nonce: string): string {
  const indexPath = vscode.Uri.joinPath(webviewDist, 'index.html').fsPath;
  const raw = readFileSync(indexPath, 'utf8');

  // Rewrite asset paths (src / href) to use webview URIs
  let html = raw.replace(/(?:src|href)="([^"]+)"/g, (_match, path: string) => {
    if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('#')) {
      return _match;
    }
    const assetPath = path.replace(/^\//, '');
    const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDist, assetPath));
    return _match.slice(0, _match.indexOf('=') + 1) + '"' + assetUri.toString() + '"';
  });

  // Inject nonce into every <script> tag and update CSP
  html = html.replace(/<script/g, `<script nonce="${nonce}"`);
  html = html.replace(
    '<meta charset="UTF-8" />',
    `<meta charset="UTF-8" />\n    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;"\n    />`
  );

  return html;
}
