/* SA4E-411 — live demo transcript generator (read-only; writes nothing into the repo).
   Prints the user-visible output of the Code Agent 16K engine:
   repository map, the 4 core tools, and the tool-schema token cost. */

import { makeRetrievalDb } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/engine/retrieval/__tests__/retrieval-fixtures.js';
import { SnapshotRetrievalService } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/engine/retrieval/snapshot-retrieval.js';
import { CoreAgentTools } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/engine/agent-tools/core-tools.js';
import { RepositoryMapService } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/engine/map/repo-map-service.js';
import { CORE_TOOL_SCHEMAS } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/engine/security/tool-schemas.js';
import { estimateTokens } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/engine/agent-tools/tool-context.js';
import { createHash } from 'node:crypto';

function stubEmbed(text: string): Buffer {
  const h = createHash('sha256').update(text).digest();
  return Buffer.from(new Float32Array([h[0] / 255, h[1] / 255, h[2] / 255, h[3] / 255]).buffer);
}

const SOURCE = [
  'export class AuthService {',
  '  async login(user: User): Promise<Token> {',
  '    return helper(user);',
  '  }',
  '}',
].join('\n');

async function main() {
  const adapter = await makeRetrievalDb();
  const retrieval = new SnapshotRetrievalService(adapter as any);
  const tools = new CoreAgentTools(
    adapter as any,
    retrieval,
    stubEmbed,
    async (fp: string) => (fp === 'src/auth.ts' ? SOURCE : ''),
  );
  const repoMap = new RepositoryMapService(adapter as any);
  const pin = { repository_id: 'r1', commit_id: 'c1', index_snapshot_id: 'S1' };

  console.log('### 1. REPOSITORY MAP (snapshot S1) ###');
  const map = await repoMap.generate('S1');
  console.log(map.dsl);
  console.log(`-- files ranked: ${map.filesRanked.length} | token estimate: ${map.tokenEstimate} | truncated: ${map.truncated}`);

  console.log('\n### 2. search_symbols "authorization" ###');
  const s = await tools.searchSymbols(pin, { query: 'authorization', limit: 10 });
  console.log(s.dsl);
  console.log(`-- resultId: ${s.resultId} | evidenceIds: ${s.evidenceIds.join(', ')} | budgetUsedTokens: ${s.budgetUsedTokens}`);

  console.log('\n### 3. get_file_skeleton src/auth.ts ###');
  const sk = await tools.getFileSkeleton(pin, 'src/auth.ts');
  console.log(sk.dsl);

  console.log('\n### 4. read_code_block src/auth.ts:1-4 ###');
  const cb = await tools.readCodeBlock(pin, 'src/auth.ts', 1, 4);
  console.log(cb.dsl);

  console.log('\n### 5. query_call_graph symLogin CALLEES ###');
  const cg = await tools.queryCallGraph(pin, 'symLogin', 'CALLEES');
  console.log(cg.dsl);

  console.log('\n### 6. PIN ENFORCEMENT (same query against a FAILED snapshot S3) ###');
  try {
    await tools.searchSymbols({ ...pin, index_snapshot_id: 'S3' }, { query: 'authorization' });
    console.log('-- NO ERROR (unexpected)');
  } catch (e) {
    console.log(`-- rejected: ${(e as Error).message}`);
  }

  console.log('\n### 7. TOOL SCHEMA TOKEN COST ###');
  let total = 0;
  for (const [name, schema] of Object.entries(CORE_TOOL_SCHEMAS)) {
    const t = estimateTokens(JSON.stringify(schema));
    total += t;
    console.log(`-- ${name}: ${t} tokens`);
  }
  console.log(`-- total (4 core tools): ${total} tokens`);

  if (adapter.isConnected()) await adapter.disconnect();
}

main().catch((e) => {
  console.error('DEMO FAILED:', e);
  process.exit(1);
});

