import * as vscode from 'vscode';
import type { LogLevel } from '@pi-router/messages';
import { getLogLevel } from './config';

const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  off: 0,
  error: 1,
  info: 2,
  debug: 3
};

export class OutputLogger {
  constructor(private readonly output?: vscode.OutputChannel) {}

  error(message: string): void {
    this.write('error', message);
  }

  info(message: string): void {
    this.write('info', message);
  }

  debug(message: string): void {
    this.write('debug', message);
  }

  shouldLog(level: Exclude<LogLevel, 'off'>): boolean {
    return Boolean(this.output) && LOG_LEVEL_WEIGHT[getLogLevel()] >= LOG_LEVEL_WEIGHT[level];
  }

  private write(level: Exclude<LogLevel, 'off'>, message: string): void {
    if (!this.shouldLog(level)) {
      return;
    }

    this.output?.appendLine(message);
  }
}
