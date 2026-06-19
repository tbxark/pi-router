import * as vscode from 'vscode';
import type { LogLevel } from '@pi-router/messages';

export const LOG_LEVELS: readonly LogLevel[] = ['off', 'error', 'info', 'debug'];

export function getLogLevel(): LogLevel {
  const value = vscode.workspace.getConfiguration('piRouter').get<string>('logLevel', 'error');
  return isLogLevel(value) ? value : 'error';
}

export async function setLogLevel(level: LogLevel): Promise<void> {
  await vscode.workspace.getConfiguration('piRouter').update('logLevel', level, vscode.ConfigurationTarget.Global);
}

function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}
