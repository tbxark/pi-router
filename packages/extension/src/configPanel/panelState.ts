import {
  clampThinkingLevel,
  getModels,
  getProviders,
  getSupportedThinkingLevels,
  type Api,
  type KnownProvider,
  type Model,
  type ModelThinkingLevel
} from '@earendil-works/pi-ai';
import { getOAuthProviders } from '@earendil-works/pi-ai/oauth';
import { CredentialStore } from '../credentials';
import { getProviderApiKeyEnvVars, getProviderDisplayName, getProviderEnvHints } from '../shared/providerMetadata';

interface ProviderOption {
  id: string;
  label: string;
  modelCount: number;
  sampleModels: string[];
  oauthName?: string;
  apiKeyEnvVars: string[];
  envHints: string[];
}

interface ReasoningModelInfo {
  id: string;
  name: string;
  // Supported thinking levels excluding `off`, in pi-ai's canonical order.
  supportedLevels: string[];
  // The currently effective level: `off` or one of supportedLevels. Defaults to `medium`.
  configuredLevel: string;
}

interface ConfiguredProvider {
  id: string;
  label: string;
  authType: 'api_key' | 'oauth';
  hasKey: boolean;
  envKeys: string[];
  modelCount: number;
  reasoningModels: ReasoningModelInfo[];
}

export interface PanelState {
  providers: ProviderOption[];
  configured: ConfiguredProvider[];
  oauthProviderIds: string[];
}

export async function getPanelState(credentials: CredentialStore): Promise<PanelState> {
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
        modelCount: models.length,
        reasoningModels: buildReasoningModels(models as Model<Api>[], summary.reasoning)
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    providers,
    configured,
    oauthProviderIds: Array.from(oauthProviders.keys())
  };
}

function buildReasoningModels(
  models: Model<Api>[],
  reasoning: Record<string, ModelThinkingLevel>
): ReasoningModelInfo[] {
  return models
    .filter((model) => model.reasoning)
    .map((model) => {
      const supportedLevels = getSupportedThinkingLevels(model).filter((level) => level !== 'off');
      const stored = reasoning[model.id];
      const configuredLevel = stored ?? clampThinkingLevel(model, 'medium');
      return {
        id: model.id,
        name: model.name,
        supportedLevels,
        configuredLevel
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
