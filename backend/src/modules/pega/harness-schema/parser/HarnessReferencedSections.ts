/**
 * SA4E-95 / SA4E-214 — pxRuleReferences fallback for stream-rendered harnesses.
 * Extracted from HarnessParser.ts: resolves Rule-HTML-Section references that
 * cannot be walked statically (pySourceStream render mode).
 */

import type { ParsedSection } from '../models/ParsedSection.js';
import type { ResolvedContext } from '../models/ResolvedContext.js';
import type { IPageContextResolver } from '../resolver/PageContextResolver.js';
import type { IClassHierarchyResolver } from '../resolver/ClassHierarchyResolver.js';
import { FieldExtractor } from './FieldExtractor.js';
import type { ParseContext } from './HarnessParserTypes.js';

/** Dependencies injected by the walker (avoids a runtime import cycle). */
export interface ReferencedSectionDeps {
  hierarchyResolver: IClassHierarchyResolver;
  contextResolver: IPageContextResolver;
  fieldExtractor: FieldExtractor;
  parseSections(
    json: Record<string, unknown>, ctx: ParseContext, depth: number, visited: Set<string>
  ): Promise<ParsedSection[]>;
}

/**
 * Fallback for stream-rendered harnesses (pySourceStream):
 * Extract section names from pxRuleReferences and resolve them via hierarchy resolver.
 */
export async function resolveReferencedSections(
  deps: ReferencedSectionDeps, harnessJson: Record<string, unknown>, ctx: ParseContext
): Promise<ParsedSection[]> {
  const refs = harnessJson.pxRuleReferences;
  if (!Array.isArray(refs)) return [];
  const sectionNames = collectReferencedSectionNames(refs);

  const results: ParsedSection[] = [];
  const visited = new Set<string>();
  for (const sectionName of sectionNames) {
    if (visited.has(sectionName)) continue;
    visited.add(sectionName);
    const resolved = await resolveOne(deps, sectionName, ctx, visited);
    if (resolved) results.push(resolved);
  }
  return results;
}

/** Resolve a single referenced section (non-fatal on failure). */
async function resolveOne(
  deps: ReferencedSectionDeps, sectionName: string, ctx: ParseContext, visited: Set<string>
): Promise<ParsedSection | null> {
  try {
    const resolved = await deps.hierarchyResolver.resolveSection(sectionName, ctx.primaryClass);
    if (!resolved) return null;
    const pageCtx = deps.contextResolver.resolve('', ctx.contextPages, ctx.primaryClass);
    const fields = deps.fieldExtractor.extractFromJson(resolved.sectionJson, pageCtx);
    const children = await deps.parseSections(resolved.sectionJson, ctx, 1, new Set(visited));
    return {
      name: sectionName, sourceClass: resolved.resolvedClass, bodyType: 'INCLUDE',
      pageContext: pageCtx, fields, children, depth: 0,
    };
  } catch { /* non-fatal: section not resolvable */ return null; }
}

/** Collect Rule-HTML-Section names from pxRuleReferences (skip pz-internal). */
function collectReferencedSectionNames(refs: unknown[]): string[] {
  const sectionNames: string[] = [];
  for (const ref of refs) {
    if (!ref || typeof ref !== 'object') continue;
    const r = ref as Record<string, unknown>;
    if (r.pxRuleObjClass === 'Rule-HTML-Section' && typeof r.pyRuleName === 'string') {
      const name = r.pyRuleName as string;
      if (name && !name.startsWith('pz')) sectionNames.push(name);
    }
  }
  return sectionNames;
}
