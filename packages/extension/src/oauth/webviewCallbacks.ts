import * as vscode from 'vscode';
import { type AuthLoginCallbacks, type AuthPrompt } from '@earendil-works/pi-ai';
import type { ExtensionMessage } from '@pi-router/messages';

// OAuth login UX bridged across the webview boundary. pi-ai's async callbacks are
// translated into `postMessage` round-trips: prompt/select/manual-code callbacks
// park a resolver that a later webview response message settles via `resolve()`.
export class WebviewOAuthBridge {
  private resolver: ((value: string) => void) | null = null;
  private rejecter: ((error: Error) => void) | null = null;

  constructor(private readonly webview: vscode.Webview) {}

  // Settles the pending prompt/select/manual-code callback with the webview's reply.
  resolve(value: string): void {
    this.resolver?.(value);
  }

  createCallbacks(providerId: string): AuthLoginCallbacks {
    return {
      prompt: (prompt) => this.prompt(providerId, prompt),
      notify: (event) => {
        if (event.type === 'auth_url') {
          void this.webview.postMessage({
            type: 'oauthAuth',
            providerId,
            url: event.url,
            instructions: event.instructions
          } satisfies ExtensionMessage);
          void vscode.env.openExternal(vscode.Uri.parse(event.url));
        } else if (event.type === 'device_code') {
          void this.webview.postMessage({
            type: 'oauthDeviceCode',
            providerId,
            userCode: event.userCode,
            verificationUri: event.verificationUri
          } satisfies ExtensionMessage);
        } else {
          void this.webview.postMessage({
            type: 'oauthProgress',
            providerId,
            message: event.message
          } satisfies ExtensionMessage);
        }
      }
    };
  }

  private prompt(providerId: string, prompt: AuthPrompt): Promise<string> {
    if (prompt.type === 'select') {
      return this.waitForResponse(() => {
        void this.webview.postMessage({
          type: 'oauthSelect',
          providerId,
          message: prompt.message,
          options: prompt.options.map((option) => ({ id: option.id, label: option.label }))
        } satisfies ExtensionMessage);
      }, prompt.signal);
    }

    if (prompt.type === 'manual_code') {
      return this.waitForResponse(() => {
        void this.webview.postMessage({
          type: 'oauthManualCodeInput',
          providerId
        } satisfies ExtensionMessage);
      }, prompt.signal);
    }

    return this.waitForResponse(() => {
      void this.webview.postMessage({
        type: 'oauthPrompt',
        providerId,
        message: prompt.message,
        placeholder: prompt.placeholder,
        allowEmpty: false
      } satisfies ExtensionMessage);
    }, prompt.signal);
  }

  private waitForResponse(post: () => void, signal: AbortSignal | undefined): Promise<string> {
    if (signal?.aborted) {
      return Promise.reject(new Error('Login cancelled.'));
    }

    this.rejecter?.(new Error('Login prompt replaced.'));

    return new Promise<string>((resolve, reject) => {
      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
        this.resolver = null;
        this.rejecter = null;
      };
      const onAbort = () => {
        cleanup();
        reject(new Error('Login cancelled.'));
      };

      this.resolver = (value) => {
        cleanup();
        resolve(value);
      };
      this.rejecter = (error) => {
        cleanup();
        reject(error);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      post();
    });
  }
}
