const fs = require('fs');
let t = fs.readFileSync('extension/src/chat-panel/chat-panel-provider.ts', 'utf8');
const lines = t.split('\n');

// 1. Add extensionContext field after diffTracker
const diffTrackerIndex = lines.findIndex(line => line.includes('private diffTracker: import("../chat/diff/IDiffTracker").IDiffTracker | null = null;'));
if (diffTrackerIndex !== -1) {
  lines.splice(diffTrackerIndex + 1, 0, '  private readonly extensionContext: vscode.ExtensionContext;');
}

// 2. Add extensionContext to constructor params
const constructorStart = lines.findIndex(line => line.includes('constructor('));
if (constructorStart !== -1) {
  const wsIdx = lines.findIndex((l, i) => i > constructorStart && l.includes('workspaceState'));
  if (wsIdx !== -1) {
    const indent = lines[wsIdx].match(/^\s*/)[0];
    lines.splice(wsIdx + 1, 0, indent + 'private readonly extensionContext?: vscode.ExtensionContext');
  }
  
  const bodyStart = lines.findIndex((l, i) => i > constructorStart && l.trim() === ') {');
  if (bodyStart !== -1) {
    const indent = '    ';
    const hasAssign = lines.slice(bodyStart + 1, bodyStart + 10).some(l => l.includes('this.extensionContext = extensionContext'));
    if (!hasAssign) {
      lines.splice(bodyStart + 1, 0, indent + 'this.extensionContext = extensionContext!;', indent + 'this.stateManager = new ChatStateManager(workspaceRoot, workspaceState, this.extensionContext, (msg) => this.sendToWebview(msg), () => this.getEngine());');
      
      const oldIdx = lines.findIndex((l, i) => i > bodyStart && l.includes('this.stateManager = new ChatStateManager(workspaceRoot, workspaceState, (msg) => this.sendToWebview(msg), () => this.getEngine());'));
      if (oldIdx !== -1) lines.splice(oldIdx, 1);
      
      const dupIdx = lines.findIndex((l, i) => i > bodyStart && l.includes('this.extensionContext = extensionContext!;'));
      if (dupIdx !== -1 && dupIdx !== bodyStart + 1) lines.splice(dupIdx, 1);
    }
  }
}

fs.writeFileSync('extension/src/chat-panel/chat-panel-provider.ts', lines.join('\n'));
console.log('Fixed chat-panel-provider.ts');

// Fix workspace-init.ts
let t2 = fs.readFileSync('extension/src/extension/registration/workspace-init.ts', 'utf8');
t2 = t2.replace('const chatPanelProvider = new ChatPanelProvider(context.extensionUri, runtime.mcpManager, workspaceRoot, context.secrets, context.workspaceState);', 'const chatPanelProvider = new ChatPanelProvider(context.extensionUri, runtime.mcpManager, workspaceRoot, context.secrets, context.workspaceState, context);');
fs.writeFileSync('extension/src/extension/registration/workspace-init.ts', t2);
console.log('Fixed workspace-init.ts');

console.log('Done');