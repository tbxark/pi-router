// The OAuth login adapters reject with these plain errors when the user backs
// out (native input cancelled, webview flow aborted, prompt superseded).
// Callers use this to stay silent instead of surfacing a deliberate cancel as
// an error.
const CANCELLATION_MESSAGES = new Set(['Login cancelled.', 'Login prompt replaced.']);

export function isCancellationError(error: unknown): boolean {
  return error instanceof Error && CANCELLATION_MESSAGES.has(error.message);
}
