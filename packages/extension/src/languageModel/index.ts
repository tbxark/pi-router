import * as vscode from 'vscode';
import { type Api, type AssistantMessageEvent, type Model, type SimpleStreamOptions } from '@earendil-works/pi-ai';
import {
  createResponseConverter,
  textFromParts,
  toPiContext,
  toPiToolChoice,
  type ResponseConverter
} from './conversion';
import { CredentialStore } from '../credentials';
import { createPiModels } from '../shared/piModels';
import { getProviderDisplayName } from '../shared/providerMetadata';
import { decodeLanguageModelId, encodeLanguageModelId, resolveReasoningLevel } from './modelUtils';
import { RequestLogger } from './requestLogger';

interface ResolvedLanguageModel {
  model: Model<Api>;
  providerId: string;
}

export class PiLanguageModelProvider implements vscode.LanguageModelChatProvider {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;
  private readonly logger: RequestLogger;
  private readonly models: ReturnType<typeof createPiModels>;

  constructor(
    private readonly credentials: CredentialStore,
    output?: vscode.OutputChannel
  ) {
    this.logger = new RequestLogger(output);
    this.models = createPiModels(credentials);
  }

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
        // Reserve the output budget so input is not allowed to fill the whole window.
        maxInputTokens: Math.max(1, model.contextWindow - model.maxTokens),
        maxOutputTokens: model.maxTokens,
        capabilities: {
          imageInput: model.input.includes('image'),
          // pi-ai's Model has no per-model tool-calling flag, so we advertise tool
          // support unconditionally. Models that cannot call tools will surface that
          // as an API error at request time rather than being filtered here.
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

    const settings = await this.credentials.getProviderRequestSettings(resolved.providerId);
    if (!settings || !(await this.credentials.canResolveModelAuth(resolved.model, settings.env))) {
      progress.report(
        new vscode.LanguageModelTextPart(
          `Credentials are missing for ${resolved.providerId}. Run "Pi Router: Manage Providers" and add this provider.`
        )
      );
      return;
    }

    const model = resolved.model;

    const abort = new AbortController();
    const disposable = token.onCancellationRequested(() => abort.abort());
    try {
      const requestOptions: SimpleStreamOptions & { toolChoice?: string } = {
        env: settings.env,
        signal: abort.signal,
        sessionId: `${model.provider}-vscode-pi-chat`
      };

      if (_options.tools?.length) {
        requestOptions.toolChoice = toPiToolChoice(model.api, _options.toolMode);
      }

      const reasoning = resolveReasoningLevel(model, settings.reasoning?.[resolved.model.id]);
      if (reasoning) {
        requestOptions.reasoning = reasoning;
      }

      this.logger.logRequest(model, { messages, options: _options, reasoning: requestOptions.reasoning });

      const stream = this.models.streamSimple(model, toPiContext(messages, _options), requestOptions);
      const convertEvent = createResponseConverter();

      for await (const event of stream) {
        if (token.isCancellationRequested) {
          break;
        }

        this.reportPiEvent(event, convertEvent, progress);
      }
    } catch (error) {
      // A cancellation surfaces as an aborted request from some providers; swallow it
      // so cancelling a chat does not show a spurious error to the user.
      if (token.isCancellationRequested || abort.signal.aborted) {
        return;
      }
      throw error;
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

    const model = this.models.getModel(parsed.providerId, parsed.modelId);
    return model ? { model, providerId: parsed.providerId } : undefined;
  }

  private async getConfiguredModels(): Promise<Model<Api>[]> {
    const summaries = await this.credentials.listProviderCredentials();
    return summaries
      .filter((summary) => summary.hasKey)
      .flatMap((summary) => this.models.getModels(summary.providerId) as Model<Api>[]);
  }

  private reportPiEvent(
    event: AssistantMessageEvent,
    convertEvent: ResponseConverter,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>
  ): void {
    for (const part of convertEvent(event)) {
      progress.report(part);
    }

    if (event.type === 'toolcall_end') {
      this.logger.logToolCall(event.toolCall);
    } else if (event.type === 'done') {
      this.logger.logResponse(event.message);
    } else if (event.type === 'error') {
      this.logger.logError(event.error);
      throw new Error(event.error.errorMessage ?? 'pi-ai request failed.');
    }
  }
}
