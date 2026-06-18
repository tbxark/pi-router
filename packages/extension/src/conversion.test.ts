import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  createResponseConverter,
  textFromParts,
  toPiContext,
  toPiToolChoice,
  toolModeLabel,
  toVSCodeResponseParts
} from './conversion';

const DEFAULT_OPTIONS: vscode.ProvideLanguageModelChatResponseOptions = {
  toolMode: vscode.LanguageModelChatToolMode.Auto
};

function dataPart(text: string, mimeType: string): { data: Uint8Array; mimeType: string } {
  return {
    data: new TextEncoder().encode(text),
    mimeType
  };
}

function requestMessage(
  role: vscode.LanguageModelChatMessageRole,
  content: ReadonlyArray<vscode.LanguageModelInputPart | unknown>
): vscode.LanguageModelChatRequestMessage {
  return {
    role,
    content,
    name: undefined
  };
}

function responseDataPart(part: vscode.LanguageModelResponsePart): vscode.LanguageModelDataPart {
  expect(part).toBeInstanceOf(vscode.LanguageModelDataPart);
  return part as vscode.LanguageModelDataPart;
}

describe('conversion', () => {
  it('converts user text and image parts into Pi messages', () => {
    const context = toPiContext(
      [
        requestMessage(vscode.LanguageModelChatMessageRole.User, [
          new vscode.LanguageModelTextPart('describe this: '),
          dataPart('image-bytes', 'image/png')
        ])
      ],
      DEFAULT_OPTIONS
    );

    expect(context.tools).toBeUndefined();
    expect(context.messages).toHaveLength(1);
    expect(context.messages[0]).toMatchObject({
      role: 'user',
      content: [
        { type: 'text', text: 'describe this: ' },
        { type: 'image', data: 'aW1hZ2UtYnl0ZXM=', mimeType: 'image/png' }
      ]
    });
  });

  it('converts assistant tool calls and following tool results', () => {
    const context = toPiContext(
      [
        requestMessage(vscode.LanguageModelChatMessageRole.Assistant, [
          new vscode.LanguageModelToolCallPart('call-1', 'lookup', { query: 'pi' })
        ]),
        requestMessage(vscode.LanguageModelChatMessageRole.User, [
          new vscode.LanguageModelToolResultPart('call-1', [new vscode.LanguageModelTextPart('result')])
        ])
      ],
      DEFAULT_OPTIONS
    );

    expect(context.messages[0]).toMatchObject({
      role: 'assistant',
      content: [{ type: 'toolCall', id: 'call-1', name: 'lookup', arguments: { query: 'pi' } }]
    });
    expect(context.messages[1]).toMatchObject({
      role: 'toolResult',
      toolCallId: 'call-1',
      toolName: 'lookup',
      content: [{ type: 'text', text: 'result' }],
      isError: false
    });
  });

  it('converts tools and normalizes shorthand schemas', () => {
    const context = toPiContext([], {
      toolMode: vscode.LanguageModelChatToolMode.Auto,
      tools: [
        {
          name: 'search',
          description: 'Search docs',
          inputSchema: {
            query: { type: 'string' }
          }
        }
      ]
    });

    expect(context.tools).toEqual([
      {
        name: 'search',
        description: 'Search docs',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          }
        }
      }
    ]);
  });

  it('preserves response metadata through VS Code data parts', () => {
    const [thinkingPart] = toVSCodeResponseParts({
      type: 'thinking_end',
      contentIndex: 0,
      content: 'hidden reasoning',
      partial: {
        content: [{ type: 'thinking', thinking: 'hidden reasoning', thinkingSignature: 'sig', redacted: true }]
      }
    } as never);

    const thinkingDataPart = responseDataPart(thinkingPart);
    expect(thinkingPart).toMatchObject({
      mimeType: 'application/vnd.pi.response-event+json'
    });
    expect(JSON.parse(new TextDecoder().decode(thinkingDataPart.data))).toEqual({
      type: 'thinking_end',
      contentIndex: 0,
      content: 'hidden reasoning',
      thinkingSignature: 'sig',
      redacted: true
    });
  });

  it('falls back to text response parts for text deltas and tool calls', () => {
    expect(
      toVSCodeResponseParts({
        type: 'text_delta',
        delta: 'hello'
      } as never)[0]
    ).toBeInstanceOf(vscode.LanguageModelTextPart);

    expect(
      toVSCodeResponseParts({
        type: 'toolcall_end',
        toolCall: { id: 'call-2', name: 'run', arguments: { command: 'echo' } }
      } as never)[0]
    ).toBeInstanceOf(vscode.LanguageModelToolCallPart);
  });

  it('maps required tool choice per API family', () => {
    expect(toPiToolChoice('openai-completions', vscode.LanguageModelChatToolMode.Auto)).toBe('auto');
    expect(toPiToolChoice('openai-completions', vscode.LanguageModelChatToolMode.Required)).toBe('required');
    expect(toPiToolChoice('anthropic-messages', vscode.LanguageModelChatToolMode.Required)).toBe('any');
    expect(toPiToolChoice('google-generative-ai', vscode.LanguageModelChatToolMode.Required)).toBe('any');
  });

  it('labels tool modes and extracts text from mixed parts', () => {
    expect(toolModeLabel(vscode.LanguageModelChatToolMode.Auto)).toBe('auto');
    expect(toolModeLabel(vscode.LanguageModelChatToolMode.Required)).toBe('required');
    expect(toolModeLabel(99 as vscode.LanguageModelChatToolMode)).toBe('unknown(99)');

    expect(
      textFromParts([
        new vscode.LanguageModelTextPart('a'),
        dataPart('{"b":2}', 'application/json'),
        dataPart('raw', 'application/octet-stream'),
        { c: 3 },
        null
      ])
    ).toBe('a{"b":2}[unsupported attachment: application/octet-stream, 3 bytes]{"c":3}');
  });

  it('restores thinking and text signatures from stored data events', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123);

    const context = toPiContext(
      [
        requestMessage(vscode.LanguageModelChatMessageRole.Assistant, [
          new vscode.LanguageModelTextPart('answer'),
          vscode.LanguageModelDataPart.json(
            { type: 'text_end', contentIndex: 0, content: 'answer', textSignature: 'text-sig' },
            'application/vnd.pi.response-event+json'
          ),
          vscode.LanguageModelDataPart.json(
            { type: 'thinking_delta', contentIndex: 1, delta: 'draft' },
            'application/vnd.pi.thinking+json'
          ),
          vscode.LanguageModelDataPart.json(
            {
              type: 'thinking_end',
              contentIndex: 1,
              content: 'final thought',
              thinkingSignature: 'think-sig',
              redacted: false
            },
            'application/vnd.pi.response-event+json'
          )
        ])
      ],
      DEFAULT_OPTIONS
    );

    expect(context.messages[0]).toMatchObject({
      role: 'assistant',
      timestamp: 123,
      content: [
        { type: 'thinking', thinking: 'final thought', thinkingSignature: 'think-sig', redacted: false },
        { type: 'text', text: 'answer', textSignature: 'text-sig' }
      ]
    });
  });

  it('hoists thinking blocks ahead of text regardless of arrival order', () => {
    const context = toPiContext(
      [
        requestMessage(vscode.LanguageModelChatMessageRole.Assistant, [
          new vscode.LanguageModelTextPart('visible answer'),
          vscode.LanguageModelDataPart.json(
            { type: 'text_end', contentIndex: 0, content: 'visible answer' },
            'application/vnd.pi.response-event+json'
          ),
          vscode.LanguageModelDataPart.json(
            { type: 'thinking_end', contentIndex: 1, content: 'reasoning', thinkingSignature: 'sig' },
            'application/vnd.pi.response-event+json'
          )
        ])
      ],
      DEFAULT_OPTIONS
    );

    expect(context.messages[0]).toMatchObject({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'reasoning', thinkingSignature: 'sig' },
        { type: 'text', text: 'visible answer' }
      ]
    });
  });

  it('backfills visible text when text_end arrives without any text_delta', () => {
    const convert = createResponseConverter();

    const parts = convert({
      type: 'text_end',
      contentIndex: 0,
      content: 'whole answer',
      partial: { content: [{ type: 'text', text: 'whole answer', textSignature: 'sig' }] }
    } as never);

    expect(parts[0]).toBeInstanceOf(vscode.LanguageModelTextPart);
    expect((parts[0] as vscode.LanguageModelTextPart).value).toBe('whole answer');
    expect(parts[1]).toBeInstanceOf(vscode.LanguageModelDataPart);
  });

  it('does not duplicate text when text_end follows streamed deltas', () => {
    const convert = createResponseConverter();

    convert({ type: 'text_delta', contentIndex: 0, delta: 'hel', partial: {} } as never);
    convert({ type: 'text_delta', contentIndex: 0, delta: 'lo', partial: {} } as never);
    const parts = convert({
      type: 'text_end',
      contentIndex: 0,
      content: 'hello',
      partial: { content: [{ type: 'text', text: 'hello' }] }
    } as never);

    expect(parts).toHaveLength(1);
    expect(parts[0]).toBeInstanceOf(vscode.LanguageModelDataPart);
  });

  it('never emits thinking content as a visible text part', () => {
    const convert = createResponseConverter();

    const deltaParts = convert({ type: 'thinking_delta', contentIndex: 0, delta: 'secret', partial: {} } as never);
    const endParts = convert({
      type: 'thinking_end',
      contentIndex: 0,
      content: 'secret',
      partial: { content: [{ type: 'thinking', thinking: 'secret', thinkingSignature: 'sig' }] }
    } as never);

    for (const part of [...deltaParts, ...endParts]) {
      expect(part).not.toBeInstanceOf(vscode.LanguageModelTextPart);
    }
  });
});
