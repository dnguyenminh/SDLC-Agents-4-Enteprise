/**
 * SA4E-420 — the 4 core agent tools are exposed through the REAL MCP server:
 * CodeIntelModule definitions + real CORE_TOOLS allowlist + real getMcpServer
 * + in-process Client. Handlers run against a real in-memory V6 snapshot DB.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { ModuleRegistry } from '../../../modules/ModuleRegistry.js';
import { CodeIntelModule } from '../../../modules/code-intel/CodeIntelModule.js';
import { StubModule, silentLogger, connectMcp, type McpHarness } from '../../../__tests__/sa4e-testkit.js';
import { SnapshotRetrievalService } from '../../retrieval/snapshot-retrieval.js';
import { makeRetrievalDb, P } from '../../retrieval/__tests__/retrieval-fixtures.js';
import { CoreAgentTools } from '../core-tools.js';
import { CORE_AGENT_TOOL_NAMES } from '../mcp-tool-definitions.js';
import { createCoreAgentToolHandlers } from '../mcp-tool-handlers.js';
import { createWorkspaceSourceLoader, unavailableQueryEmbedder } from '../workspace-source-loader.js';

describe('SA4E-420: core agent tools registered in MCP tools/list', () => {
  let adapter: SqliteAdapter;
  let harness: McpHarness;

  beforeEach(async () => {
    adapter = await makeRetrievalDb();
    adapter.exec(`INSERT INTO chat_session (id, project_id, repository_id, commit_id, pinned_code_index_snapshot_id)
                  VALUES ('cs1', '${P}', 'r1', 'c1', 'S1')`);
    const retrieval = new SnapshotRetrievalService(adapter as any);
    const tools = new CoreAgentTools(adapter as any, retrieval, unavailableQueryEmbedder, createWorkspaceSourceLoader(process.cwd()));
    // Definitions come from the real module; handlers from the same factory the module uses.
    const defs = new CodeIntelModule(silentLogger()).getToolDefinitions();
    const handlers = createCoreAgentToolHandlers(adapter as any, retrieval, tools);
    const registry = new ModuleRegistry(silentLogger());
    registry.register(new StubModule('codeIntel', defs, handlers));
    harness = await connectMcp(registry);
  });
  afterEach(async () => {
    await harness.close();
    if (adapter.isConnected()) await adapter.disconnect();
  });

  it('tools/list contains the 4 core agent tools with pin + required args', async () => {
    const { tools } = await harness.client.listTools();
    const names = tools.map((t) => t.name);
    for (const n of CORE_AGENT_TOOL_NAMES) expect(names).toContain(n);
    const search = tools.find((t) => t.name === 'search_symbols')!;
    expect(search.inputSchema.required).toEqual(expect.arrayContaining(['session_id', 'index_snapshot_id', 'query']));
  });

  it('tools/call get_file_skeleton returns pinned-snapshot DSL', async () => {
    const res = await harness.client.callTool({
      name: 'get_file_skeleton',
      arguments: { session_id: 'cs1', index_snapshot_id: 'S1', file_path: 'src/auth.ts' },
    });
    expect(res.isError).toBeFalsy();
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('# [CLASS] AuthService | src/auth.ts:1-40');
    expect(text).toMatch(/\[RESULT_ID: .+ \| TRUNCATED: false/);
  });

  it('tools/call search_symbols works lexical-only when no query embedder is wired', async () => {
    const res = await harness.client.callTool({
      name: 'search_symbols',
      arguments: { session_id: 'cs1', index_snapshot_id: 'S1', query: 'authorization', limit: 5 },
    });
    expect(res.isError).toBeFalsy();
    expect((res.content as Array<{ text: string }>)[0].text).toMatch(/\[FOUND \d+ SYMBOLS/);
  });

  it('rejects a call whose snapshot is not the session pin (no branch-head fallback)', async () => {
    const res = await harness.client.callTool({
      name: 'get_file_skeleton',
      arguments: { session_id: 'cs1', index_snapshot_id: 'S2', file_path: 'src/auth.ts' },
    });
    expect(res.isError).toBe(true);
    expect((res.content as Array<{ text: string }>)[0].text).toContain('SNAPSHOT_MISMATCH');
  });
});
