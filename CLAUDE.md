# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Pi Router is a VS Code extension that exposes the models supported by `@earendil-works/pi-ai` through the VS Code Language Model Chat API. It registers models from credential-configured providers under the `pi-router` vendor. Credentials live in VS Code SecretStorage (never on disk); both API keys and OAuth flows are supported.

## Monorepo layout

pnpm workspace with two packages under `packages/`:

- **`packages/extension`** (`pi-router`) — the VS Code extension itself (TypeScript, Node target). This is where almost all logic lives.
- **`packages/config-panel`** (`@pi-router/config-panel`) — a Vue 3 + Vite webview UI for the provider management panel. Built separately, then its `dist/` is copied into the extension's `out/webview/`.

The two packages communicate only via `postMessage` over the VS Code webview bridge; there is no shared TypeScript import between them. The message contract is duplicated: `ConfigMessage`/`PanelState` in [configPanel.ts](packages/extension/src/configPanel.ts) on the extension side, and `WebviewMessage`/`ExtensionMessage` in [packages/config-panel/src/types/messages.ts](packages/config-panel/src/types/messages.ts) on the webview side. Keep both in sync when adding messages.

## Commands

All commands run from the repo root unless noted. `pnpm run -r <script>` fans out to both packages.

- `pnpm install` — install (requires pnpm 11.7.0; `corepack enable` if missing)
- `pnpm run compile` — `tsc` typecheck/emit across both packages (config-panel uses `vue-tsc`)
- `pnpm run build` — build config-panel then the extension
- `pnpm run bundle` — esbuild the extension entry into `out/extension.js`
- `pnpm run lint` / `pnpm run lint:fix` — ESLint (lint:fix also runs `oxlint --fix`)
- `pnpm run format` / `pnpm run format:check` — oxfmt
- `pnpm run test` — Vitest (run mode); `pnpm run test:watch` for watch
- `pnpm run package:vsix` — full build + produce `packages/extension/pi-router.vsix`
- `pnpm run install:vsix` — package and install into the local VS Code

Run a single test file (from `packages/extension`): `pnpm vitest run src/conversion.test.ts`. Filter by name: `pnpm vitest run -t "<pattern>"`.

To debug the extension live, use the **Run Extension** launch config (F5). Its `preLaunchTask` builds the config-panel, copies the webview, and bundles before launching an Extension Host.

## Testing

Vitest is configured in [packages/extension/vitest.config.ts](packages/extension/vitest.config.ts). Tests only match `src/**/*.test.ts`. The `vscode` module is aliased to a hand-written stub at [packages/extension/src/test-utils/vscode.ts](packages/extension/src/test-utils/vscode.ts) so unit tests can run without an Extension Host. When code under test starts using a new `vscode` API, add it to that stub or tests will fail to resolve it.

## Extension architecture

Activation wiring is in [extension.ts](packages/extension/src/extension.ts): it constructs a `CredentialStore` and a `PiLanguageModelProvider`, registers the provider under `VENDOR_ID = 'pi-router'`, and registers the four `piRouter.*` commands. Model lists are refreshed (via `provider.refreshModels()`) whenever credentials, secrets, or `piRouter` configuration change.

Key modules in `packages/extension/src/`:

- **[provider.ts](packages/extension/src/provider.ts)** — `PiLanguageModelProvider implements vscode.LanguageModelChatProvider`. Lists configured models, streams responses by calling `apiProvider.streamSimple(...)` from pi-ai, and logs to the "Pi Router" output channel. Model IDs are encoded as `providerId/modelId` (`encodeLanguageModelId`/`decodeLanguageModelId`); the first `/` is the separator, so provider IDs must not contain a leading slash. `provideTokenCount` is a rough `length/4` estimate, not a real tokenizer.
- **[conversion.ts](packages/extension/src/conversion.ts)** — the bridge between VS Code's chat types and pi-ai's `Context`/`Message` types. Converts request messages (text, images, tool calls, tool results) into pi-ai input, and converts pi-ai streaming events back into `vscode.LanguageModelResponsePart`s. Thinking/text-signature data is round-tripped through custom MIME data parts (`application/vnd.pi.response-event+json`, `application/vnd.pi.thinking+json`) so reasoning blocks survive across turns. Tool-choice mapping is API-specific (`toPiToolChoice` — Anthropic/Bedrock/Google use `any`, others `required`).
- **[credentials.ts](packages/extension/src/credentials.ts)** — `CredentialStore` persists a versioned JSON blob to SecretStorage under `piRouter.providers.v1`. Each provider entry is either an `api_key` (optional key + provider-scoped `env`) or `oauth` credential. `resolveProviderCredentials` refreshes/persists OAuth tokens on read. Handles one-time migration from legacy secret keys (`piModelProvider.*`). OAuth login UX is driven through `OAuthLoginCallbacks`; the CLI-command path uses native VS Code dialogs (`createOAuthCallbacks`), while the webview path bridges callbacks to `postMessage` (see configPanel.ts).
- **[configPanel.ts](packages/extension/src/configPanel.ts)** — opens the webview panel, serves the built Vue app from `out/webview/` (rewriting asset paths and injecting a CSP nonce in `getHtml`), and handles all `postMessage` traffic including the OAuth-in-webview flow (a single `oauthResolver` bridges async pi-ai callbacks to webview round-trips).
- **[providerMetadata.ts](packages/extension/src/providerMetadata.ts)** — static lookup table mapping pi-ai provider IDs to display names, API-key env var names, and extra env hints. Unknown providers get a title-cased fallback label. Add entries here when supporting a new provider's credential UI.

### Provider/model data source

The set of available providers and models is **not** defined in this repo — it comes from `@earendil-works/pi-ai` (`getProviders()`, `getModels()`, `getApiProvider()`, `getEnvApiKey()`) and `@earendil-works/pi-ai/oauth` (`getOAuthProviders()`, `getOAuthProvider()`, `getOAuthApiKey()`). The extension is essentially a VS Code adapter over that library. Bumping the pinned `@earendil-works/pi-ai` version changes the available models/providers.

## Conventions

- ESM throughout (`"type": "module"`). The extension bundles to ESM (`--format=esm`) targeting node22.
- Formatting via oxfmt (config in `.oxfmtrc.json`), linting via ESLint flat config + oxlint. Unused args are allowed when prefixed with `_`.
- The extension does not bundle dependencies into the VSIX in the usual way — `package:vsix` uses `--no-dependencies` because esbuild already inlines `@earendil-works/pi-ai` into `out/extension.js`.
