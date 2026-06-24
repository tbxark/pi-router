import * as vscode from 'vscode';
import { type AuthLoginCallbacks, type AuthPrompt } from '@earendil-works/pi-ai';
import { getProviderDisplayName, getProviderOAuthName } from '../shared/providerMetadata';

// OAuth login UX driven through native VS Code dialogs (the CLI-command path).
// The webview path uses a separate adapter (see oauth/webviewCallbacks.ts).
export function createNativeOAuthCallbacks(providerId: string): AuthLoginCallbacks {
  const providerName = getProviderOAuthName(providerId) ?? getProviderDisplayName(providerId);
  return {
    prompt: (prompt) => promptNative(prompt),
    notify: (event) => {
      if (event.type === 'auth_url') {
        void vscode.env.openExternal(vscode.Uri.parse(event.url));
        void vscode.window.showInformationMessage(
          event.instructions ?? `Complete ${providerName} login in the browser.`
        );
      } else if (event.type === 'device_code') {
        void vscode.env.clipboard.writeText(event.userCode);
        void vscode.window
          .showInformationMessage(`${providerName} device code copied: ${event.userCode}`, 'Open Login Page')
          .then((choice) => {
            if (choice === 'Open Login Page') {
              void vscode.env.openExternal(vscode.Uri.parse(event.verificationUri));
            }
          });
      } else {
        void vscode.window.setStatusBarMessage(event.message, 5000);
      }
    }
  };
}

async function promptNative(prompt: AuthPrompt): Promise<string> {
  if (prompt.type === 'select') {
    const picked = await raceAbort(
      vscode.window.showQuickPick(
        prompt.options.map((option) => ({
          label: option.label,
          description: option.description,
          id: option.id
        })),
        { placeHolder: prompt.message, ignoreFocusOut: true }
      ),
      prompt.signal
    );
    if (!picked) {
      throw new Error('Login cancelled.');
    }
    return picked.id;
  }

  const value = await raceAbort(
    vscode.window.showInputBox({
      prompt: prompt.message,
      placeHolder: prompt.placeholder,
      password: prompt.type === 'secret',
      ignoreFocusOut: true
    }),
    prompt.signal
  );
  if (value === undefined) {
    throw new Error('Login cancelled.');
  }
  return value;
}

function raceAbort<T>(promise: PromiseLike<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) {
    return Promise.resolve(promise);
  }
  if (signal.aborted) {
    return Promise.reject(new Error('Login cancelled.'));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('Login cancelled.'));
    signal.addEventListener('abort', onAbort, { once: true });
    void Promise.resolve(promise)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}
