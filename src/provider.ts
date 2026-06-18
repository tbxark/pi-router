import { Buffer } from 'node:buffer';
import * as vscode from 'vscode';
import {
  getApiProvider,
  getModels,
  type Api,
  type AssistantMessage,
  type Context,
  type ImageContent,
  type KnownProvider,
  type Message,
  type Model,
  type TextContent
} from '@earendil-works/pi-ai';
import { getOAuthProvider, type OAuthCredentials } from '@earendil-works/pi-ai/oauth';
import { CredentialStore } from './credentials.js';
import { getProviderDisplayName } from './providerMetadata.js';

interface DataPartLike {
  data: Uint8Array;
  mimeType: string;
}

interface ResolvedLanguageModel {
  model: Model<Api>;
  providerId: string;
}

const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0
  }
};

export class PiLanguageModelProvider implements vscode.LanguageModelChatProvider {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;

  constructor(private readonly credentials: CredentialStore) {}

  refreshModels(): void {
    this.changeEmitter.fire();
  }

  provideLanguageModelChatInformation(
    _options: vscode.PrepareLanguageModelChatModelOptions,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.LanguageModelChatInformation[]> | Promise<vscode.LanguageModelChatInformation[]> {
    return this.getConfiguredModels().then((models) => models.map((model) => ({
      id: encodeLanguageModelId(model.provider, model.id),
      name: model.name,
      family: getProviderDisplayName(model.provider),
      detail: `${getProviderDisplayName(model.provider)} via pi-ai`,
      tooltip: `${model.provider}/${model.id}`,
      version: '1.0.0',
      maxInputTokens: model.contextWindow,
      maxOutputTokens: model.maxTokens,
      capabilities: {
        imageInput: model.input.includes('image'),
        toolCalling: true
      }
    })));
  }

  async provideLanguageModelChatResponse(
    modelInfo: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    _options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const resolved = await this.resolveModel(modelInfo.id);
    if (!resolved) {
      progress.report(new vscode.LanguageModelTextPart(`Unknown Pi model: ${modelInfo.id}`));
      return;
    }

    const credentials = await this.credentials.resolveProviderCredentials(resolved.providerId);
    if (!credentials?.apiKey) {
      progress.report(new vscode.LanguageModelTextPart(`Credentials are missing for ${resolved.providerId}. Run "Pi Router: Manage Providers" and add this provider.`));
      return;
    }

    const model = applyOAuthModelOverrides(resolved.model, credentials.oauthCredentials);
    const apiProvider = getApiProvider(model.api);
    if (!apiProvider) {
      throw new Error(`No pi-ai API provider registered for ${model.api}.`);
    }

    const abort = new AbortController();
    const disposable = token.onCancellationRequested(() => abort.abort());
    try {
      const stream = apiProvider.streamSimple(model, toPiContext(messages), {
        apiKey: credentials.apiKey,
        env: credentials.env,
        signal: abort.signal,
        sessionId: `${model.provider}-vscode-pi-chat`
      });

      for await (const event of stream) {
        if (token.isCancellationRequested) {
          break;
        }

        if (event.type === 'text_delta') {
          progress.report(new vscode.LanguageModelTextPart(event.delta));
        } else if (event.type === 'error') {
          throw new Error(event.error.errorMessage ?? 'pi-ai request failed.');
        }
      }
    } finally {
      disposable.dispose();
    }
  }

  async provideTokenCount(
    _model: vscode.LanguageModelChatInformation,
    input: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken
  ): Promise<number> {
    const text = typeof input === 'string' ? input : textFromParts(input.content);
    return Math.ceil(text.length / 4);
  }

  private async resolveModel(id: string): Promise<ResolvedLanguageModel | undefined> {
    const parsed = decodeLanguageModelId(id);
    if (!parsed) {
      return undefined;
    }

    const model = getModels(parsed.providerId as KnownProvider).find((candidate) => candidate.id === parsed.modelId);
    return model ? { model, providerId: parsed.providerId } : undefined;
  }

  private async getConfiguredModels(): Promise<Model<Api>[]> {
    const providerIds = await this.credentials.getConfiguredProviderIds();
    return providerIds.flatMap((providerId) => getModels(providerId as KnownProvider) as Model<Api>[]);
  }
}

function encodeLanguageModelId(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`;
}

function decodeLanguageModelId(id: string): { providerId: string; modelId: string } | undefined {
  const separator = id.indexOf('/');
  if (separator <= 0) {
    return undefined;
  }

  return {
    providerId: id.slice(0, separator),
    modelId: id.slice(separator + 1)
  };
}

function applyOAuthModelOverrides(model: Model<Api>, credentials: OAuthCredentials | undefined): Model<Api> {
  if (!credentials) {
    return model;
  }

  const provider = getOAuthProvider(model.provider);
  return (provider?.modifyModels?.([model], credentials) as Model<Api>[] | undefined)?.[0] ?? model;
}

function toPiContext(messages: readonly vscode.LanguageModelChatRequestMessage[]): Context {
  return {
    messages: messages.map(toPiMessage)
  };
}

function toPiMessage(message: vscode.LanguageModelChatRequestMessage): Message {
  if (message.role === vscode.LanguageModelChatMessageRole.Assistant) {
    return {
      role: 'assistant',
      content: [{ type: 'text', text: textFromParts(message.content) }],
      api: 'openai-completions',
      provider: 'vscode-history',
      model: 'unknown',
      usage: ZERO_USAGE,
      stopReason: 'stop',
      timestamp: Date.now()
    } satisfies AssistantMessage;
  }

  return {
    role: 'user',
    content: toUserContent(message.content),
    timestamp: Date.now()
  };
}

function toUserContent(parts: ReadonlyArray<vscode.LanguageModelInputPart | unknown>): string | Array<TextContent | ImageContent> {
  const blocks: Array<TextContent | ImageContent> = [];

  for (const part of parts) {
    if (part instanceof vscode.LanguageModelTextPart) {
      blocks.push({ type: 'text', text: part.value });
    } else if (isDataPartLike(part) && part.mimeType.startsWith('image/')) {
      blocks.push({
        type: 'image',
        data: Buffer.from(part.data).toString('base64'),
        mimeType: part.mimeType
      });
    } else if (isDataPartLike(part) && part.mimeType.startsWith('text/')) {
      blocks.push({ type: 'text', text: new TextDecoder().decode(part.data) });
    }
  }

  if (blocks.some((block) => block.type === 'image')) {
    return blocks;
  }

  return blocks.map((block) => block.type === 'text' ? block.text : '').join('');
}

function textFromParts(parts: ReadonlyArray<vscode.LanguageModelInputPart | unknown>): string {
  return parts.map((part) => {
    if (part instanceof vscode.LanguageModelTextPart) {
      return part.value;
    }

    if (isDataPartLike(part) && part.mimeType.startsWith('text/')) {
      return new TextDecoder().decode(part.data);
    }

    return '';
  }).join('');
}

function isDataPartLike(part: unknown): part is DataPartLike {
  return typeof part === 'object'
    && part !== null
    && 'mimeType' in part
    && typeof part.mimeType === 'string'
    && 'data' in part
    && part.data instanceof Uint8Array;
}
