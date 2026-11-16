// mcp-probe.mjs — call a tool on the ISOLATED code-intel MCP wrapper and print the result.
//
// Usage: node mcp-probe.mjs <mcpUrl> <toolName> <jsonArgs>

const url = process.argv[2];
const tool = process.argv[3];
const args = JSON.parse(process.argv[4] ?? '{}');

async function rpc(method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

const init = await rpc('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'sa411-probe', version: '1.0' },
});
console.log('--- initialize ---');
console.log(JSON.stringify(init.result?.serverInfo ?? init, null, 2));

const list = await rpc('tools/list', {});
const names = (list.result?.tools ?? []).map((t) => t.name);
console.log('--- tools/list count ---');
console.log(names.length);
console.log(names.join(', '));

console.log(`--- tools/call ${tool} ---`);
const call = await rpc('tools/call', { name: tool, arguments: args });
const body = call.result?.content?.map((c) => c.text).join('\n') ?? JSON.stringify(call);
console.log(body.slice(0, 4000));
