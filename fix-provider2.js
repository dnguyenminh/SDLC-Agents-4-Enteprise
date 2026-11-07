const fs = require('fs');
let t = fs.readFileSync('extension/src/chat-panel/chat-panel-provider.ts', 'utf8');

t = t.replace(
  'private diffTracker: import(\"../chat/diff/IDiffTracker\").IDiffTracker | null = null;',
  'private diffTracker: import("../chat/diff/IDiffTracker").IDiffTracker | null = null;\n  private readonly extensionContext: vscode.ExtensionContext;'
);

t = t.replace(
  'private readonly workspaceState?: vscode.Memento\n  ) {',
  'private readonly workspaceState?: vscode.Memento\n  private readonly extensionContext?: vscode.ExtensionContext\n  ) {'
);

t = t.replace(
  'this.stateManager = new ChatStateManager(workspaceRoot, workspaceState, (msg) => this.sendToWebview(msg), () => this.getEngine());',
  'this.extensionContext = extensionContext!;\n    this.stateManager = new ChatStateManager(workspaceRoot, workspaceState, this.extensionContext, (msg) => this.sendToWebview(msg), () => this.getEngine());'
);

fs.writeFileSync('extension/src/chat-panel/chat-panel-provider.ts', t);
console.log('Done');