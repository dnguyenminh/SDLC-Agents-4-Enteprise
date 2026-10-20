/** KB entry detail helpers — Pega symbol resolution + code symbol detail (BR-18). */
import type { AdminContext } from './context.js';

/** SA4E-171: Resolve a Pega rule FQN to its symbol id (rules live in symbols). */
export async function resolvePegaSymbolId(ctx: AdminContext, fqn: string): Promise<string | null> {
  try {
    const { getDbAdapter } = await import('../../../admin/db/core.js');
    const adapter = getDbAdapter();
    // Exact match on the full 5-part signature first.
    let sym = await adapter.getAsync<{ id: number }>(
      `SELECT s.id FROM symbols s JOIN files f ON f.id = s.file_id
       WHERE s.signature = ? AND s.kind LIKE 'pega_%' LIMIT 1`,
      [fqn],
    );
    // Fallback: legacy 3-part FQN deep-links (type:class:name) — match by prefix.
    if (!sym && (fqn.match(/:/g) || []).length === 2) {
      sym = await adapter.getAsync<{ id: number }>(
        `SELECT s.id FROM symbols s JOIN files f ON f.id = s.file_id
         WHERE s.signature LIKE ? AND s.kind LIKE 'pega_%' LIMIT 1`,
        [`${fqn}:%`],
      );
    }
    return sym ? String(sym.id) : null;
  } catch {
    return null;
  }
}

/** Fetch code symbol detail via SymbolRepository for KB Graph node click. */
export async function getCodeSymbolDetail(symbolId: string, ctx: AdminContext): Promise<Record<string, unknown> | null> {
  try {
    const detail = await ctx.db.symbol.getSymbolDetail(symbolId);
    if (!detail) return null;
    const lines = detail.startLine && detail.endLine ? `Lines ${detail.startLine}\u2013${detail.endLine}` : '';
    const bodyCode = await loadSymbolBodyCode(symbolId, ctx);
    const identityParts = await buildIdentityParts(detail);
    const metaParts = buildMetaParts(detail, lines);
    const contentParts = buildContentParts(identityParts, metaParts, bodyCode, detail);
    return {
      id: `code:${detail.id}`,
      title: `${detail.name} (${detail.kind})`,
      content: contentParts, tier: 'CODE', type: 'CODE_ENTITY',
      source: detail.relativePath || '',
      tags: [detail.kind, detail.language, detail.module].filter(Boolean),
      links: [], qualityScore: null, createdAt: null, updatedAt: null,
      enrichment: {
        summary: detail.summary || null,
        pseudoCode: detail.pseudoCode || null,
        llmTags: detail.llmTags ? JSON.parse(detail.llmTags) : null,
        status: detail.enrichmentStatus || null,
      },
    };
  } catch (err) {
    ctx.logger.warn({ symbolId, err }, 'Failed to fetch code symbol detail');
    return null;
  }
}

/** SA4E-104: Fetch body/pseudo code from body_embeddings if available. */
async function loadSymbolBodyCode(symbolId: string, ctx: AdminContext): Promise<string> {
  try {
    const numId = parseInt(symbolId, 10);
    if (isNaN(numId)) return '';
    const { getDbAdapter } = await import('../../../admin/db/core.js');
    const indexAdapter = getDbAdapter();
    const bodyRow = await indexAdapter.getAsync<{ embedding: Buffer | Uint8Array }>(
      'SELECT embedding FROM body_embeddings WHERE symbol_id = ? AND chunk_index = 0', [numId],
    );
    if (bodyRow && bodyRow.embedding) {
      return Buffer.from(bodyRow.embedding).toString('utf-8');
    }
  } catch (err) { ctx.logger.debug({ symbolId, err }, 'body_embeddings table may not exist — skipping body code'); }
  return '';
}

type SymbolDetail = NonNullable<Awaited<ReturnType<AdminContext['db']['symbol']['getSymbolDetail']>>>;

async function buildIdentityParts(detail: SymbolDetail): Promise<string[]> {
  const BR = '  ';
  const isPega = Boolean(detail.language && detail.language.toLowerCase() === 'pega');
  if (!detail.signature) return [];
  if (isPega) {
    // For Pega, show the 5 identity fields (type, class, name, ruleset, version)
    // parsed from the signature instead of the raw FQN string. These 5 together
    // uniquely identify a Pega rule.
    const { parseFqn } = await import('../../../modules/pega/pega-mapping.js');
    const f = parseFqn(detail.signature);
    const dash = (v: string) => (v && v !== '-' ? v : '(none)');
    return [
      `**Rule Name:** ${detail.name}${BR}`,
      `**Rule Type:** ${f.pxObjClass}${BR}`,
      `**Rule Class:** ${f.pyClassName}${BR}`,
      `**RuleSet:** ${dash(f.ruleSet)}${BR}`,
      `**Version:** ${dash(f.version)}`,
    ];
  }
  return [`**Signature:** \`${detail.signature}\``];
}

function buildMetaParts(detail: SymbolDetail, lines: string): string[] {
  return [
    detail.docComment ? `**Doc:** ${detail.docComment}` : '',
    `**Kind:** ${detail.kind}`, `**File:** ${detail.relativePath}`,
    lines ? `**Location:** ${lines}` : '',
    detail.module ? `**Module:** ${detail.module}` : '',
    detail.visibility ? `**Visibility:** ${detail.visibility}` : '',
    detail.parentSymbol ? `**Parent:** ${detail.parentSymbol}` : '',
  ].filter(Boolean);
}

function buildContentParts(identityParts: string[], metaParts: string[], bodyCode: string, detail: SymbolDetail): string {
  const isPega = Boolean(detail.language && detail.language.toLowerCase() === 'pega');
  const codeLabel = isPega ? '**Rule Content:**' : '**Code:**';
  const codeFence = isPega ? 'text' : (detail.language?.toLowerCase() || 'typescript');
  return [
    // Identity block (each field already ends with a hard break) as its own paragraph.
    identityParts.join('\n'),
    // Meta fields: blank line between each so markdown keeps them on separate lines.
    metaParts.join('\n\n'),
    bodyCode ? `${codeLabel}\n\`\`\`${codeFence}\n${bodyCode.substring(0, 2000)}\n\`\`\`` : '',
  ].filter(Boolean).join('\n\n');
}
