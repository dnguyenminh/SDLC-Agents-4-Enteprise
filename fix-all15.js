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
  const workspaceStateIndex = lines.findIndex((line, i) => i > constructorStart && line.includes('workspaceState'));
  if (workspaceStateIndex !== -1) {
    // Check if extensionContext param already exists
    const nextLine = lines[workspaceStateIndex + 1];
    if (!nextLine || !nextLine.includes('extensionContext')) {
      const indent = lines[workspaceStateIndex].match(/^\s*/)[0];
      lines.splice(workspaceStateIndex + 1, 0, `${indent}private readonly extensionContext?: vscode.ExtensionContext`);
    }
  }
  
  // Find the opening brace of constructor body
  const bodyStartIndex = lines.findIndex((line, i) => i > constructorStart && line.trim() === ') {');
  if (bodyStartIndex !== -1) {
    const indent = '    ';
    // Check if extensionContext assignment already exists
    const hasExtensionContextAssign = lines.slice(bodyStartIndex + 1, bodyStartIndex + 10).some(l => l.includes('this.extensionContext = extensionContext'));
    if (!hasExtensionContextAssign) {
      lines.splice(bodyStartIndex + 1, 0, 
        `${indent}this.extensionContext = extensionContext!;`,
        `${indent}this.stateManager = new ChatStateManager(workspaceRoot, workspaceState, this.extensionContext, (msg) => this.sendToWebview(msg), () => this.getEngine());`
      );
      
      // Remove the old stateManager line
      const oldStateManagerIndex = lines.findIndex((line, i) => i > bodyStartIndex && line.includes('this.stateManager = new ChatStateManager(workspaceRoot, workspaceState, (msg) => this.sendToWebview(msg), () => this.getEngine());'));
      if (oldStateManagerIndex !== -1) {
        lines.splice(oldStateManagerIndex, 1);
      }
      
      // Remove duplicate extensionContext assignment
      const dupIndex = lines.findIndex((line, i) => i > bodyStartIndex && line.includes('this.extensionContext = extensionContext!;'));
      if (dupIndex !== -1 && dupIndex !== bodyStartIndex + 1) {
        lines.splice(dupIndex, 1);
      }
    }
  }
}

fs.writeFileSync('extension/src/chat-panel/chat-panel-provider.ts', lines.join('\n'));
console.log('Fixed chat-panel-provider.ts');

// Fix workspace-init.ts
const fs = require('fs');
let t2 = fs.readFileSync('extension/src/extension/registration/workspace-init.ts', 'utf8');
t2 = t2.replace(
  'const chatPanelProvider = new ChatPanelProvider(context.extensionUri, runtime.mcpManager, workspaceRoot, context.secrets, context.workspaceState);',
  'const chatPanelProvider = new ChatPanelProvider(context.extensionUri, runtime.mcpManager, workspaceRoot, context.secrets, context.workspaceState, context);'
);
fs.writeFileSync('extension/src/extension/registration/workspace-init.ts', t2);
console.log('Fixed workspace-init.ts');

console.log('Done');