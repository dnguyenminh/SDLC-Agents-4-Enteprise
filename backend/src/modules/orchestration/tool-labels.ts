/**
 * Tool label derivation for the mcp_tools registry (find_tools search aid).
 *
 * Tool names + descriptions alone leave short keyword queries ("jira",
 * "drawio", "memory") at the mercy of embedding-similarity scoring. Labels
 * give each tool an explicit, deterministic, searchable keyword surface:
 *  - name tokens (`jira_get_issue` → `jira get issue`)
 *  - known domain synonyms per tool-name family (factual, kept small)
 *  - the owning category/server keywords
 *
 * Used by tool-ingestion (persisted into mcp_tools.labels) and consumed by
 * MemoryToolSearchService as a deterministic score boost on top of cosine
 * similarity — so an exact keyword hit never drowns behind vector noise.
 */

/** [name-family regex, extra synonym keywords] — first match wins per family. */
const FAMILY_SYNONYMS: Array<[RegExp, string]> = [
  [/\bjira\b|_jira_|^jira/, 'ticket issue atlassian'],
  [/\bconfluence\b|^confluence/, 'wiki page atlassian'],
  [/\bpega\b|^pega/, 'rule ruleset class'],
  [/\bdrawio\b|^drawio/, 'diagram visio'],
  [/\bgraph\b/, 'graph edge node relationship'],
  [/\bmemory\b|^mem_|_mem_/, 'memory kb knowledge'],
  [/\bcode\b|^code_|_code_/, 'code source symbols'],
  [/\bkb\b|^kb_/, 'kb knowledge'],
  [/\bmarkdown\b|\bdocx\b/, 'document export'],
];

export interface ToolLabelSource {
  name: string;
  category?: string | null;
  server?: string | null;
}

/** Split a name/category/server/query string into lowercase word tokens.
 *  Underscores DO split (`jira_get_issue` → jira, get, issue) so a keyword
 *  query like "jira" can match a snake_case tool name token-per-token. */
function tokensOf(value: string | null | undefined): string[] {
  if (!value) return [];
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(t => t.length > 0);
}

/**
 * Deterministic label string for one tool.
 * Deduped lowercase words: name tokens + family synonyms + category/server.
 */
export function deriveToolLabels(tool: ToolLabelSource): string {
  const tokens = new Set<string>(tokensOf(tool.name));
  const lowered = tool.name.toLowerCase();
  for (const [family, synonyms] of FAMILY_SYNONYMS) {
    if (family.test(lowered)) {
      for (const s of tokensOf(synonyms)) tokens.add(s);
    }
  }
  for (const t of tokensOf(tool.category)) tokens.add(t);
  for (const t of tokensOf(tool.server)) tokens.add(t);
  return [...tokens].join(' ');
}
