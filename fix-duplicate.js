const fs = require('fs');
let t = fs.readFileSync('extension/src/chat-panel/chat-panel-provider.ts', 'utf8');

// Remove the duplicate field declaration
t = t.replace(
  'private diffTracker: import("../chat/diff/IDiffTracker").IDiffTracker | null = null;\n  private readonly extensionContext: vscode.ExtensionContext;',
  'private diffTracker: import("../chat/diff/IDiffTracker").IDiffTracker | null = null;'
);

fs.writeFileSync('extension/src/chat-panel/chat-panel-provider.ts', t);
console.log('Done');