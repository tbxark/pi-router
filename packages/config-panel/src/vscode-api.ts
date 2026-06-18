import type { ExtensionMessage, WebviewMessage } from './types/messages';

/**
 * Thin wrapper around the VS Code webview API.
 *
 * Components should use this instead of calling `acquireVsCodeApi()` directly
 * so the dependency on the global `acquireVsCodeApi` stays in one place.
 */

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const api = acquireVsCodeApi();

export function postMessage(message: WebviewMessage): void {
  api.postMessage(message);
}

export function onMessage(handler: (message: ExtensionMessage) => void): () => void {
  const listener = (event: MessageEvent<ExtensionMessage>) => {
    handler(event.data);
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
