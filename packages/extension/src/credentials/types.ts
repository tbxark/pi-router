import { type ModelThinkingLevel, type ProviderEnv } from '@earendil-works/pi-ai';
import { type OAuthCredentials } from '@earendil-works/pi-ai/oauth';

export type StoredProviderCredential = StoredApiKeyCredential | StoredOAuthCredential;

export interface StoredApiKeyCredential {
  type: 'api_key';
  key?: string;
  env?: ProviderEnv;
  // Per-model reasoning level overrides, keyed by model id. `"off"` disables thinking.
  reasoning?: Record<string, ModelThinkingLevel>;
  updatedAt: number;
}

export interface StoredOAuthCredential {
  type: 'oauth';
  credentials: OAuthCredentials;
  env?: ProviderEnv;
  // Per-model reasoning level overrides, keyed by model id. `"off"` disables thinking.
  reasoning?: Record<string, ModelThinkingLevel>;
  updatedAt: number;
}

export interface StoredProviderCredentials {
  version: 1;
  providers: Record<string, StoredProviderCredential>;
}

export interface ProviderCredentialSummary {
  providerId: string;
  type: StoredProviderCredential['type'];
  hasKey: boolean;
  envKeys: string[];
  reasoning: Record<string, ModelThinkingLevel>;
  updatedAt: number;
}

export interface ResolvedProviderCredentials {
  type: StoredProviderCredential['type'];
  apiKey?: string;
  env: ProviderEnv;
  oauthCredentials?: OAuthCredentials;
  reasoning?: Record<string, ModelThinkingLevel>;
}
