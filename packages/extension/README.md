# Pi Router

Pi Router provides custom VS Code chat models through Pi.

Pi Router is a VS Code extension that exposes models supported by `@earendil-works/pi-ai` through the VS Code Language Model Chat API.

The extension reads provider credentials configured in VS Code SecretStorage and registers models from configured providers under the `pi-router` vendor. It supports API keys as well as OAuth providers supported by `pi-ai`.

## Install

Install Pi Router from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=tbxark.pi-router).

## Usage

Open the command palette with `Cmd+Shift+P` on macOS or `Ctrl+Shift+P` on Windows/Linux. You can also open it from the menu: `View` > `Command Palette...`.

1. Install Pi Router, then reload VS Code if prompted.
2. Open the command palette and run `Pi Router: Manage Providers`.
3. Select a provider, then save the API key or provider environment variables.
4. If the provider supports OAuth, click the authorization button in the same configuration panel to sign in.
5. After configuration, extensions that support the VS Code Language Model Chat API can discover and use models under the `pi-router` vendor.

Available commands:

- `Pi Router: Manage Providers`: open the provider management panel
- `Pi Router: Add Provider API Key`: quickly save an API key for a provider
- `Pi Router: Sign in Provider with OAuth`: sign in to supported providers with OAuth
- `Pi Router: Clear Credentials`: clear all credentials saved by the extension

Credentials are stored in VS Code SecretStorage and are not written to repository files.
