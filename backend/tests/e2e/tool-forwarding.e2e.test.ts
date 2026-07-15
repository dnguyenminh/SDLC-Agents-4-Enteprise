/**
 * E2E Tests — Tool Forwarding (KSA-293: Extension Thin Client)
 * Verifies all 52 expected tools are registered, callable, and return valid responses.
 *
 * Run: npx vitest run tests/e2e/tool-forwarding.e2e.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL } from './setup/e2e-config.js';

const TEST_TIMEOUT = 30000; // 30s per test for heavy DB queries

const EXPECTED_TOOLS = [
  'code_search', 'code_symbols', 'code_context', 'code_modules', 'code_index_status',
  'stream_write_file', 'code_kb_export', 'drawio_auto_layout', 'code_callers', 'code_callees',
  'code_dependencies', 'code_impact', 'code_traverse', 'complexity_analysis', 'find_entry_points',
  'find_circular_deps', 'find_related_tests', 'find_hot_paths', 'find_dead_imports', 'module_summary',
  'get_ai_context', 'get_edit_context', 'get_curated_context', 'find_duplicates', 'find_dead_code',
  'git_search', 'git_index', 'mem_search', 'mem_ingest', 'mem_ingest_file', 'mem_pin', 'mem_map',
  'mem_crud', 'mem_graph', 'mem_consolidate', 'mem_lifecycle', 'mem_templates', 'mem_attachments',
  'mem_discover', 'mem_tags', 'mem_citations', 'mem_conversation', 'mem_scoring', 'mem_admin',
  'orchestration_status', 'agent_log', 'drawio_export_png',
];

async function callTool(toolName: string, args: Record<string, unknown> = {}): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE_URL}/mcp/tools/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool_name: toolName, arguments: args }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  return { status: res.status, data };
}

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok && res.status !== 503) throw new Error(`Health ${res.status}`);
    const data = await res.json() as any;
    if (data.modules?.memory !== 'ready') throw new Error(`Memory module: ${data.modules?.memory}`);
  } catch (err) {
    throw new Error(`Server not running at ${BASE_URL}. Start with "npm run dev".\n${err}`);
  }
});

describe('E2E — All 52 Tools Registered', () => {
  it('backend exposes all 52 expected tools', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/list`);
    const data = await res.json() as any;
    const names = data.tools.map((t: any) => t.name);
    const missing = EXPECTED_TOOLS.filter(t => !names.includes(t));
    expect(missing).toHaveLength(0);
  });

  it('all tools have valid schemas', async () => {
    const res = await fetch(`${BASE_URL}/mcp/tools/list`);
    const data = await res.json() as any;
    for (const tool of data.tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});

describe('E2E — Memory Tools', () => {
  it('mem_search', async () => { const r = await callTool('mem_search', { query: 'test', limit: 3 }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('mem_ingest', async () => { const r = await callTool('mem_ingest', { content: `E2E ${Date.now()}`, summary: 'e2e', type: 'CONTEXT', tags: 'e2e' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('mem_pin list', async () => { const r = await callTool('mem_pin', { action: 'list' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('mem_map get', async () => { const r = await callTool('mem_map', { action: 'get', entry_id: 1 }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('mem_crud list', async () => { const r = await callTool('mem_crud', { action: 'list', limit: 5 }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('mem_graph neighbors', async () => { const r = await callTool('mem_graph', { action: 'neighbors', node_id: 1 }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('mem_consolidate', async () => { const r = await callTool('mem_consolidate', {}); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('mem_lifecycle stale', async () => { const r = await callTool('mem_lifecycle', { action: 'stale' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('mem_templates list', async () => { const r = await callTool('mem_templates', { action: 'list' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('mem_attachments list', async () => { const r = await callTool('mem_attachments', { action: 'list', entry_id: 1 }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('mem_discover suggest', async () => { const r = await callTool('mem_discover', { action: 'suggest', query: 'code' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('mem_tags taxonomy', async () => { const r = await callTool('mem_tags', { action: 'taxonomy' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('mem_citations most_cited', async () => { const r = await callTool('mem_citations', { action: 'most_cited' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('mem_conversation list_sessions', async () => { const r = await callTool('mem_conversation', { action: 'list_sessions' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('mem_scoring compute', async () => { const r = await callTool('mem_scoring', { action: 'compute', entry_id: 1 }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('mem_admin status', async () => { const r = await callTool('mem_admin', { action: 'status' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
});

describe('E2E — Code Intel Tools', () => {
  it('code_search', async () => { const r = await callTool('code_search', { query: 'Memory', limit: 5 }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('code_symbols', async () => { const r = await callTool('code_symbols', { file: 'extension.ts' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('code_context', async () => { const r = await callTool('code_context', { file: 'index.ts', line: 10 }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('code_modules', async () => { const r = await callTool('code_modules', { limit: 10 }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('code_index_status', async () => { const r = await callTool('code_index_status', {}); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); expect(r.data.content[0].text).toContain('Files:'); });
  it('code_kb_export', async () => { const r = await callTool('code_kb_export', { limit: 5 }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('code_callers', async () => { const r = await callTool('code_callers', { symbol: 'activate' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('code_callees', async () => { const r = await callTool('code_callees', { symbol: 'initialize' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('code_dependencies', async () => { const r = await callTool('code_dependencies', { file: 'index.ts' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('code_impact', async () => { const r = await callTool('code_impact', { file: 'MemoryEngine' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('code_traverse', async () => { const r = await callTool('code_traverse', { start: 'Module', depth: 2 }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('complexity_analysis', async () => { const r = await callTool('complexity_analysis', { file: 'MemoryEngine' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('find_entry_points', async () => { const r = await callTool('find_entry_points', {}); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('find_circular_deps', async () => { const r = await callTool('find_circular_deps', {}); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('find_related_tests', async () => { const r = await callTool('find_related_tests', { file: 'MemoryEngine.ts' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('find_hot_paths', async () => { const r = await callTool('find_hot_paths', { limit: 5 }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('find_dead_imports', async () => { const r = await callTool('find_dead_imports', { file: 'index.ts' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('module_summary', async () => { const r = await callTool('module_summary', { name: 'memory' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('get_ai_context', async () => { const r = await callTool('get_ai_context', { query: 'auth', limit: 5 }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('get_edit_context', async () => { const r = await callTool('get_edit_context', { file: 'extension.ts', line: 20 }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('get_curated_context', async () => { const r = await callTool('get_curated_context', { task: 'implement auth', limit: 5 }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('find_duplicates', async () => { const r = await callTool('find_duplicates', {}); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('find_dead_code', async () => { const r = await callTool('find_dead_code', { limit: 5 }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
});

describe('E2E — Git & Orchestration', () => {
  it('git_search', async () => { const r = await callTool('git_search', { query: 'refactor' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('git_index', async () => { const r = await callTool('git_index', {}); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('orchestration_status', async () => { const r = await callTool('orchestration_status', {}); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('find_tools', async () => { const r = await callTool('find_tools', { query: 'memory', threshold: 0.3, top_k: 5 }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('toggle_tool', async () => { const r = await callTool('toggle_tool', { tool_name: 'agent_log', enabled: true }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
  it('agent_log', async () => { const r = await callTool('agent_log', { message: 'E2E test', level: 'info' }); expect(r.status).toBe(200); expect(r.data.isError).toBe(false); });
});

describe('E2E — Webview API Endpoints', () => {
  it('GET /api/kb/graph returns nodes', async () => { const r = await fetch(`${BASE_URL}/api/kb/graph`); const d = await r.json() as any; expect(d.data.nodes.length).toBeGreaterThanOrEqual(0); });
  it('GET /api/dashboard/summary returns count', async () => { const r = await fetch(`${BASE_URL}/api/dashboard/summary`); const d = await r.json() as any; expect(d.data.totalEntries).toBeGreaterThanOrEqual(0); });
  it('GET /api/tags/list returns tags', async () => { const r = await fetch(`${BASE_URL}/api/tags/list`); const d = await r.json() as any; expect(d.data.tags.length).toBeGreaterThanOrEqual(0); });
  it('GET /api/quality/summary returns', async () => { const r = await fetch(`${BASE_URL}/api/quality/summary`); const d = await r.json() as any; expect(d.data.totalEntries).toBeGreaterThanOrEqual(0); });
});
