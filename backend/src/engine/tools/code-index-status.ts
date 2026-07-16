/**
 * code_index_status tool — Show indexing statistics and health.
 * KSA-191: Enhanced with SFDX stats section when Salesforce project detected.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { QueryLayer } from '../query/query-layer.js';
import { IndexingEngine } from '../indexer/indexing-engine.js';

export function registerCodeIndexStatus(
  server: McpServer, queryLayer: QueryLayer, indexer: IndexingEngine
): void {
  server.tool(
    'code_index_status',
    'Get current indexing status: file count, symbol count, languages, last indexed time, indexer state, and SFDX stats (if Salesforce project detected).',
    {
      reindex: z.boolean().optional().default(false).describe('Trigger a full re-index'),
      __projectId: z.string().optional().describe('SA4E-41 tenant scope (injected)'),
    },
    async ({ reindex, __projectId }) => {
      if (reindex) {
        await indexer.runFullIndex(__projectId ? { projectId: __projectId } : undefined);
      }
      const status = queryLayer.getIndexStatus(__projectId);
      const sfdxStats = indexer.getSfdxStats();
      const tsStats = indexer.getTreeSitterStats();
      const text = formatStatus(status, indexer.isRunning(__projectId), sfdxStats, tsStats);
      return { content: [{ type: 'text', text }] };
    }
  );
}

function formatStatus(
  status: any,
  isRunning: boolean,
  sfdxStats: ReturnType<IndexingEngine['getSfdxStats']>,
  tsStats: ReturnType<IndexingEngine['getTreeSitterStats']>
): string {
  const lines = [
    '\u{1F4CA} Code Intelligence Index Status\n',
    `State: ${isRunning ? '\u{1F504} Indexing...' : '\u{2705} Idle'}`,
    `Files: ${status.totalFiles}`,
    `Symbols: ${status.totalSymbols}`,
    `Modules: ${status.totalModules}`,
    `Last indexed: ${status.lastIndexed ?? 'Never'}`,
    '',
    'Languages:',
  ];

  for (const [lang, count] of Object.entries(status.languages)) {
    lines.push(`  ${lang}: ${count} files`);
  }

  // KSA-191: SFDX stats section
  if (sfdxStats) {
    lines.push('');
    lines.push('\u{26A1} Salesforce (SFDX):');
    lines.push(`  Detected: ${sfdxStats.detected}`);
    lines.push(`  Package directories: ${sfdxStats.packageDirectories.join(', ')}`);
    lines.push(`  Apex classes: ${sfdxStats.stats.apex_classes}`);
    lines.push(`  Apex triggers: ${sfdxStats.stats.apex_triggers}`);
    lines.push(`  Flows: ${sfdxStats.stats.flows}`);
    lines.push(`  Objects: ${sfdxStats.stats.objects}`);
    lines.push(`  LWC components: ${sfdxStats.stats.lwc_components}`);
    if (sfdxStats.lastIndexed) {
      lines.push(`  Last indexed: ${sfdxStats.lastIndexed}`);
    }

    const relEntries = Object.entries(sfdxStats.relationships);
    if (relEntries.length > 0) {
      lines.push('  Relationships:');
      for (const [kind, count] of relEntries) {
        lines.push(`    ${kind}: ${count}`);
      }
    }
  }

  // KSA-209: Unavailable grammars warning
  if (tsStats.unavailableGrammars.length > 0) {
    lines.push('');
    lines.push(`\u{26A0}\u{FE0F} Unavailable grammars (WASM missing \u{2014} using regex fallback): ${tsStats.unavailableGrammars.join(', ')}`);
  }

  return lines.join('\n');
}
