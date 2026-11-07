const fs = require('fs');
let t = fs.readFileSync('extension/src/chat-panel/chat-panel-provider.ts', 'utf8');

// 1. Add extensionContext field after diffTracker
t = t.replace(
  'private diffTracker: import("../chat/diff/IDiffTracker").IDiffTracker | null = null;',
  'private diffTracker: import("../chat/diff/IDiffTracker").IDiffTracker | null = null;\n  private readonly extensionContext: vscode.ExtensionContext;'
);

// 2. Add extensionContext to constructor params
t = t.replace(
  'private readonly workspaceState?: vscode.Memento\n  ) {',
  'private readonly workspaceState?: vscode.Memento\n  private readonly extensionContext?: vscode.ExtensionContext\n  ) {'
);

// 3. Fix the constructor body - assign extensionContext and pass to ChatStateManager
t = t.replace(
  'this.stateManager = new ChatStateManager(workspaceRoot, workspaceState, (msg) => this.sendToWebview(msg), () => this.getEngine());',
  'this.extensionContext = extensionContext!;\n    this.stateManager = new ChatStateManager(workspaceRoot, workspaceState, this.extensionContext, (msg) => this.sendToWebview(msg), () => this.getEngine());'
);

// 2. Add extensionContext to constructor params
t = t.replace(
  'private readonly workspaceState?: vscode.Memento\n  ) {',
  'private readonly workspaceState?: vscode.Memento\n  private readonly extensionContext?: vscode.ExtensionContext\n  ) {'
);

fs.writeFileSync('extension/src/chat-panel/chat-panel-provider.ts', t);
console.log('Fixed chat-panel-provider.ts');

// Fix workspace-init.ts - pass context as 6th argument
const t2 = fs.readFileSync('extension/src/extension/registration/workspace-init.ts', 'utf8');
const t2new = t2.replace(
  'const chatPanelProvider = new ChatPanelProvider(context.extensionUri, runtime.mcpManager, workspaceRoot, context.secrets, context.workspaceState);',
  'const chatPanelProvider = new ChatPanelProvider(context.extensionUri, runtime.mcpManager, workspaceRoot, context.secrets, context.workspaceState, context);'
);
fs.writeFileSync('extension/src/extension/registration/workspace-init.ts', t2new);
console.log('Fixed workspace-init.ts');

console.log('Done');