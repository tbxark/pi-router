import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as vscode from 'vscode';
import { getModels, getProviders, type KnownProvider, type ProviderEnv } from '@earendil-works/pi-ai';
import { getOAuthProviders } from '@earendil-works/pi-ai/oauth';
import { CredentialStore } from './credentials.js';
import { PiLanguageModelProvider } from './provider.js';
import { getProviderApiKeyEnvVars, getProviderDisplayName, getProviderEnvHints } from './providerMetadata.js';

export function openConfigPanel(
  context: vscode.ExtensionContext,
  credentials: CredentialStore,
  provider: PiLanguageModelProvider
): void {
  const panel = vscode.window.createWebviewPanel(
    'piRouter.configure',
    'Pi Router Providers',
    vscode.ViewColumn.Active,
    { enableScripts: true }
  );

  const nonce = randomUUID();
  panel.webview.html = getHtml(context, nonce);

  async function postState(): Promise<void> {
    await panel.webview.postMessage({ type: 'state', state: await getPanelState(credentials) });
  }

  panel.webview.onDidReceiveMessage(
    async (message: unknown) => {
      try {
        if (!isConfigMessage(message)) {
          return;
        }

        if (message.type === 'ready') {
          await postState();
        } else if (message.type === 'saveApiKey') {
          await credentials.setProviderApiKey(
            message.providerId,
            String(message.apiKey ?? ''),
            parseEnvText(String(message.envText ?? ''))
          );
          provider.refreshModels();
          await postState();
          vscode.window.showInformationMessage(`${getProviderDisplayName(message.providerId)} credentials saved.`);
        } else if (message.type === 'loginOAuth') {
          await credentials.loginOAuthProvider(message.providerId);
          provider.refreshModels();
          await postState();
          vscode.window.showInformationMessage(`${getProviderDisplayName(message.providerId)} OAuth login completed.`);
        } else if (message.type === 'removeProvider') {
          await credentials.removeProvider(message.providerId);
          provider.refreshModels();
          await postState();
        } else if (message.type === 'clearCredentials') {
          await credentials.clearAll();
          provider.refreshModels();
          await postState();
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        await panel.webview.postMessage({ type: 'error', error: text });
        vscode.window.showErrorMessage(text);
      }
    },
    undefined,
    context.subscriptions
  );
}

interface ProviderOption {
  id: string;
  label: string;
  modelCount: number;
  sampleModels: string[];
  oauthName?: string;
  apiKeyEnvVars: string[];
  envHints: string[];
}

interface ConfiguredProvider {
  id: string;
  label: string;
  authType: 'api_key' | 'oauth';
  hasKey: boolean;
  envKeys: string[];
  modelCount: number;
}

interface PanelState {
  providers: ProviderOption[];
  configured: ConfiguredProvider[];
  oauthProviderIds: string[];
}

type ConfigMessage =
  | { type: 'ready' }
  | { type: 'saveApiKey'; providerId: string; apiKey?: unknown; envText?: unknown }
  | { type: 'loginOAuth'; providerId: string }
  | { type: 'removeProvider'; providerId: string }
  | { type: 'clearCredentials' };

function isConfigMessage(value: unknown): value is ConfigMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }

  const type = String(value.type);
  if (type === 'ready' || type === 'clearCredentials') {
    return true;
  }

  return (
    ['saveApiKey', 'loginOAuth', 'removeProvider'].includes(type) &&
    'providerId' in value &&
    typeof value.providerId === 'string'
  );
}

async function getPanelState(credentials: CredentialStore): Promise<PanelState> {
  const oauthProviders = new Map(getOAuthProviders().map((oauthProvider) => [oauthProvider.id, oauthProvider]));
  const providers = getProviders()
    .map((providerId) => {
      const models = getModels(providerId as KnownProvider);
      return {
        id: providerId,
        label: getProviderDisplayName(providerId),
        modelCount: models.length,
        sampleModels: models.slice(0, 6).map((model) => model.name),
        oauthName: oauthProviders.get(providerId)?.name,
        apiKeyEnvVars: getProviderApiKeyEnvVars(providerId),
        envHints: getProviderEnvHints(providerId)
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const configured = (await credentials.listProviderCredentials())
    .map((summary) => {
      const models = getModels(summary.providerId as KnownProvider);
      return {
        id: summary.providerId,
        label: getProviderDisplayName(summary.providerId),
        authType: summary.type,
        hasKey: summary.hasKey,
        envKeys: summary.envKeys,
        modelCount: models.length
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    providers,
    configured,
    oauthProviderIds: Array.from(oauthProviders.keys())
  };
}

function parseEnvText(text: string): ProviderEnv {
  const env: ProviderEnv = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator <= 0) {
      throw new Error(`Invalid env line: ${line}`);
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) {
      throw new Error(`Invalid env key: ${key}`);
    }
    env[key] = value;
  }
  return env;
}

function getHtml(context: vscode.ExtensionContext, nonce: string): string {
  const templatePath = context.asAbsolutePath('out/configPanel.html');
  return readFileSync(templatePath, 'utf8').replaceAll('{{nonce}}', nonce);
}
