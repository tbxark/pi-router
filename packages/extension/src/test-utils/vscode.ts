export enum LanguageModelChatMessageRole {
  User = 1,
  Assistant = 2
}

// Minimal storage/context shapes so credential tests can inject in-memory
// fakes without depending on the real `vscode` module types.
export interface SecretStorage {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ExtensionContext {
  secrets: SecretStorage;
}

export enum LanguageModelChatToolMode {
  Auto = 1,
  Required = 2
}

export class LanguageModelTextPart {
  public constructor(public readonly value: string) {}
}

export class LanguageModelToolCallPart {
  public constructor(
    public readonly callId: string,
    public readonly name: string,
    public readonly input: unknown
  ) {}
}

export class LanguageModelToolResultPart {
  public constructor(
    public readonly callId: string,
    public readonly content: readonly unknown[]
  ) {}
}

export class LanguageModelPromptTsxPart {
  public constructor(public readonly value: unknown) {}
}

export class LanguageModelDataPart {
  private constructor(
    public readonly data: Uint8Array,
    public readonly mimeType: string
  ) {}

  public static json(value: unknown, mime = 'application/json'): LanguageModelDataPart {
    return new LanguageModelDataPart(new TextEncoder().encode(JSON.stringify(value)), mime);
  }
}
