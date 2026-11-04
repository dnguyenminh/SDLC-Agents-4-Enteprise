---
name: vscode-extension-patterns
description: "VS Code extension patterns for this project. Use when working on extension activation, commands, webviews, tree views, or diagnostics in extension/src/."
---

# vscode-extension-patterns

Patterns for the VS Code/Kiro extension in `extension/src/`. TypeScript + LangGraph agent orchestration.

## Activation Events

Declared in `extension/package.json` under `"activationEvents"`:

```json
{
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "commands": [{ "command": "sa4e.openPanel", "title": "Open SA4E Panel" }]
  }
}
```

Extension entry point `extension/src/extension.ts`:
```typescript
import * as vscode from 'vscode';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = createLogger(context);
  const services = await initializeServices(context, logger);
  registerCommands(context, services);
  registerProviders(context, services);
}

export function deactivate(): void {
  // Cleanup resources, close connections
}
```

## Command Registration

```typescript
function registerCommands(
  context: vscode.ExtensionContext,
  services: ServiceContainer,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('sa4e.openPanel', () => {
      services.panelManager.showPanel();
    }),
    vscode.commands.registerCommand('sa4e.runScan', async () => {
      await services.scanner.scanWorkspace();
    }),
  );
}
```

## WebviewProvider Pattern

```typescript
class MainWebviewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly services: ServiceContainer,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg, webviewView.webview),
    );
  }

  private handleMessage(msg: WebviewMessage, webview: vscode.Webview): void {
    switch (msg.type) {
      case 'request-data': this.sendData(webview); break;
      case 'execute-action': this.services.executor.run(msg.payload); break;
    }
  }
}
```

## TreeDataProvider

```typescript
class SkillTreeProvider implements vscode.TreeDataProvider<SkillItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SkillItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: SkillItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SkillItem): Promise<SkillItem[]> {
    if (!element) return this.getRootItems();
    return this.getChildItems(element);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}
```

## Workspace Configuration

```typescript
function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('sa4e');
  return {
    serverUrl: config.get<string>('serverUrl', 'http://127.0.0.1:48721'),
    autoConnect: config.get<boolean>('autoConnect', true),
    logLevel: config.get<string>('logLevel', 'info'),
  };
}

// Listen for config changes
vscode.workspace.onDidChangeConfiguration((e) => {
  if (e.affectsConfiguration('sa4e')) {
    services.reconnect(getConfig());
  }
});
```

## Diagnostic Collection

```typescript
const diagnostics = vscode.languages.createDiagnosticCollection('sa4e');
context.subscriptions.push(diagnostics);

function reportIssue(uri: vscode.Uri, line: number, msg: string): void {
  const range = new vscode.Range(line, 0, line, 100);
  const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Warning);
  diag.source = 'SA4E';
  diagnostics.set(uri, [diag]);
}
```

## Message Passing (Extension ↔ Webview)

```typescript
// Extension → Webview
webview.postMessage({ type: 'update-state', payload: data });

// Webview → Extension (handled in resolveWebviewView)
// Inside webview JS: vscode.postMessage({ type: 'action', payload: {} });
```

## File Organization

```
extension/src/
├── extension.ts            # activate/deactivate entry
├── services/               # Business logic services
├── providers/              # TreeDataProvider, WebviewProvider
├── commands/               # Command handlers
├── models/                 # Types, interfaces
├── webview/                # Svelte webview source (separate build)
└── utils/                  # Shared utilities
```

## Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|------|
| Register commands outside activate | Use `context.subscriptions.push()` |
| Hold references to disposed objects | Check `webviewView.visible` |
| Block extension host thread | Use async + progress notification |
| Hardcode paths | Use `context.extensionUri` |
| Ignore cancellation tokens | Pass `token` to async operations |
