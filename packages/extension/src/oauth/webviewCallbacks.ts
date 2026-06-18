import * as vscode from 'vscode';
import { type OAuthLoginCallbacks } from '@earendil-works/pi-ai/oauth';
import type { ExtensionMessage } from '@pi-router/messages';

// OAuth login UX bridged across the webview boundary. pi-ai's async callbacks are
// translated into `postMessage` round-trips: prompt/select/manual-code callbacks
// park a resolver that a later webview response message settles via `resolve()`.
export class WebviewOAuthBridge {
  private resolver: ((value: string) => void) | null = null;

  constructor(private readonly webview: vscode.Webview) {}

  // Settles the pending prompt/select/manual-code callback with the webview's reply.
  resolve(value: string): void {
    this.resolver?.(value);
    this.resolver = null;
  }

  createCallbacks(providerId: string): OAuthLoginCallbacks {
    return {
      onAuth: (info: { url: string; instructions?: string }) => {
        void this.webview.postMessage({
          type: 'oauthAuth',
          providerId,
          url: info.url,
          instructions: info.instructions
        } satisfies ExtensionMessage);
        void vscode.env.openExternal(vscode.Uri.parse(info.url));
      },
      onDeviceCode: (info: { userCode: string; verificationUri: string }) => {
        void this.webview.postMessage({
          type: 'oauthDeviceCode',
          providerId,
          userCode: info.userCode,
          verificationUri: info.verificationUri
        } satisfies ExtensionMessage);
      },
      onPrompt: async (prompt: { message: string; placeholder?: string; allowEmpty?: boolean }) => {
        return this.waitForResponse(() => {
          void this.webview.postMessage({
            type: 'oauthPrompt',
            providerId,
            message: prompt.message,
            placeholder: prompt.placeholder,
            allowEmpty: prompt.allowEmpty
          } satisfies ExtensionMessage);
        });
      },
      onSelect: async (prompt: { message: string; options: { id: string; label: string }[] }) => {
        return this.waitForResponse(() => {
          void this.webview.postMessage({
            type: 'oauthSelect',
            providerId,
            message: prompt.message,
            options: prompt.options
          } satisfies ExtensionMessage);
        });
      },
      onManualCodeInput: async () => {
        return this.waitForResponse(() => {
          void this.webview.postMessage({
            type: 'oauthManualCodeInput',
            providerId
          } satisfies ExtensionMessage);
        });
      },
      onProgress: (message: string) => {
        void this.webview.postMessage({
          type: 'oauthProgress',
          providerId,
          message
        } satisfies ExtensionMessage);
      }
    };
  }

  private waitForResponse(post: () => void): Promise<string> {
    return new Promise<string>((resolve) => {
      this.resolver = resolve;
      post();
    });
  }
}
