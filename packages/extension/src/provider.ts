import * as vscode from 'vscode';
import {
  getApiProvider,
  getModels,
  type Api,
  type AssistantMessage,
  type AssistantMessageEvent,
  type KnownProvider,
  type Model,
  type ToolCall
} from '@earendil-works/pi-ai';
import { getOAuthProvider, type OAuthCredentials } from '@earendil-works/pi-ai/oauth';
import { textFromParts, toPiContext, toPiToolChoice, toVSCodeResponseParts, toolModeLabel } from './conversion';
import { CredentialStore } from './credentials';
import { getProviderDisplayName } from './providerMetadata';

interface ResolvedLanguageModel {
  model: Model<Api>;
  providerId: string;
}

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
    for (const part of toVSCodeResponseParts(event)) {
      progress.report(part);
    }

    if (event.type === 'toolcall_end') {
      this.logToolCall(event.toolCall);
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
