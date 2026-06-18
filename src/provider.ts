import { Buffer } from 'node:buffer';
import * as vscode from 'vscode';
import {
  getApiProvider,
  getModels,
  type Api,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Context,
  type ImageContent,
  type KnownProvider,
  type Message,
  type Model,
  type TextContent,
  type Tool,
  type ToolCall,
  type ToolResultMessage,
  type TSchema
} from '@earendil-works/pi-ai';
import { getOAuthProvider, type OAuthCredentials } from '@earendil-works/pi-ai/oauth';
import { CredentialStore } from './credentials';
import { getProviderDisplayName } from './providerMetadata';

interface DataPartLike {
  data: Uint8Array;
  mimeType: string;
}

interface PromptTsxPartLike {
  value: unknown;
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

const EMPTY_OBJECT_SCHEMA = { type: 'object', properties: {} } satisfies TSchema;

export class PiLanguageModelProvider implements vscode.LanguageModelChatProvider {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;

  constructor(
    private readonly credentials: CredentialStore,
    private readonly output?: vscode.OutputChannel
  ) {}

  refreshModels(): void {
    this.changeEmitter.fire();
  }

  provideLanguageModelChatInformation(
    _options: vscode.PrepareLanguageModelChatModelOptions,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.LanguageModelChatInformation[]> | Promise<vscode.LanguageModelChatInformation[]> {
    return this.getConfiguredModels().then((models) =>
      models.map((model) => ({
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
      }))
    );
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
      progress.report(
        new vscode.LanguageModelTextPart(
          `Credentials are missing for ${resolved.providerId}. Run "Pi Router: Manage Providers" and add this provider.`
        )
      );
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
      this.logRequest(model, messages, _options);

      const requestOptions = {
        apiKey: credentials.apiKey,
        env: credentials.env,
        signal: abort.signal,
        sessionId: `${model.provider}-vscode-pi-chat`
      } as Parameters<typeof apiProvider.streamSimple>[2] & { toolChoice?: string };

      if (_options.tools?.length) {
        requestOptions.toolChoice = toPiToolChoice(model.api, _options.toolMode);
      }

      const stream = apiProvider.streamSimple(model, toPiContext(messages, _options), requestOptions);

      for await (const event of stream) {
        if (token.isCancellationRequested) {
          break;
        }

        this.reportPiEvent(event, progress);
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

  private logRequest(
    model: Model<Api>,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions
  ): void {
    if (!this.output) {
      return;
    }

    const toolNames = options.tools?.map((tool) => tool.name) ?? [];
    this.output.appendLine(
      [
        `[${new Date().toISOString()}] request`,
        `model=${model.provider}/${model.id}`,
        `api=${model.api}`,
        `messages=${messages.length}`,
        `tools=${toolNames.length}`,
        `toolMode=${toolModeLabel(options.toolMode)}`
      ].join(' ')
    );

    if (toolNames.length > 0) {
      this.output.appendLine(`tools: ${toolNames.join(', ')}`);
    }
  }

  private logToolCall(toolCall: ToolCall): void {
    this.output?.appendLine(`[${new Date().toISOString()}] tool_call id=${toolCall.id} name=${toolCall.name}`);
  }

  private reportPiEvent(
    event: AssistantMessageEvent,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>
  ): void {
    if (event.type === 'text_delta') {
      progress.report(new vscode.LanguageModelTextPart(event.delta));
    } else if (event.type === 'thinking_delta') {
      progress.report(toThinkingDataPart(event.delta, event.contentIndex));
    } else if (event.type === 'toolcall_end') {
      this.logToolCall(event.toolCall);
      progress.report(
        new vscode.LanguageModelToolCallPart(event.toolCall.id, event.toolCall.name, event.toolCall.arguments)
      );
    } else if (event.type === 'done') {
      this.logFinalMessage(event.message);
    } else if (event.type === 'error') {
      this.logFinalMessage(event.error);
      throw new Error(event.error.errorMessage ?? 'pi-ai request failed.');
    }
  }

  private logFinalMessage(message: AssistantMessage): void {
    this.output?.appendLine(
      [
        `[${new Date().toISOString()}] response`,
        `model=${message.provider}/${message.model}`,
        `api=${message.api}`,
        `stopReason=${message.stopReason}`,
        `input=${message.usage.input}`,
        `output=${message.usage.output}`,
        `total=${message.usage.totalTokens}`,
        `cost=${message.usage.cost.total}`,
        message.responseId ? `responseId=${message.responseId}` : '',
        message.responseModel ? `responseModel=${message.responseModel}` : ''
      ]
        .filter(Boolean)
        .join(' ')
    );
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

function toPiContext(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  options: vscode.ProvideLanguageModelChatResponseOptions
): Context {
  const toolNamesByCallId = new Map<string, string>();
  const piMessages = messages.flatMap((message) => toPiMessages(message, toolNamesByCallId));

  return {
    messages: piMessages,
    tools: toPiTools(options.tools)
  };
}

function toPiMessages(
  message: vscode.LanguageModelChatRequestMessage,
  toolNamesByCallId: Map<string, string>
): Message[] {
  if (message.role === vscode.LanguageModelChatMessageRole.Assistant) {
    return [
      {
        role: 'assistant',
        content: toAssistantContent(message.content, toolNamesByCallId),
        api: 'openai-completions',
        provider: 'vscode-history',
        model: 'unknown',
        usage: ZERO_USAGE,
        stopReason: 'stop',
        timestamp: Date.now()
      } satisfies AssistantMessage
    ];
  }

  return toUserMessages(message.content, toolNamesByCallId);
}

function toAssistantContent(
  parts: ReadonlyArray<vscode.LanguageModelInputPart | unknown>,
  toolNamesByCallId: Map<string, string>
): AssistantMessage['content'] {
  const content: AssistantMessage['content'] = [];

  for (const part of parts) {
    if (part instanceof vscode.LanguageModelTextPart) {
      if (part.value) {
        content.push({ type: 'text', text: part.value });
      }
    } else if (isToolCallPartLike(part)) {
      toolNamesByCallId.set(part.callId, part.name);
      content.push({
        type: 'toolCall',
        id: part.callId,
        name: part.name,
        arguments: part.input as ToolCall['arguments']
      });
    } else if (isDataPartLike(part)) {
      content.push({ type: 'text', text: dataPartToText(part) });
    } else {
      content.push({ type: 'text', text: unknownPartToText(part) });
    }
  }

  return content.filter((block) => block.type !== 'text' || block.text.length > 0);
}

function toUserMessages(
  parts: ReadonlyArray<vscode.LanguageModelInputPart | unknown>,
  toolNamesByCallId: Map<string, string>
): Message[] {
  const messages: Message[] = [];
  let pendingContent: Array<TextContent | ImageContent> = [];

  const flushUserMessage = (): void => {
    if (pendingContent.length === 0) {
      return;
    }

    messages.push({
      role: 'user',
      content: normalizeUserContent(pendingContent),
      timestamp: Date.now()
    });
    pendingContent = [];
  };

  for (const part of parts) {
    if (part instanceof vscode.LanguageModelTextPart) {
      pendingContent.push({ type: 'text', text: part.value });
    } else if (isDataPartLike(part)) {
      pendingContent.push(dataPartToContent(part));
    } else if (isToolResultPartLike(part)) {
      flushUserMessage();
      messages.push(toToolResultMessage(part, toolNamesByCallId));
    } else {
      pendingContent.push({ type: 'text', text: unknownPartToText(part) });
    }
  }

  flushUserMessage();
  return messages;
}

function toToolResultMessage(
  part: vscode.LanguageModelToolResultPart,
  toolNamesByCallId: Map<string, string>
): ToolResultMessage {
  return {
    role: 'toolResult',
    toolCallId: part.callId,
    toolName: toolNamesByCallId.get(part.callId) ?? 'unknown',
    content: toToolResultContent(part.content),
    isError: false,
    timestamp: Date.now()
  };
}

function toToolResultContent(
  parts: ReadonlyArray<vscode.LanguageModelTextPart | unknown>
): Array<TextContent | ImageContent> {
  const content: Array<TextContent | ImageContent> = [];

  for (const part of parts) {
    if (part instanceof vscode.LanguageModelTextPart) {
      content.push({ type: 'text', text: part.value });
    } else if (isDataPartLike(part)) {
      content.push(dataPartToContent(part));
    } else if (isPromptTsxPartLike(part)) {
      content.push({ type: 'text', text: stableStringify(part.value) });
    } else {
      content.push({ type: 'text', text: unknownPartToText(part) });
    }
  }

  const nonEmptyContent = content.filter((block) => block.type !== 'text' || block.text.length > 0);
  return nonEmptyContent.length > 0 ? nonEmptyContent : [{ type: 'text', text: '' }];
}

function toPiTools(tools: readonly vscode.LanguageModelChatTool[] | undefined): Tool[] | undefined {
  if (!tools?.length) {
    return undefined;
  }

  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: normalizeToolSchema(tool.inputSchema)
  }));
}

function toPiToolChoice(api: Api, toolMode: vscode.LanguageModelChatToolMode): string {
  if (toolMode !== vscode.LanguageModelChatToolMode.Required) {
    return 'auto';
  }

  if (
    api === 'anthropic-messages' ||
    api === 'bedrock-converse-stream' ||
    api === 'google-generative-ai' ||
    api === 'google-vertex'
  ) {
    return 'any';
  }

  return 'required';
}

function normalizeUserContent(blocks: Array<TextContent | ImageContent>): string | Array<TextContent | ImageContent> {
  if (blocks.some((block) => block.type === 'image')) {
    return blocks;
  }

  return blocks.map((block) => (block.type === 'text' ? block.text : '')).join('');
}

function dataPartToContent(part: DataPartLike): TextContent | ImageContent {
  if (part.mimeType.startsWith('image/')) {
    return {
      type: 'image',
      data: Buffer.from(part.data).toString('base64'),
      mimeType: part.mimeType
    };
  }

  return { type: 'text', text: dataPartToText(part) };
}

function dataPartToText(part: DataPartLike): string {
  const text = new TextDecoder().decode(part.data);
  if (part.mimeType.startsWith('text/')) {
    return text;
  }

  if (part.mimeType === 'application/json' || part.mimeType.endsWith('+json')) {
    return text;
  }

  return `[${part.mimeType} data, ${part.data.byteLength} bytes, base64:${Buffer.from(part.data).toString('base64')}]`;
}

function toThinkingDataPart(delta: string, contentIndex: number): vscode.LanguageModelResponsePart {
  const payload = {
    type: 'thinking_delta',
    contentIndex,
    delta
  };
  const dataPart = (
    vscode as unknown as {
      LanguageModelDataPart?: {
        json(value: unknown, mime?: string): vscode.LanguageModelResponsePart;
      };
    }
  ).LanguageModelDataPart;

  return dataPart?.json(payload, 'application/vnd.pi.thinking+json') ?? new vscode.LanguageModelTextPart(delta);
}

function normalizeToolSchema(schema: object | undefined): TSchema {
  if (!schema || typeof schema !== 'object') {
    return EMPTY_OBJECT_SCHEMA;
  }

  if (
    'type' in schema ||
    'properties' in schema ||
    '$ref' in schema ||
    'anyOf' in schema ||
    'oneOf' in schema ||
    'allOf' in schema
  ) {
    return schema as TSchema;
  }

  return {
    ...EMPTY_OBJECT_SCHEMA,
    properties: schema as Record<string, unknown>
  } as TSchema;
}

function toolModeLabel(toolMode: vscode.LanguageModelChatToolMode): string {
  switch (toolMode) {
    case vscode.LanguageModelChatToolMode.Auto:
      return 'auto';
    case vscode.LanguageModelChatToolMode.Required:
      return 'required';
    default:
      return `unknown(${toolMode})`;
  }
}

function textFromParts(parts: ReadonlyArray<vscode.LanguageModelInputPart | unknown>): string {
  return parts
    .map((part) => {
      if (part instanceof vscode.LanguageModelTextPart) {
        return part.value;
      }

      if (isDataPartLike(part)) {
        return dataPartToText(part);
      }

      return unknownPartToText(part);
    })
    .join('');
}

function unknownPartToText(part: unknown): string {
  if (part === undefined || part === null) {
    return '';
  }

  if (typeof part === 'string') {
    return part;
  }

  return stableStringify(part);
}

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isDataPartLike(part: unknown): part is DataPartLike {
  return (
    typeof part === 'object' &&
    part !== null &&
    'mimeType' in part &&
    typeof part.mimeType === 'string' &&
    'data' in part &&
    part.data instanceof Uint8Array
  );
}

function isToolCallPartLike(part: unknown): part is vscode.LanguageModelToolCallPart {
  return part instanceof vscode.LanguageModelToolCallPart;
}

function isToolResultPartLike(part: unknown): part is vscode.LanguageModelToolResultPart {
  return part instanceof vscode.LanguageModelToolResultPart;
}

function isPromptTsxPartLike(part: unknown): part is PromptTsxPartLike {
  return part instanceof vscode.LanguageModelPromptTsxPart;
}
