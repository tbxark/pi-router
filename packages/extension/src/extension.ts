import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { CredentialStore } from './credentials';
import { PiLanguageModelProvider } from './languageModel';

const VENDOR_ID = 'pi-router';

export function activate(context: vscode.ExtensionContext): void {
  const credentials = new CredentialStore(context);
  const output = vscode.window.createOutputChannel('Pi Router');
  const provider = new PiLanguageModelProvider(credentials, output);

  context.subscriptions.push(
    output,
    vscode.lm.registerLanguageModelChatProvider(VENDOR_ID, provider),
    ...registerCommands(context, credentials, provider),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('piRouter')) {
        provider.refreshModels();
      }
    }),
    context.secrets.onDidChange(() => provider.refreshModels())
  );
}

export function deactivate(): void {}
