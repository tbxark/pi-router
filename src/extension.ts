import * as vscode from 'vscode';
import { getProviders, type KnownProvider } from '@earendil-works/pi-ai';
import { getOAuthProviders } from '@earendil-works/pi-ai/oauth';
import { openConfigPanel } from './configPanel.js';
import { CredentialStore } from './credentials.js';
import { PiLanguageModelProvider } from './provider.js';
import { getProviderApiKeyEnvVars, getProviderDisplayName, getProviderEnvHints } from './providerMetadata.js';

const VENDOR_ID = 'pi-router';

export function activate(context: vscode.ExtensionContext): void {
  const credentials = new CredentialStore(context);
  const provider = new PiLanguageModelProvider(credentials);

  context.subscriptions.push(
    vscode.lm.registerLanguageModelChatProvider(VENDOR_ID, provider),
    vscode.commands.registerCommand('piRouter.configure', () => openConfigPanel(context, credentials, provider)),
    vscode.commands.registerCommand('piRouter.addProviderApiKey', () => setProviderApiKey(credentials, provider)),
    vscode.commands.registerCommand('piRouter.loginOAuthProvider', () => loginOAuthProvider(credentials, provider)),
    vscode.commands.registerCommand('piRouter.clearCredentials', async () => {
      await credentials.clearAll();
      provider.refreshModels();
      vscode.window.showInformationMessage('Pi Router credentials cleared.');
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('piRouter')) {
        provider.refreshModels();
      }
    }),
    context.secrets.onDidChange(() => provider.refreshModels())
  );
}

async function setProviderApiKey(credentials: CredentialStore, provider: PiLanguageModelProvider): Promise<void> {
  const providerId = await pickProvider(
    getProviders().filter((id) => getProviderApiKeyEnvVars(id).length > 0 || getProviderEnvHints(id).length > 0)
  );
  if (!providerId) {
    return;
  }

  const apiKey = await vscode.window.showInputBox({
    title: `Pi Router: Set API Key for ${getProviderDisplayName(providerId)}`,
    prompt: `Stored in VS Code SecretStorage. Env vars: ${getProviderApiKeyEnvVars(providerId).join(' or ') || 'provider-scoped env'}.`,
    password: true,
    ignoreFocusOut: true
  });
  if (apiKey === undefined) {
    return;
  }

  await credentials.setProviderApiKey(providerId, apiKey);
  provider.refreshModels();
  vscode.window.showInformationMessage(`${getProviderDisplayName(providerId)} credentials saved.`);
}

async function loginOAuthProvider(credentials: CredentialStore, provider: PiLanguageModelProvider): Promise<void> {
  const providerId = await pickProvider(getOAuthProviders().map((oauthProvider) => oauthProvider.id as KnownProvider));
  if (!providerId) {
    return;
  }

  await credentials.loginOAuthProvider(providerId);
  provider.refreshModels();
  vscode.window.showInformationMessage(`${getProviderDisplayName(providerId)} OAuth login completed.`);
}

async function pickProvider(providerIds: readonly string[]): Promise<string | undefined> {
  const picked = await vscode.window.showQuickPick(
    providerIds
      .map((providerId) => ({
        label: getProviderDisplayName(providerId),
        description: providerId,
        id: providerId
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    { placeHolder: 'Select a Pi provider', ignoreFocusOut: true }
  );
  return picked?.id;
}

export function deactivate(): void {}
