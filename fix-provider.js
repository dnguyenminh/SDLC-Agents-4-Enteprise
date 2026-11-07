const fs = require('fs');

// Fix chat-panel-provider.ts - add extensionContext to constructor and pass it properly
let t = fs.readFileSync('extension/src/chat-panel/chat-panel-provider.ts', 'utf8');

// Fix constructor params
t = t.replace(
  'private readonly workspaceState?: vscode.Memento\n  ) {',
  'private readonly workspaceState?: vscode.Memento\n  private readonly extensionContext?: vscode.ExtensionContext\n  ) {'
);

// Fix the stateManager instantiation - use this.extensionContext
t = t.replace(
  'this.stateManager = new ChatStateManager(workspaceRoot, workspaceState, extensionContext!, (msg) => this.sendToWebview(msg), () => this.getEngine());',
  'this.stateManager = new ChatStateManager(workspaceRoot, workspaceState, this.extensionContext!, (msg) => this.sendToWebview(msg), () => this.getEngine());'
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