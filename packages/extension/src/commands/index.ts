import * as vscode from 'vscode';
import { getBuiltinProviders } from '@earendil-works/pi-ai/providers/all';
import { openConfigPanel } from '../configPanel';
import { CredentialStore } from '../credentials';
import { PiLanguageModelProvider } from '../languageModel';
import { createNativeOAuthCallbacks } from '../oauth/nativeCallbacks';
import { confirmDangerousAction } from '../shared/dialogs';
import { isCancellationError } from '../shared/errors';
import {
  getProviderApiKeyEnvVars,
  getProviderDisplayName,
  getProviderEnvHints,
  providerSupportsApiKey,
  providerSupportsOAuth
} from '../shared/providerMetadata';

export function registerCommands(
  context: vscode.ExtensionContext,
  credentials: CredentialStore,
  provider: PiLanguageModelProvider
): vscode.Disposable[] {
  // Without this wrapper a thrown error (or a deliberate OAuth cancel, which
  // the login adapters reject) escapes into VS Code's generic command-failure
  // notification.
  const safely = (label: string, action: () => Promise<void>): Promise<void> =>
    action().catch((error: unknown) => {
      if (isCancellationError(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`${label}: ${message}`);
    });

  return [
    vscode.commands.registerCommand('piRouter.configure', () => openConfigPanel(context, credentials, provider)),
    vscode.commands.registerCommand('piRouter.addProviderApiKey', () =>
      safely('Pi Router: failed to save credentials', () => addProviderApiKey(credentials, provider))
    ),
    vscode.commands.registerCommand('piRouter.loginOAuthProvider', () =>
      safely('Pi Router: OAuth login failed', () => loginOAuthProvider(credentials, provider))
    ),
    vscode.commands.registerCommand('piRouter.clearCredentials', () =>
      safely('Pi Router: failed to clear credentials', () => clearCredentials(credentials, provider))
    )
  ];
}

async function addProviderApiKey(credentials: CredentialStore, provider: PiLanguageModelProvider): Promise<void> {
  const providerId = await pickProvider(
    getBuiltinProviders().filter(
      (id) =>
        providerSupportsApiKey(id) || getProviderApiKeyEnvVars(id).length > 0 || getProviderEnvHints(id).length > 0
    )
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
  const providerId = await pickProvider(getBuiltinProviders().filter((id) => providerSupportsOAuth(id)));
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

  // pi-ai login flows require a real AbortSignal; there is no cancel affordance
  // in the native-dialog path, so this controller simply stays live.
  const controller = new AbortController();
  await credentials.loginOAuthProviderWithCallbacks(providerId, {
    ...createNativeOAuthCallbacks(providerId),
    signal: controller.signal
  });
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
