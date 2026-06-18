import * as vscode from 'vscode';
import { getProviders, type KnownProvider } from '@earendil-works/pi-ai';
import { getOAuthProviders } from '@earendil-works/pi-ai/oauth';
import { openConfigPanel } from '../configPanel';
import { CredentialStore } from '../credentials';
import { PiLanguageModelProvider } from '../languageModel';
import { createNativeOAuthCallbacks } from '../oauth/nativeCallbacks';
import { confirmDangerousAction } from '../shared/dialogs';
import { getProviderApiKeyEnvVars, getProviderDisplayName, getProviderEnvHints } from '../shared/providerMetadata';

export function registerCommands(
  context: vscode.ExtensionContext,
  credentials: CredentialStore,
  provider: PiLanguageModelProvider
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('piRouter.configure', () => openConfigPanel(context, credentials, provider)),
    vscode.commands.registerCommand('piRouter.addProviderApiKey', () => addProviderApiKey(credentials, provider)),
    vscode.commands.registerCommand('piRouter.loginOAuthProvider', () => loginOAuthProvider(credentials, provider)),
    vscode.commands.registerCommand('piRouter.clearCredentials', () => clearCredentials(credentials, provider))
  ];
}

async function addProviderApiKey(credentials: CredentialStore, provider: PiLanguageModelProvider): Promise<void> {
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

  await credentials.loginOAuthProviderWithCallbacks(providerId, createNativeOAuthCallbacks(providerId));
  provider.refreshModels();
  vscode.window.showInformationMessage(`${getProviderDisplayName(providerId)} OAuth login completed.`);
}

async function clearCredentials(credentials: CredentialStore, provider: PiLanguageModelProvider): Promise<void> {
  if (!(await confirmDangerousAction('Clear all saved Pi Router credentials? This cannot be undone.', 'Clear All'))) {
    return;
  }

  await credentials.clearAll();
  provider.refreshModels();
  vscode.window.showInformationMessage('Pi Router credentials cleared.');
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
