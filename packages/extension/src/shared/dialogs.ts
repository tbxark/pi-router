import * as vscode from 'vscode';

export async function confirmDangerousAction(message: string, confirmLabel: string): Promise<boolean> {
  const selected = await vscode.window.showWarningMessage(message, { modal: true }, confirmLabel);
  return selected === confirmLabel;
}
