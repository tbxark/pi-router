import * as vscode from 'vscode';
import { type Api, type AssistantMessage, type Model, type ToolCall } from '@earendil-works/pi-ai';
import { OutputLogger } from '../shared/logger';
import { toolModeLabel } from './conversion';

type RequestLogOptions = {
  messages: readonly vscode.LanguageModelChatRequestMessage[];
  options: vscode.ProvideLanguageModelChatResponseOptions;
  reasoning: string | undefined;
};

// Formats pi-ai request/response activity into the "Pi Router" output channel.
// All methods are no-ops when no channel is provided.
export class RequestLogger {
  private readonly logger: OutputLogger;

  constructor(output?: vscode.OutputChannel) {
    this.logger = new OutputLogger(output);
  }

  logRequest(model: Model<Api>, request: RequestLogOptions): void {
    if (!this.logger.shouldLog('info')) {
      return;
    }

    const toolNames = request.options.tools?.map((tool) => tool.name) ?? [];
    this.logger.info(
      [
        `[${new Date().toISOString()}] request`,
        `model=${model.provider}/${model.id}`,
        `api=${model.api}`,
        `messages=${request.messages.length}`,
        `tools=${toolNames.length}`,
        `toolMode=${toolModeLabel(request.options.toolMode)}`
      ].join(' ')
    );

    this.logger.debug(`reasoning=${request.reasoning ?? 'off'}`);
    this.logger.debug(toolNames.length > 0 ? `tools: ${toolNames.join(', ')}` : 'tools: none');
  }

  logToolCall(toolCall: ToolCall): void {
    this.logger.debug(`[${new Date().toISOString()}] tool_call id=${toolCall.id} name=${toolCall.name}`);
  }

  logResponse(message: AssistantMessage): void {
    if (!this.logger.shouldLog('info')) {
      return;
    }

    const fields = [
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
    ];

    if (this.logger.shouldLog('debug')) {
      const thinkingBlocks = message.content.filter((block) => block.type === 'thinking');
      const thinkingChars = thinkingBlocks.reduce((total, block) => total + block.thinking.length, 0);
      fields.push(`thinkingBlocks=${thinkingBlocks.length}`, `thinkingChars=${thinkingChars}`);
    }

    this.logger.info(fields.filter(Boolean).join(' '));
  }

  logError(message: AssistantMessage): void {
    this.logger.error(
      [
        `[${new Date().toISOString()}] error`,
        `model=${message.provider}/${message.model}`,
        `api=${message.api}`,
        `stopReason=${message.stopReason}`,
        message.errorMessage ? `message=${message.errorMessage}` : '',
        message.responseId ? `responseId=${message.responseId}` : '',
        message.responseModel ? `responseModel=${message.responseModel}` : ''
      ]
        .filter(Boolean)
        .join(' ')
    );
  }
}
