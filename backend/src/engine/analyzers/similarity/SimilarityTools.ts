/**
 * KSA-168: MCP Tool registrations for similarity & mining tools.
 */

import Database from 'better-sqlite3';
import { DuplicateDetector } from './DuplicateDetector.js';
import { DeadCodeDetector } from './DeadCodeDetector.js';
import { GitMiner } from './GitMiner.js';

export const SIMILARITY_TOOL_DEFINITIONS = [
  {
    name: 'find_duplicates',
    description: 'Find near-duplicate functions using embedding similarity. Groups similar code into clusters with refactoring suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Filter by file path' },
        module: { type: 'string', description: 'Filter by module name' },
        min_similarity: { type: 'number', description: 'Minimum similarity threshold (default: 0.85)' },
        limit: { type: 'number', description: 'Max clusters to return (default: 20)' },
      },
    },
  },
  {
    name: 'find_dead_code',
    description: 'Find potentially dead/unreachable code using call graph reachability analysis from entry points.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Filter by file path' },
        module: { type: 'string', description: 'Filter by module name' },
        min_confidence: { type: 'number', description: 'Minimum confidence threshold 0-100 (default: 60)' },
        limit: { type: 'number', description: 'Max results (default: 50)' },
      },
    },
  },
  {
    name: 'git_search',
    description: 'Search git commit history by message, author, or file. Returns matching commits with metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (matches message and file names)' },
        author: { type: 'string', description: 'Filter by author name' },
        file: { type: 'string', description: 'Filter by file path' },
        since: { type: 'string', description: 'Only commits after this date (ISO format)' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'git_index',
    description: 'Index git commit history for searching. Incremental by default.',
    inputSchema: {
      type: 'object',
      properties: {
        force: { type: 'boolean', description: 'Force full re-index (default: false)' },
      },
    },
  },
];

/** Dispatch a similarity/mining tool call (SA4E-41: tenant-scoped, fail-closed). */
export function handleSimilarityTool(
  name: string,
  args: Record<string, unknown>,
  db: Database.Database,
  workspacePath: string,
  projectId?: string
): string | null {
  switch (name) {
    case 'find_duplicates':
      return handleFindDuplicates(args, db, projectId);
    case 'find_dead_code':
      return handleFindDeadCode(args, db, projectId);
    case 'git_search':
      return handleGitSearch(args, db, workspacePath, projectId);
    case 'git_index':
      return handleGitIndex(args, db, workspacePath, projectId);
    default:
      return null;
  }
}

function handleFindDuplicates(args: Record<string, unknown>, db: Database.Database, projectId?: string): string {
  const minSimilarity = (args.min_similarity as number) ?? 0.85;
  const detector = new DuplicateDetector(db, minSimilarity, 5, projectId);
  const report = detector.detect({
    filePath: args.file_path as string | undefined,
    module: args.module as string | undefined,
    limit: args.limit as number | undefined,
  });

  if (report.clusters.length === 0) {
    return `No duplicate code found (scanned ${report.totalPairsScanned} pairs in ${report.scanDurationMs}ms).`;
  }

  const lines = [
    `Found ${report.clusters.length} duplicate clusters (${report.totalDuplicates} functions) in ${report.scanDurationMs}ms:\n`,
  ];

  for (const cluster of report.clusters) {
    lines.push(`�� ${cluster.id} (avg similarity: ${(cluster.avgSimilarity * 100).toFixed(1)}%)`);
    lines.push(`   💡 ${cluster.suggestion}`);
    for (const member of cluster.members) {
      lines.push(`   - ${member.name} — ${member.filePath}:${member.startLine}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function handleFindDeadCode(args: Record<string, unknown>, db: Database.Database, projectId?: string): string {
  const minConfidence = (args.min_confidence as number) ?? 60;
  const detector = new DeadCodeDetector(db, minConfidence, projectId);
  const report = detector.detect({
    filePath: args.file_path as string | undefined,
    module: args.module as string | undefined,
    limit: args.limit as number | undefined,
  });

  if (report.candidates.length === 0) {
    return `No dead code found (${report.totalFunctions} functions, ${report.reachableCount} reachable).`;
  }

  const lines = [
    `Found ${report.candidates.length} potentially dead functions ` +
    `(${report.unreachableCount}/${report.totalFunctions} unreachable, ${report.scanDurationMs}ms):\n`,
  ];

  for (const candidate of report.candidates) {
    const conf = candidate.confidence >= 80 ? '🔴' : candidate.confidence >= 60 ? '🟡' : '⚪';
    lines.push(
      `${conf} ${candidate.name} (${candidate.kind}) — confidence: ${candidate.confidence}%`
    );
    lines.push(`   ${candidate.filePath}:${candidate.startLine}`);
    lines.push(`   Reasons: ${candidate.reasons.join(', ')}`);
  }

  return lines.join('\n');
}

function handleGitSearch(args: Record<string, unknown>, db: Database.Database, workspacePath: string, projectId?: string): string {
  const query = args.query as string;
  if (!query) return 'Parameter "query" is required.';

  const miner = new GitMiner(db, workspacePath, 10000, projectId);
  const results = miner.search(query, {
    author: args.author as string | undefined,
    file: args.file as string | undefined,
    since: args.since as string | undefined,
    limit: args.limit as number | undefined,
  });

  if (results.length === 0) return `No commits found matching "${query}".`;

  const lines = [`Found ${results.length} commits matching "${query}":\n`];
  for (const commit of results) {
    lines.push(`${commit.hash.slice(0, 8)} | ${commit.date.slice(0, 10)} | ${commit.author}`);
    lines.push(`  ${commit.message}`);
    lines.push(`  Files: ${commit.filesChanged.slice(0, 5).join(', ')}${commit.filesChanged.length > 5 ? ` (+${commit.filesChanged.length - 5} more)` : ''}`);
    lines.push(`  +${commit.insertions} -${commit.deletions}`);
    lines.push('');
  }

  return lines.join('\n');
}

function handleGitIndex(args: Record<string, unknown>, db: Database.Database, workspacePath: string, projectId?: string): string {
  const force = (args.force as boolean) ?? false;
  const miner = new GitMiner(db, workspacePath, 10000, projectId);
  try {
    const summary = miner.indexHistory(force);
    return [
      `Git history indexed:`,
      `  Total commits: ${summary.totalCommits}`,
      `  Last hash: ${summary.lastHash?.slice(0, 8) ?? 'none'}`,
      `  Last indexed: ${summary.lastIndexedAt ?? 'never'}`,
    ].join('\n');
  } catch (err: any) {
    if (String(err?.message).startsWith('PROJECT_REQUIRED')) {
      return JSON.stringify({ error: 'X-Project-Id required to index git history' });
    }
    throw err;
  }
}
