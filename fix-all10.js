const fs = require('fs');
let t = fs.readFileSync('extension/src/chat-panel/chat-panel-provider.ts', 'utf8');

const lines = t.split('\n');

// Find the line with diffTracker and add extensionContext field after it
const diffTrackerIndex = lines.findIndex(line => line.includes('private diffTracker: import("../chat/diff/IDiffTracker").IDiffTracker | null = null;'));
if (diffTrackerIndex !== -1) {
  lines.splice(diffTrackerIndex + 1, 0, '  private readonly extensionContext: vscode.ExtensionContext;');
}

// Find constructor and add extensionContext parameter
const constructorStart = lines.findIndex(line => line.includes('constructor('));
if (constructorStart !== -1) {
  // Find the line with workspaceState
  const workspaceStateIndex = lines.findIndex((line, i) => i > constructorStart && line.includes('workspaceState'));
  if (workspaceStateIndex !== -1) {
    // Add extensionContext parameter after workspaceState
    const indent = lines[workspaceStateIndex].match(/^\s*/)[0];
    lines.splice(workspaceStateIndex + 1, 0, `${indent}private readonly extensionContext?: vscode.ExtensionContext`);
  }
  
  // Find the opening brace of constructor body
  const bodyStartIndex = lines.findIndex((line, i) => i > constructorStart && line.trim() === ') {');
  if (bodyStartIndex !== -1) {
    // Add extensionContext assignment and fix stateManager call
    const indent = '    ';
    lines.splice(bodyStartIndex + 1, 0, 
      `${indent}this.extensionContext = extensionContext!;`,
      `${indent}this.stateManager = new ChatStateManager(workspaceRoot, workspaceState, this.extensionContext, (msg) => this.sendToWebview(msg), () => this.getEngine());`
    );
    
    // Remove the old stateManager line
    const oldStateManagerIndex = lines.findIndex((line, i) => i > bodyStartIndex && line.includes('this.stateManager = new ChatStateManager(workspaceRoot, workspaceState, (msg) => this.sendToWebview(msg), () => this.getEngine());'));
    if (oldStateManagerIndex !== -1) {
      lines.splice(oldStateManagerIndex, 1);
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