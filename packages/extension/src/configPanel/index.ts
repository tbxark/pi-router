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
import { isCancellationError } from '../shared/errors';

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
  // Abort controllers for in-flight webview OAuth logins, keyed by provider.
  const activeOAuthLogins = new Map<string, AbortController>();

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

          case 'loginOAuth': {
            const providerId = message.providerId;
            const controller = new AbortController();
            activeOAuthLogins.set(providerId, controller);
            try {
              await credentials.loginOAuthProviderWithCallbacks(providerId, {
                ...oauth.createCallbacks(providerId),
                signal: controller.signal
              });
              provider.refreshModels();
              await postState();
              void panel.webview.postMessage({
                type: 'oauthDone',
                providerId
              } satisfies ExtensionMessage);
            } catch (error) {
              // A deliberate cancel resets the form quietly instead of landing
              // in the generic error banner.
              if (isCancellationError(error)) {
                await panel.webview.postMessage({
                  type: 'oauthCancelled',
                  providerId
                } satisfies ExtensionMessage);
              } else {
                throw error;
              }
            } finally {
              if (activeOAuthLogins.get(providerId) === controller) {
                activeOAuthLogins.delete(providerId);
              }
            }
            break;
          }

          case 'oauthCancel':
            activeOAuthLogins.get(message.providerId)?.abort();
            break;

          case 'confirmAction': {
            const confirmed = await confirmDangerousAction(message.message, message.confirmLabel);
            await panel.webview.postMessage({
              type: 'confirmResult',
              requestId: message.requestId,
              confirmed
            } satisfies ExtensionMessage);
            break;
          }

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
