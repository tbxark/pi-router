import { Buffer } from 'node:buffer';
import * as vscode from 'vscode';
import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Context,
  type ImageContent,
  type Message,
  type TextContent,
  type ThinkingContent,
  type Tool,
  type ToolCall,
  type ToolResultMessage,
  type TSchema
} from '@earendil-works/pi-ai';

interface DataPartLike {
  data: Uint8Array;
  mimeType: string;
}

interface PromptTsxPartLike {
  value: unknown;
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
const PI_RESPONSE_EVENT_MIME = 'application/vnd.pi.response-event+json';
const PI_THINKING_DELTA_MIME = 'application/vnd.pi.thinking+json';

type PiResponseDataEvent =
  | {
      type: 'text_end';
      contentIndex: number;
      content: string;
      textSignature?: string;
    }
  | {
      type: 'thinking_delta';
      contentIndex: number;
      delta: string;
    }
  | {
      type: 'thinking_end';
      contentIndex: number;
      content: string;
      thinkingSignature?: string;
      redacted?: boolean;
    };

export function toPiContext(
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
  const thinkingBlocksByIndex = new Map<number, ThinkingContent>();

  const ensureThinkingBlock = (contentIndex: number): ThinkingContent => {
    const existing = thinkingBlocksByIndex.get(contentIndex);
    if (existing) {
      return existing;
    }

    const block: ThinkingContent = { type: 'thinking', thinking: '' };
    thinkingBlocksByIndex.set(contentIndex, block);
    content.push(block);
    return block;
  };

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
      const event = dataPartToPiResponseEvent(part);
      if (event?.type === 'thinking_delta') {
        ensureThinkingBlock(event.contentIndex).thinking += event.delta;
      } else if (event?.type === 'thinking_end') {
        const block = ensureThinkingBlock(event.contentIndex);
        block.thinking = event.content;
        block.thinkingSignature = event.thinkingSignature;
        block.redacted = event.redacted;
      } else if (event?.type === 'text_end') {
        const lastTextBlock = [...content].reverse().find((block): block is TextContent => block.type === 'text');
        if (lastTextBlock) {
          lastTextBlock.textSignature = event.textSignature;
        }
      } else {
        content.push({ type: 'text', text: dataPartToText(part) });
      }
    } else {
      content.push({ type: 'text', text: unknownPartToText(part) });
    }
  }

  const nonEmpty = content.filter((block) => block.type !== 'text' || block.text.length > 0);

  // Providers such as Anthropic require thinking blocks to lead the assistant turn.
  // The block order above mirrors the order parts arrived in; stably hoisting thinking
  // blocks to the front makes that guarantee explicit instead of relying on the host
  // preserving the original streaming order during history replay.
  return stableSortThinkingFirst(nonEmpty);
}

function stableSortThinkingFirst(blocks: AssistantMessage['content']): AssistantMessage['content'] {
  const thinking = blocks.filter((block) => block.type === 'thinking');
  if (thinking.length === 0 || thinking.length === blocks.length) {
    return blocks;
  }

  return [...thinking, ...blocks.filter((block) => block.type !== 'thinking')];
}

function toUserMessages(
  parts: ReadonlyArray<vscode.LanguageModelInputPart | unknown>,
  toolNamesByCallId: Map<string, string>
): Message[] {
  const messages: Message[] = [];
  let pendingContent: Array<TextContent | ImageContent> = [];

  const flushUserMessage = (): void => {
    // Drop empty text blocks so a message that only carried whitespace-free empty
    // parts does not turn into an empty user message (which some providers reject).
    const meaningful = pendingContent.filter((block) => block.type !== 'text' || block.text.length > 0);
    if (meaningful.length === 0) {
      pendingContent = [];
      return;
    }

    messages.push({
      role: 'user',
      content: normalizeUserContent(meaningful),
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
    // VS Code's request-side LanguageModelToolResultPart carries no error flag, so we
    // cannot reliably tell whether the tool failed. Any error text lives in `content`.
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

export function toPiToolChoice(api: Api, toolMode: vscode.LanguageModelChatToolMode): string {
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

export type ResponseConverter = (event: AssistantMessageEvent) => vscode.LanguageModelResponsePart[];

/**
 * Creates a stateful converter for a single response stream. State is needed so
 * that `text_end` can detect whether any `text_delta` ever carried the visible
 * text for a given content index. Some providers stream the whole text only in
 * `text_end.content` without emitting deltas; without this guard that text would
 * never reach the user (and would be lost on history replay too).
 */
export function createResponseConverter(): ResponseConverter {
  const textIndicesWithDelta = new Set<number>();

  return (event: AssistantMessageEvent): vscode.LanguageModelResponsePart[] => {
    if (event.type === 'text_delta') {
      textIndicesWithDelta.add(event.contentIndex);
      return [new vscode.LanguageModelTextPart(event.delta)];
    }

    if (event.type === 'text_end') {
      const block = event.partial.content[event.contentIndex];
      const textSignature = block?.type === 'text' ? block.textSignature : undefined;
      const parts: vscode.LanguageModelResponsePart[] = [];

      // Backfill the visible text when no delta was ever streamed for this index.
      if (!textIndicesWithDelta.has(event.contentIndex) && event.content.length > 0) {
        parts.push(new vscode.LanguageModelTextPart(event.content));
      }

      const dataPart = toPiDataPart({
        type: 'text_end',
        contentIndex: event.contentIndex,
        content: event.content,
        textSignature
      });
      if (dataPart) {
        parts.push(dataPart);
      }

      return parts;
    }

    if (event.type === 'thinking_delta') {
      const dataPart = toPiDataPart({ type: 'thinking_delta', contentIndex: event.contentIndex, delta: event.delta });
      return dataPart ? [dataPart] : [];
    }

    if (event.type === 'thinking_end') {
      const block = event.partial.content[event.contentIndex];
      const dataPart = toPiDataPart({
        type: 'thinking_end',
        contentIndex: event.contentIndex,
        content: event.content,
        thinkingSignature: block?.type === 'thinking' ? block.thinkingSignature : undefined,
        redacted: block?.type === 'thinking' ? block.redacted : undefined
      });
      return dataPart ? [dataPart] : [];
    }

    if (event.type === 'toolcall_end') {
      return [new vscode.LanguageModelToolCallPart(event.toolCall.id, event.toolCall.name, event.toolCall.arguments)];
    }

    return [];
  };
}

/**
 * Stateless convenience wrapper around {@link createResponseConverter}. Prefer the
 * factory for live response streams; this is kept for one-off conversions and tests.
 */
export function toVSCodeResponseParts(event: AssistantMessageEvent): vscode.LanguageModelResponsePart[] {
  return createResponseConverter()(event);
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

  // Binary attachments (PDFs, audio, etc.) cannot be consumed as text by the model.
  // Emit a compact placeholder instead of inlining the full base64 payload, which
  // would otherwise flood the context with an undecodable blob.
  return `[unsupported attachment: ${part.mimeType}, ${part.data.byteLength} bytes]`;
}

function dataPartToPiResponseEvent(part: DataPartLike): PiResponseDataEvent | undefined {
  if (part.mimeType !== PI_RESPONSE_EVENT_MIME && part.mimeType !== PI_THINKING_DELTA_MIME) {
    return undefined;
  }

  try {
    const value = JSON.parse(new TextDecoder().decode(part.data)) as Partial<PiResponseDataEvent>;
    if (value.type === 'text_end' && typeof value.contentIndex === 'number' && typeof value.content === 'string') {
      return {
        type: 'text_end',
        contentIndex: value.contentIndex,
        content: value.content,
        textSignature: typeof value.textSignature === 'string' ? value.textSignature : undefined
      };
    }

    if (value.type === 'thinking_delta' && typeof value.contentIndex === 'number' && typeof value.delta === 'string') {
      return { type: 'thinking_delta', contentIndex: value.contentIndex, delta: value.delta };
    }

    if (value.type === 'thinking_end' && typeof value.contentIndex === 'number' && typeof value.content === 'string') {
      return {
        type: 'thinking_end',
        contentIndex: value.contentIndex,
        content: value.content,
        thinkingSignature: typeof value.thinkingSignature === 'string' ? value.thinkingSignature : undefined,
        redacted: typeof value.redacted === 'boolean' ? value.redacted : undefined
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function toPiDataPart(payload: PiResponseDataEvent): vscode.LanguageModelResponsePart | undefined {
  const dataPart = (
    vscode as unknown as {
      LanguageModelDataPart?: {
        json(value: unknown, mime?: string): vscode.LanguageModelResponsePart;
      };
    }
  ).LanguageModelDataPart;

  // When the host lacks LanguageModelDataPart we cannot round-trip reasoning
  // metadata. Returning undefined drops these hidden payloads rather than leaking
  // thinking content into the visible response as plain text.
  return dataPart?.json(payload, payload.type === 'thinking_delta' ? PI_THINKING_DELTA_MIME : PI_RESPONSE_EVENT_MIME);
}

function normalizeToolSchema(schema: object | undefined): TSchema {
  if (!schema || typeof schema !== 'object') {
    return EMPTY_OBJECT_SCHEMA;
  }

  if (looksLikeJsonSchema(schema)) {
    return schema as TSchema;
  }

  return {
    ...EMPTY_OBJECT_SCHEMA,
    properties: schema as Record<string, unknown>
  } as TSchema;
}

/**
 * Heuristic to tell a real JSON Schema from a `{ propName: descriptor }` shorthand.
 * Checks the *shape* of each keyword's value rather than mere key presence, so a tool
 * parameter that happens to be named `type`/`properties`/`anyOf`/... (whose value would
 * be an object/array of the wrong shape) is not misread as a full schema.
 */
function looksLikeJsonSchema(schema: object): boolean {
  const record = schema as Record<string, unknown>;
  const type = record.type;
  if (typeof type === 'string' || (Array.isArray(type) && type.every((entry) => typeof entry === 'string'))) {
    return true;
  }

  if (typeof record.$ref === 'string') {
    return true;
  }

  if (record.properties !== null && typeof record.properties === 'object' && !Array.isArray(record.properties)) {
    return true;
  }

  return ['anyOf', 'oneOf', 'allOf'].some((keyword) => Array.isArray(record[keyword]));
}

export function toolModeLabel(toolMode: vscode.LanguageModelChatToolMode): string {
  switch (toolMode) {
    case vscode.LanguageModelChatToolMode.Auto:
      return 'auto';
    case vscode.LanguageModelChatToolMode.Required:
      return 'required';
    default:
      return `unknown(${toolMode})`;
  }
}

export function textFromParts(parts: ReadonlyArray<vscode.LanguageModelInputPart | unknown>): string {
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
