export interface ProviderMetadata {
  label: string;
  apiKeyEnvVars?: string[];
  envHints?: string[];
}

const PROVIDER_METADATA: Record<string, ProviderMetadata> = {
  'amazon-bedrock': {
    label: 'Amazon Bedrock',
    envHints: [
      'AWS_PROFILE',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_BEARER_TOKEN_BEDROCK',
      'AWS_REGION',
      'AWS_ENDPOINT_URL_BEDROCK_RUNTIME',
      'AWS_BEDROCK_SKIP_AUTH',
      'AWS_BEDROCK_FORCE_HTTP1'
    ]
  },
  'ant-ling': { label: 'Ant Ling', apiKeyEnvVars: ['ANT_LING_API_KEY'] },
  anthropic: { label: 'Anthropic', apiKeyEnvVars: ['ANTHROPIC_API_KEY', 'ANTHROPIC_OAUTH_TOKEN'] },
  'azure-openai-responses': {
    label: 'Azure OpenAI Responses',
    apiKeyEnvVars: ['AZURE_OPENAI_API_KEY'],
    envHints: [
      'AZURE_OPENAI_BASE_URL',
      'AZURE_OPENAI_RESOURCE_NAME',
      'AZURE_OPENAI_API_VERSION',
      'AZURE_OPENAI_DEPLOYMENT_NAME_MAP'
    ]
  },
  cerebras: { label: 'Cerebras', apiKeyEnvVars: ['CEREBRAS_API_KEY'] },
  'cloudflare-ai-gateway': {
    label: 'Cloudflare AI Gateway',
    apiKeyEnvVars: ['CLOUDFLARE_API_KEY'],
    envHints: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_GATEWAY_ID']
  },
  'cloudflare-workers-ai': {
    label: 'Cloudflare Workers AI',
    apiKeyEnvVars: ['CLOUDFLARE_API_KEY'],
    envHints: ['CLOUDFLARE_ACCOUNT_ID']
  },
  deepseek: { label: 'DeepSeek', apiKeyEnvVars: ['DEEPSEEK_API_KEY'] },
  fireworks: { label: 'Fireworks', apiKeyEnvVars: ['FIREWORKS_API_KEY'] },
  'github-copilot': { label: 'GitHub Copilot', apiKeyEnvVars: ['COPILOT_GITHUB_TOKEN'] },
  google: { label: 'Google Gemini', apiKeyEnvVars: ['GEMINI_API_KEY'] },
  'google-vertex': {
    label: 'Google Vertex AI',
    apiKeyEnvVars: ['GOOGLE_CLOUD_API_KEY'],
    envHints: ['GOOGLE_CLOUD_PROJECT', 'GOOGLE_CLOUD_LOCATION', 'GOOGLE_APPLICATION_CREDENTIALS']
  },
  groq: { label: 'Groq', apiKeyEnvVars: ['GROQ_API_KEY'] },
  huggingface: { label: 'Hugging Face', apiKeyEnvVars: ['HF_TOKEN'] },
  'kimi-coding': { label: 'Kimi For Coding', apiKeyEnvVars: ['KIMI_API_KEY'] },
  minimax: { label: 'MiniMax', apiKeyEnvVars: ['MINIMAX_API_KEY'] },
  'minimax-cn': { label: 'MiniMax China', apiKeyEnvVars: ['MINIMAX_CN_API_KEY'] },
  mistral: { label: 'Mistral', apiKeyEnvVars: ['MISTRAL_API_KEY'] },
  moonshotai: { label: 'Moonshot AI', apiKeyEnvVars: ['MOONSHOT_API_KEY'] },
  'moonshotai-cn': { label: 'Moonshot AI China', apiKeyEnvVars: ['MOONSHOT_API_KEY'] },
  nvidia: { label: 'NVIDIA NIM', apiKeyEnvVars: ['NVIDIA_API_KEY'] },
  openai: { label: 'OpenAI', apiKeyEnvVars: ['OPENAI_API_KEY'] },
  'openai-codex': { label: 'OpenAI Codex' },
  opencode: { label: 'OpenCode Zen', apiKeyEnvVars: ['OPENCODE_API_KEY'] },
  'opencode-go': { label: 'OpenCode Go', apiKeyEnvVars: ['OPENCODE_API_KEY'] },
  openrouter: { label: 'OpenRouter', apiKeyEnvVars: ['OPENROUTER_API_KEY'] },
  together: { label: 'Together AI', apiKeyEnvVars: ['TOGETHER_API_KEY'] },
  'vercel-ai-gateway': { label: 'Vercel AI Gateway', apiKeyEnvVars: ['AI_GATEWAY_API_KEY'] },
  xai: { label: 'xAI', apiKeyEnvVars: ['XAI_API_KEY'] },
  xiaomi: { label: 'Xiaomi MiMo', apiKeyEnvVars: ['XIAOMI_API_KEY'] },
  'xiaomi-token-plan-ams': {
    label: 'Xiaomi MiMo Token Plan Amsterdam',
    apiKeyEnvVars: ['XIAOMI_TOKEN_PLAN_AMS_API_KEY']
  },
  'xiaomi-token-plan-cn': {
    label: 'Xiaomi MiMo Token Plan China',
    apiKeyEnvVars: ['XIAOMI_TOKEN_PLAN_CN_API_KEY']
  },
  'xiaomi-token-plan-sgp': {
    label: 'Xiaomi MiMo Token Plan Singapore',
    apiKeyEnvVars: ['XIAOMI_TOKEN_PLAN_SGP_API_KEY']
  },
  zai: { label: 'ZAI', apiKeyEnvVars: ['ZAI_API_KEY'] },
  'zai-coding-cn': { label: 'ZAI Coding Plan China', apiKeyEnvVars: ['ZAI_CODING_CN_API_KEY'] }
};

export function getProviderMetadata(providerId: string): ProviderMetadata {
  return (
    PROVIDER_METADATA[providerId] ?? {
      label: providerId
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    }
  );
}

export function getProviderDisplayName(providerId: string): string {
  return getProviderMetadata(providerId).label;
}

export function getProviderApiKeyEnvVars(providerId: string): string[] {
  return getProviderMetadata(providerId).apiKeyEnvVars ?? [];
}

export function getProviderEnvHints(providerId: string): string[] {
  return getProviderMetadata(providerId).envHints ?? [];
}
