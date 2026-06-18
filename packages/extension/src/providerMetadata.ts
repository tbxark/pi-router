import { findEnvKeys } from '@earendil-works/pi-ai';

// Display labels for providers whose name differs from the title-cased fallback
// (e.g. `OpenAI` vs `Openai`). Providers that title-case correctly are omitted.
const PROVIDER_LABELS: Record<string, string> = {
  'azure-openai-responses': 'Azure OpenAI Responses',
  'cloudflare-ai-gateway': 'Cloudflare AI Gateway',
  'cloudflare-workers-ai': 'Cloudflare Workers AI',
  deepseek: 'DeepSeek',
  'github-copilot': 'GitHub Copilot',
  google: 'Google Gemini',
  'google-vertex': 'Google Vertex AI',
  huggingface: 'Hugging Face',
  'kimi-coding': 'Kimi For Coding',
  minimax: 'MiniMax',
  'minimax-cn': 'MiniMax China',
  moonshotai: 'Moonshot AI',
  'moonshotai-cn': 'Moonshot AI China',
  nvidia: 'NVIDIA NIM',
  openai: 'OpenAI',
  'openai-codex': 'OpenAI Codex',
  opencode: 'OpenCode Zen',
  'opencode-go': 'OpenCode Go',
  openrouter: 'OpenRouter',
  together: 'Together AI',
  'vercel-ai-gateway': 'Vercel AI Gateway',
  xai: 'xAI',
  xiaomi: 'Xiaomi MiMo',
  'xiaomi-token-plan-ams': 'Xiaomi MiMo Token Plan Amsterdam',
  'xiaomi-token-plan-cn': 'Xiaomi MiMo Token Plan China',
  'xiaomi-token-plan-sgp': 'Xiaomi MiMo Token Plan Singapore',
  zai: 'ZAI',
  'zai-coding-cn': 'ZAI Coding Plan China'
};

// Extra (non-API-key) environment variables to surface when configuring a
// provider. pi-ai resolves these from ambient credentials, so they are hints
// only and are not part of `findEnvKeys`.
const PROVIDER_ENV_HINTS: Record<string, string[]> = {
  'amazon-bedrock': [
    'AWS_PROFILE',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_BEARER_TOKEN_BEDROCK',
    'AWS_REGION',
    'AWS_ENDPOINT_URL_BEDROCK_RUNTIME',
    'AWS_BEDROCK_SKIP_AUTH',
    'AWS_BEDROCK_FORCE_HTTP1'
  ],
  'azure-openai-responses': [
    'AZURE_OPENAI_BASE_URL',
    'AZURE_OPENAI_RESOURCE_NAME',
    'AZURE_OPENAI_API_VERSION',
    'AZURE_OPENAI_DEPLOYMENT_NAME_MAP'
  ],
  'cloudflare-ai-gateway': ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_GATEWAY_ID'],
  'cloudflare-workers-ai': ['CLOUDFLARE_ACCOUNT_ID'],
  'google-vertex': ['GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'GOOGLE_APPLICATION_CREDENTIALS']
};

// `findEnvKeys` only reports env vars that currently hold a value. Passing an
// env where every lookup resolves truthy makes it return the full set of
// candidate API-key variables for a provider, keeping pi-ai as the single
// source of truth instead of duplicating the mapping here.
const ALL_ENV_PRESENT = new Proxy({}, { get: () => 'present' }) as Record<string, string>;

export function getProviderDisplayName(providerId: string): string {
  return (
    PROVIDER_LABELS[providerId] ??
    providerId
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
}

export function getProviderApiKeyEnvVars(providerId: string): string[] {
  return findEnvKeys(providerId, ALL_ENV_PRESENT) ?? [];
}

export function getProviderEnvHints(providerId: string): string[] {
  return PROVIDER_ENV_HINTS[providerId] ?? [];
}
