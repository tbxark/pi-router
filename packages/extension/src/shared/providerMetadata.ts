import { builtinModels } from '@earendil-works/pi-ai/providers/all';

const BUILTIN_MODELS = builtinModels();

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

const PROVIDER_API_KEY_ENV_VARS: Record<string, string[]> = {
  'ant-ling': ['ANT_LING_API_KEY'],
  'azure-openai-responses': ['AZURE_OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'],
  cerebras: ['CEREBRAS_API_KEY'],
  'cloudflare-ai-gateway': ['CLOUDFLARE_API_KEY'],
  'cloudflare-workers-ai': ['CLOUDFLARE_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  fireworks: ['FIREWORKS_API_KEY'],
  'github-copilot': ['COPILOT_GITHUB_TOKEN'],
  google: ['GEMINI_API_KEY'],
  'google-vertex': ['GOOGLE_CLOUD_API_KEY'],
  groq: ['GROQ_API_KEY'],
  huggingface: ['HF_TOKEN'],
  'kimi-coding': ['KIMI_API_KEY'],
  minimax: ['MINIMAX_API_KEY'],
  'minimax-cn': ['MINIMAX_CN_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  moonshotai: ['MOONSHOT_API_KEY'],
  'moonshotai-cn': ['MOONSHOT_API_KEY'],
  nvidia: ['NVIDIA_API_KEY'],
  opencode: ['OPENCODE_API_KEY'],
  'opencode-go': ['OPENCODE_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  together: ['TOGETHER_API_KEY'],
  'vercel-ai-gateway': ['AI_GATEWAY_API_KEY'],
  xai: ['XAI_API_KEY'],
  xiaomi: ['XIAOMI_API_KEY'],
  'xiaomi-token-plan-ams': ['XIAOMI_TOKEN_PLAN_AMS_API_KEY'],
  'xiaomi-token-plan-cn': ['XIAOMI_TOKEN_PLAN_CN_API_KEY'],
  'xiaomi-token-plan-sgp': ['XIAOMI_TOKEN_PLAN_SGP_API_KEY'],
  zai: ['ZAI_API_KEY'],
  'zai-coding-cn': ['ZAI_CODING_CN_API_KEY']
};

// Extra (non-API-key) environment variables to surface when configuring a
// provider. pi-ai resolves these from provider-scoped or ambient credentials,
// so they are hints rather than API-key field aliases.
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

export function getProviderDisplayName(providerId: string): string {
  return (
    BUILTIN_MODELS.getProvider(providerId)?.name ??
    PROVIDER_LABELS[providerId] ??
    providerId
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
}

export function getProviderApiKeyEnvVars(providerId: string): string[] {
  return PROVIDER_API_KEY_ENV_VARS[providerId] ?? [];
}

export function getProviderEnvHints(providerId: string): string[] {
  return PROVIDER_ENV_HINTS[providerId] ?? [];
}

export function getProviderOAuthName(providerId: string): string | undefined {
  return BUILTIN_MODELS.getProvider(providerId)?.auth.oauth?.name;
}

export function providerSupportsApiKey(providerId: string): boolean {
  return Boolean(BUILTIN_MODELS.getProvider(providerId)?.auth.apiKey);
}

export function providerSupportsOAuth(providerId: string): boolean {
  return Boolean(BUILTIN_MODELS.getProvider(providerId)?.auth.oauth);
}
