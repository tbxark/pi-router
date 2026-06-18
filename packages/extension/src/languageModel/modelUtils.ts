import {
  clampThinkingLevel,
  type Api,
  type Model,
  type ModelThinkingLevel,
  type ThinkingLevel
} from '@earendil-works/pi-ai';
import { getOAuthProvider, type OAuthCredentials } from '@earendil-works/pi-ai/oauth';

// Model IDs are encoded as `providerId/modelId`. The first `/` is the separator,
// so provider IDs must not contain a leading slash.
export function encodeLanguageModelId(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`;
}

export function decodeLanguageModelId(id: string): { providerId: string; modelId: string } | undefined {
  const separator = id.indexOf('/');
  if (separator <= 0) {
    return undefined;
  }

  return {
    providerId: id.slice(0, separator),
    modelId: id.slice(separator + 1)
  };
}

/**
 * Resolves the effective reasoning level for a request. Reasoning-capable models
 * default to `medium` unless the user configured an explicit level (including `off`).
 * The level is clamped to what the model actually supports. Returns undefined when
 * thinking should be omitted (model lacks reasoning, or level resolves to `off`).
 */
export function resolveReasoningLevel(
  model: Model<Api>,
  configured: ModelThinkingLevel | undefined
): ThinkingLevel | undefined {
  if (!model.reasoning) {
    return undefined;
  }

  const desired: ModelThinkingLevel = configured ?? 'medium';
  if (desired === 'off') {
    return undefined;
  }

  const clamped = clampThinkingLevel(model, desired);
  return clamped === 'off' ? undefined : clamped;
}

export function applyOAuthModelOverrides(model: Model<Api>, credentials: OAuthCredentials | undefined): Model<Api> {
  if (!credentials) {
    return model;
  }

  const provider = getOAuthProvider(model.provider);
  return (provider?.modifyModels?.([model], credentials) as Model<Api>[] | undefined)?.[0] ?? model;
}
