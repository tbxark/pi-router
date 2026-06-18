import { readFileSync } from 'node:fs';
import * as vscode from 'vscode';

export function getHtml(webview: vscode.Webview, webviewDist: vscode.Uri, nonce: string): string {
  const indexPath = vscode.Uri.joinPath(webviewDist, 'index.html').fsPath;
  const raw = readFileSync(indexPath, 'utf8');

  // Rewrite asset paths (src / href) to use webview URIs
  let html = raw.replace(/(?:src|href)="([^"]+)"/g, (_match, path: string) => {
    if (path.startsWith('http') || path.startsWith('data:') || path.startsWith('#')) {
      return _match;
    }
    const assetPath = path.replace(/^\//, '');
    const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDist, assetPath));
    return _match.slice(0, _match.indexOf('=') + 1) + '"' + assetUri.toString() + '"';
  });

  // Inject nonce into every <script> tag and update CSP
  html = html.replace(/<script/g, `<script nonce="${nonce}"`);
  html = html.replace(
    '<meta charset="UTF-8" />',
    `<meta charset="UTF-8" />\n    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:;"\n    />`
  );

  return html;
}
