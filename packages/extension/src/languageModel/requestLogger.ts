import * as vscode from 'vscode';
import { type Api, type AssistantMessage, type Model, type ToolCall } from '@earendil-works/pi-ai';
import { toolModeLabel } from './conversion';

// Formats pi-ai request/response activity into the "Pi Router" output channel.
// All methods are no-ops when no channel is provided.
export class RequestLogger {
  constructor(private readonly output?: vscode.OutputChannel) {}

  logRequest(
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

  logToolCall(toolCall: ToolCall): void {
    this.output?.appendLine(`[${new Date().toISOString()}] tool_call id=${toolCall.id} name=${toolCall.name}`);
  }

  logResponse(message: AssistantMessage): void {
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
