import * as vscode from 'vscode';
import {
  getOAuthProvider,
  type OAuthDeviceCodeInfo,
  type OAuthLoginCallbacks,
  type OAuthSelectPrompt
} from '@earendil-works/pi-ai/oauth';

// OAuth login UX driven through native VS Code dialogs (the CLI-command path).
// The webview path uses a separate adapter (see oauth/webviewCallbacks.ts).
export function createNativeOAuthCallbacks(providerId: string): OAuthLoginCallbacks {
  const providerName = getOAuthProvider(providerId)?.name ?? providerId;
  return {
    onAuth: (info: { url: string; instructions?: string }) => {
      void vscode.env.openExternal(vscode.Uri.parse(info.url));
      void vscode.window.showInformationMessage(info.instructions ?? `Complete ${providerName} login in the browser.`);
    },
    onDeviceCode: (info: OAuthDeviceCodeInfo) => {
      void vscode.env.clipboard.writeText(info.userCode);
      void vscode.window
        .showInformationMessage(`${providerName} device code copied: ${info.userCode}`, 'Open Login Page')
        .then((choice) => {
          if (choice === 'Open Login Page') {
            void vscode.env.openExternal(vscode.Uri.parse(info.verificationUri));
          }
        });
    },
    onPrompt: async (prompt: { message: string; placeholder?: string; allowEmpty?: boolean }) => {
      const value = await vscode.window.showInputBox({
        prompt: prompt.message,
        placeHolder: prompt.placeholder,
        ignoreFocusOut: true
      });
      if (!value && !prompt.allowEmpty) {
        throw new Error('Login cancelled.');
      }
      return value ?? '';
    },
    onManualCodeInput: async () => {
      const value = await vscode.window.showInputBox({
        prompt: `Paste the ${providerName} authorization code or full redirect URL.`,
        ignoreFocusOut: true
      });
      if (!value) {
        throw new Error('Login cancelled.');
      }
      return value;
    },
    onSelect: async (prompt: OAuthSelectPrompt) => {
      const picked = await vscode.window.showQuickPick(
        prompt.options.map((option) => ({ label: option.label, id: option.id })),
        { placeHolder: prompt.message, ignoreFocusOut: true }
      );
      return picked?.id;
    },
    onProgress: (message: string) => {
      void vscode.window.setStatusBarMessage(message, 5000);
    }
  };
}
