import * as vscode from 'vscode';
import { getProviders, type KnownProvider } from '@earendil-works/pi-ai';
import { getOAuthProviders } from '@earendil-works/pi-ai/oauth';
import { openConfigPanel } from './configPanel';
import { CredentialStore } from './credentials';
import { PiLanguageModelProvider } from './provider';
import { getProviderApiKeyEnvVars, getProviderDisplayName, getProviderEnvHints } from './providerMetadata';

const VENDOR_ID = 'pi-router';

export function activate(context: vscode.ExtensionContext): void {
  const credentials = new CredentialStore(context);
  const output = vscode.window.createOutputChannel('Pi Router');
  const provider = new PiLanguageModelProvider(credentials, output);

  context.subscriptions.push(
    output,
    vscode.lm.registerLanguageModelChatProvider(VENDOR_ID, provider),
    vscode.commands.registerCommand('piRouter.configure', () => openConfigPanel(context, credentials, provider)),
    vscode.commands.registerCommand('piRouter.addProviderApiKey', () => setProviderApiKey(credentials, provider)),
    vscode.commands.registerCommand('piRouter.loginOAuthProvider', () => loginOAuthProvider(credentials, provider)),
    vscode.commands.registerCommand('piRouter.clearCredentials', async () => {
      if (!(await confirmDangerousAction('Clear all saved Pi Router credentials? This cannot be undone.', 'Clear All'))) {
        return;
      }

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

  if (await hasProviderCredentials(credentials, providerId)) {
    const confirmed = await confirmDangerousAction(
      `Update ${getProviderDisplayName(providerId)} credentials? Existing saved credentials for this provider will be overwritten.`,
      'Update'
    );
    if (!confirmed) {
      return;
    }
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

  if (await hasProviderCredentials(credentials, providerId)) {
    const confirmed = await confirmDangerousAction(
      `Reauthorize ${getProviderDisplayName(providerId)}? Existing OAuth credentials for this provider will be replaced.`,
      'Reauthorize'
    );
    if (!confirmed) {
      return;
    }
  }

  await credentials.loginOAuthProvider(providerId);
  provider.refreshModels();
  vscode.window.showInformationMessage(`${getProviderDisplayName(providerId)} OAuth login completed.`);
}

async function confirmDangerousAction(message: string, confirmLabel: string): Promise<boolean> {
  const selected = await vscode.window.showWarningMessage(message, { modal: true }, confirmLabel);
  return selected === confirmLabel;
}

async function hasProviderCredentials(credentials: CredentialStore, providerId: string): Promise<boolean> {
  return (await credentials.listProviderCredentials()).some((summary) => summary.providerId === providerId);
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
