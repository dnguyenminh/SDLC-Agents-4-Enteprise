const fs = require('fs');

// Fix chat-state-manager-skills.test.ts
let t = fs.readFileSync('extension/src/chat-panel/__tests__/chat-state-manager-skills.test.ts', 'utf8');
t = t.replace(
  'return new ChatStateManager(tmpRoot, undefined, sendToWebview, getEngine);',
  'return new ChatStateManager(tmpRoot, undefined, { globalStorageUri: { fsPath: tmpRoot } } as any, sendToWebview, getEngine);'
);
fs.writeFileSync('extension/src/chat-panel/__tests__/chat-state-manager-skills.test.ts', t);
console.log('Fixed chat-state-manager-skills.test.ts');

// Fix ui-truthfulness.test.ts
t = fs.readFileSync('extension/src/chat-panel/__tests__/ui-truthfulness.test.ts', 'utf8');
t = t.replace(
  'return new ChatStateManager("/ws", undefined, sendToWebview, getEngine);',
  'return new ChatStateManager("/ws", undefined, { globalStorageUri: { fsPath: "/tmp" } } as any, sendToWebview, getEngine);'
);
fs.writeFileSync('extension/src/chat-panel/__tests__/ui-truthfulness.test.ts', t);
console.log('Fixed ui-truthfulness.test.ts');

// Fix persist-restore-contract.test.ts
t = fs.readFileSync('extension/src/__tests__/chat/persist-restore-contract.test.ts', 'utf8');
t = t.replace(
  'const manager = new ChatStateManager(root, memento, (msg: any) => sent.push(msg), () => engine as any);',
  'const manager = new ChatStateManager(root, memento, { globalStorageUri: { fsPath: root } } as any, (msg: any) => sent.push(msg), () => engine as any);'
);
fs.writeFileSync('extension/src/__tests__/chat/persist-restore-contract.test.ts', t);
console.log('Fixed persist-restore-contract.test.ts');

console.log('All test files fixed');