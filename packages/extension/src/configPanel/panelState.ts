import {
  clampThinkingLevel,
  getSupportedThinkingLevels,
  type Api,
  type KnownProvider,
  type Model,
  type ModelThinkingLevel
} from '@earendil-works/pi-ai';
import { getBuiltinModels, getBuiltinProviders } from '@earendil-works/pi-ai/providers/all';
import type { PanelState, ReasoningModelInfo } from '@pi-router/messages';
import { CredentialStore } from '../credentials';
import { getLogLevel } from '../shared/config';
import {
  getProviderApiKeyEnvVars,
  getProviderDisplayName,
  getProviderEnvHints,
  getProviderOAuthName,
  providerSupportsOAuth
} from '../shared/providerMetadata';

export async function getPanelState(credentials: CredentialStore): Promise<PanelState> {
  const providers = getBuiltinProviders()
    .map((providerId) => {
      const models = getBuiltinModels(providerId);
      return {
        id: providerId,
        label: getProviderDisplayName(providerId),
        modelCount: models.length,
        sampleModels: models.slice(0, 6).map((model) => model.name),
        oauthName: getProviderOAuthName(providerId),
        apiKeyEnvVars: getProviderApiKeyEnvVars(providerId),
        envHints: getProviderEnvHints(providerId)
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const configured = (await credentials.listProviderCredentials())
    .map((summary) => {
      const models = getBuiltinModels(summary.providerId as KnownProvider);
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
    oauthProviderIds: getBuiltinProviders().filter((providerId) => providerSupportsOAuth(providerId)),
    logLevel: getLogLevel()
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
