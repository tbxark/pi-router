import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { CredentialStore } from '../credentials';
import { PiLanguageModelProvider } from '../languageModel';
import { WebviewOAuthBridge } from '../oauth/webviewCallbacks';
import { setLogLevel } from '../shared/config';
import { confirmDangerousAction } from '../shared/dialogs';
import { getProviderDisplayName } from '../shared/providerMetadata';
import { getHtml } from './html';
import { getPanelState } from './panelState';
import { normalizeReasoningLevel, parseEnvText } from './parsing';
import { isWebviewMessage, type ExtensionMessage } from '@pi-router/messages';

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
    const stateMessage: ExtensionMessage = { type: 'state', state: await getPanelState(credentials) };
    await panel.webview.postMessage(stateMessage);
  }

  // OAuth-in-webview state: bridges async pi-ai callbacks → webview round-trips.
  const oauth = new WebviewOAuthBridge(panel.webview);

  disposables.push(
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      try {
        if (!isWebviewMessage(message)) {
          return;
        }

        switch (message.type) {
          case 'ready':
            await postState();
            break;

          case 'saveApiKey':
            await credentials.setProviderApiKey(message.providerId, message.apiKey, parseEnvText(message.envText));
            provider.refreshModels();
            await postState();
            break;

          case 'loginOAuth':
            await credentials.loginOAuthProviderWithCallbacks(
              message.providerId,
              oauth.createCallbacks(message.providerId)
            );
            provider.refreshModels();
            await postState();
            void panel.webview.postMessage({
              type: 'oauthDone',
              providerId: message.providerId
            } satisfies ExtensionMessage);
            break;

          case 'oauthPromptResponse':
            oauth.resolve(message.value);
            break;

          case 'oauthSelectResponse':
            oauth.resolve(message.id);
            break;

          case 'oauthManualCodeResponse':
            oauth.resolve(message.value);
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

          case 'saveLogLevel':
            await setLogLevel(message.level);
            await postState();
            break;
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        await panel.webview.postMessage({ type: 'error', error: text } satisfies ExtensionMessage);
      }
    }, undefined)
  );
}
