/**
 * SA4E-171 — Pega pxObjClass -> symbol kind classification.
 * Single source of truth: kind is derived deterministically from pxObjClass
 * (no hardcoded table), so new Pega rule types classify automatically.
 */

/**
 * Resolve pxObjClass to symbol kind by a single deterministic rule:
 *   kind = 'pega_' + pxObjClass lowercased with '-' replaced by '_'.
 * e.g. 'Rule-Obj-Activity' → 'pega_rule_obj_activity',
 *      'Rule-Obj-Model'    → 'pega_rule_obj_model'.
 *
 * No hardcoded table, no segment slicing: every present and FUTURE Pega rule
 * type is classified automatically and losslessly (the full class is preserved).
 * @param pxObjClass - The Pega rule class identifier (e.g. 'Rule-Obj-Activity')
 * @returns Kind string, or 'pega_unknown' for empty/invalid input
 */
export function resolveSymbolKind(pxObjClass: string): string {
  if (!pxObjClass || typeof pxObjClass !== 'string') return 'pega_unknown';
  return `pega_${pxObjClass.trim().toLowerCase().replace(/-/g, '_')}`;
}

/**
 * Check if a kind is a Pega symbol kind (RD-01).
 * Uses startsWith pattern for future-proof extensibility.
 * @param kind - Symbol kind string to check
 * @returns true if kind starts with 'pega_'
 */
export function isPegaKind(kind: string): boolean {
  return kind.startsWith('pega_');
}

/** Segment used in FQN/path when ruleset or version is absent. */
const EMPTY_SEGMENT = '-';

/** Sanitize an identity segment for safe use in ':'-joined FQN / '/'-joined path. */
function seg(value: string | undefined | null): string {
  const v = (value ?? '').toString().trim();
  if (!v) return EMPTY_SEGMENT;
  return v.replace(/[:/!]/g, '_').replace(/\s+/g, '_'); // sanitize separators
}

/**
 * Resolve the RuleSet name from a Pega rule JSON object.
 * Handles both export casings: pyRuleSet (capital S, actual export) and
 * pyRuleset (lowercase, some fixtures/synthesizers). Single source of truth.
 */
export function resolveRuleSetName(ruleJson: Record<string, unknown>): string {
  const r = ruleJson as Record<string, unknown>;
  return String(r.pyRuleSet ?? r.pyRuleset ?? '').trim();
}

/**
 * Resolve the RuleSet Version from a Pega rule JSON object.
 * Handles both casings: pyRuleSetVersion (capital S) and pyRulesetVersion.
 */
export function resolveRuleSetVersion(ruleJson: Record<string, unknown>): string {
  const r = ruleJson as Record<string, unknown>;
  return String(r.pyRuleSetVersion ?? r.pyRulesetVersion ?? '').trim();
}

/**
 * Build virtual file path from rule metadata (BR-02).
 * Format: pega://{pyClassName}/{ruleType}/{pyRuleName}/{ruleSet}/{version}
 * RuleSet + version are part of a rule's identity — omitting them made distinct
 * rules (same name/class/type, different ruleset-version) collide on one path
 * and overwrite each other. Absent segments use '-'.
 */
export function buildVirtualPath(
  pyClassName: string, kind: string, pyRuleName: string,
  ruleSet?: string, version?: string,
): string {
  const ruleType = kind.replace('pega_', '');
  return `pega://${pyClassName}/${ruleType}/${pyRuleName}/${seg(ruleSet)}/${seg(version)}`;
}

/**
 * Build FQN signature string (BR-03).
 * Format: {pxObjClass}:{pyClassName}:{pyRuleName}:{ruleSet}:{version}
 * pxObjClass stays at index 0 (append-only) so split(':')[0] parsers keep working.
 * The 5 parts are the full Pega identity (type, class, name, ruleset, version).
 * @returns Fully-qualified name string
 */
export function buildFqn(
  pxObjClass: string, pyClassName: string, pyRuleName: string,
  ruleSet?: string, version?: string,
): string {
  return `${pxObjClass}:${pyClassName}:${pyRuleName}:${seg(ruleSet)}:${seg(version)}`;
}

/**
 * Parse an FQN string back into its identity parts. Tolerant of the legacy
 * 3-part form (ruleSet/version default to '-'). pxObjClass is always index 0.
 */
export function parseFqn(fqn: string): {
  pxObjClass: string; pyClassName: string; pyRuleName: string;
  ruleSet: string; version: string;
} {
  const p = (fqn || '').split(':');
  return {
    pxObjClass: p[0] ?? '',
    pyClassName: p[1] ?? '',
    pyRuleName: p[2] ?? '',
    ruleSet: p[3] ?? EMPTY_SEGMENT,
    version: p[4] ?? EMPTY_SEGMENT,
  };
}

/**
 * Resolve the canonical rule name from a Pega rule JSON object.
 * Mirrors PegaRuleAstParser.extractName fallback order (AF-01):
 * pyRuleName → pyActivityName → pyModelName → pyFlowName → pyLabel.
 */
export function resolveRuleNameField(ruleJson: Record<string, unknown>): string {
  const sanitize = (v: string) => v.replace(/[:/!]/g, '_').replace(/\s+/g, '_');
  const r = ruleJson as Record<string, unknown>;
  const name = String(
    r.pyRuleName
    || r.pyActivityName
    || r.pyModelName
    || r.pyFlowName
    || r.pyServiceName
    || r.pyName
    || (r as any).pxInsName
    || r.pyLabel
    || r.pyTableName
    || r.pyColumnName
    || r.pyPropertyName
    || r.pyDBName
    || '',
  ).trim();
  if (name) return sanitize(name);
  // Fallback for Data-Admin rules lacking a conventional name field.
  const insKey = String(r.insKey ?? r.pzInsKey ?? '').trim();
  if (insKey) {
    const firstSpace = insKey.indexOf(' ');
    if (firstSpace > 0 && firstSpace < insKey.length - 1) {
      const candidate = insKey.slice(firstSpace + 1).trim();
      if (candidate) return sanitize(candidate);
    }
    const parts = insKey.split(/[/!]/).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return sanitize(last);
  }
  return '';
}

/**
 * Resolve the canonical class name from a Pega rule JSON object.
 *
 * Many instance-level Data-Admin rule types (Operator-AccessGroup, AuthService,
 * Calendar, Organization, ServicePackage, Requestor, ...) carry NO pyClassName —
 * they are not "applied to" another class; they ARE their own class. For these the
 * class IS pxObjClass. Using this single fallback everywhere an FQN/virtual path is
 * built keeps identity CONSISTENT (INV: same rule → same FQN at write and at
 * checksum-dedup), and stops these rules from being dropped as symbol_skip.
 *
 * @returns pyClassName when present, else pxObjClass, else ''.
 */
export function resolveClassNameField(ruleJson: Record<string, unknown>): string {
  const r = ruleJson as Record<string, unknown>;
  return String(r.pyClassName || r.pxObjClass || '').trim();
}
