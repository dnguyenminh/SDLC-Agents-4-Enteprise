/**
 * SA4E-95 — Section body walker for HarnessParser.
 * Extracted from HarnessParser.ts: recursive descent over the section body tree.
 * Walks: pySections -> pySectionBody -> pyRows -> pyCells -> FIELD.
 * Implements BR-01, BR-09 (max depth), BR-15 (circular ref detection).
 * Field extraction delegated to FieldExtractor.
 */

import type { PageContext } from '../models/ParsedHarness.js';
import type { ParsedSection, BodyType } from '../models/ParsedSection.js';
import type { RepeatDefinition } from '../models/RepeatDefinition.js';
import type { ResolvedContext } from '../models/ResolvedContext.js';
import type { TemplateMarker } from '../models/TemplateMarker.js';
import type { IPageContextResolver } from '../resolver/PageContextResolver.js';
import type { IClassHierarchyResolver } from '../resolver/ClassHierarchyResolver.js';
import { FieldExtractor } from './FieldExtractor.js';
import { resolveReferencedSections } from './HarnessReferencedSections.js';
import type { ParseContext } from './HarnessParserTypes.js';

/** Recursive section-body walker. Max depth 5 (BR-09), circular ref detection (BR-15). */
export class HarnessSectionBodyWalker {
  private static readonly MAX_DEPTH = 5;
  templateMarkers: TemplateMarker[] = [];
  private readonly fieldExtractor = new FieldExtractor();

  constructor(
    private readonly hierarchyResolver: IClassHierarchyResolver,
    private readonly contextResolver: IPageContextResolver,
  ) {}

  /** Reset per-parse state (template markers accumulate during one parse run). */
  reset(): void { this.templateMarkers = []; }

  extractContextPages(json: Record<string, unknown>): PageContext[] {
    const pages = json.pyPagesAndClasses;
    if (!Array.isArray(pages)) return [];
    return pages
      .filter((p): p is Record<string, unknown> => p != null && typeof p === 'object')
      .map((p) => ({
        page: String(p.pyPageName ?? p.page ?? ''),
        className: String(p.pyClassName ?? ''),
        mode: p.pyMode ? String(p.pyMode) : undefined,
      }));
  }

  async parseSections(
    json: Record<string, unknown>, ctx: ParseContext, depth: number, visited: Set<string>
  ): Promise<ParsedSection[]> {
    const sections = json.pySections ?? json.pySectionBody;
    if (!Array.isArray(sections)) return [];
    const results: ParsedSection[] = [];
    for (const s of sections) {
      if (!s || typeof s !== 'object') continue;
      const parsed = await this.parseSectionBody(s as Record<string, unknown>, ctx, depth, visited);
      if (parsed) results.push(parsed);
    }
    return results;
  }

  private async parseSectionBody(
    body: Record<string, unknown>, ctx: ParseContext, depth: number, visited: Set<string>
  ): Promise<ParsedSection | null> {
    const bodyType = this.determineBodyType(body);
    const name = String(body.pyInclude ?? body.pyStreamName ?? body.pySectionName ?? 'unnamed');
    const pageCtx = this.contextResolver.resolve(
      String(body.pyUsingPage ?? ''), ctx.contextPages, ctx.primaryClass
    );
    switch (bodyType) {
      case 'INCLUDE': return this.handleInclude(body, name, pageCtx, ctx, depth, visited);
      case 'REPEATLAYOUT': return this.handleRepeat(body, name, pageCtx, ctx, depth, visited);
      case 'TEMPLATE': return this.handleTemplate(name, pageCtx, ctx, depth);
      default: return this.handleLayout(body, name, bodyType, pageCtx, ctx, depth, visited);
    }
  }

  private determineBodyType(body: Record<string, unknown>): BodyType {
    const raw = String(body.pyBodyType ?? '').toUpperCase();
    if (raw === 'INCLUDE' || body.pyInclude) return 'INCLUDE';
    if (raw === 'TEMPLATE') return 'TEMPLATE';
    if (body.pyPageListProperty) return 'REPEATLAYOUT';
    if (raw === 'FREEFORM') return 'FREEFORM';
    if (raw === 'SIMPLELAYOUT' || body.pyRows) return 'SIMPLELAYOUT';
    return 'UNKNOWN';
  }

  private async handleInclude(
    body: Record<string, unknown>, name: string, pageCtx: ResolvedContext,
    ctx: ParseContext, depth: number, visited: Set<string>
  ): Promise<ParsedSection> {
    const sectionName = String(body.pyInclude ?? name);
    const empty: ParsedSection = {
      name: sectionName, sourceClass: ctx.primaryClass, bodyType: 'INCLUDE',
      pageContext: pageCtx, fields: [], children: [], depth,
    };
    // BR-15: circular ref / BR-09: max depth
    if (visited.has(sectionName) || depth >= HarnessSectionBodyWalker.MAX_DEPTH) return empty;
    visited.add(sectionName);
    try {
      const resolved = await this.hierarchyResolver.resolveSection(sectionName, ctx.primaryClass);
      if (!resolved) return empty;
      const children = await this.parseSections(resolved.sectionJson, ctx, depth + 1, visited);
      const fields = this.fieldExtractor.extractFromJson(resolved.sectionJson, pageCtx);
      return { name: sectionName, sourceClass: resolved.resolvedClass, bodyType: 'INCLUDE',
        pageContext: pageCtx, fields, children, depth };
    } finally { visited.delete(sectionName); }
  }

  private async handleLayout(
    body: Record<string, unknown>, name: string, bodyType: BodyType,
    pageCtx: ResolvedContext, ctx: ParseContext, depth: number, visited: Set<string>
  ): Promise<ParsedSection> {
    const fields = this.fieldExtractor.extractFromJson(body, pageCtx);
    const children = await this.parseNested(body, ctx, depth, visited);
    return { name, sourceClass: ctx.primaryClass, bodyType, pageContext: pageCtx, fields, children, depth };
  }

  private async handleRepeat(
    body: Record<string, unknown>, name: string, pageCtx: ResolvedContext,
    ctx: ParseContext, depth: number, visited: Set<string>
  ): Promise<ParsedSection> {
    const rawProp = String(body.pyPageListProperty ?? '');
    const propertyName = rawProp.startsWith('.') ? rawProp.substring(1) : rawProp;
    const itemClass = String(body.pyPageListPropertyClass ?? '');
    const fields = this.fieldExtractor.extractFromJson(body, pageCtx);
    const children = await this.parseNested(body, ctx, depth, visited);
    const repeatProperty: RepeatDefinition = { propertyName, itemClass, fields, nestedRepeats: [] };
    return { name, sourceClass: ctx.primaryClass, bodyType: 'REPEATLAYOUT',
      pageContext: pageCtx, fields: [], repeatProperty, children, depth };
  }

  private handleTemplate(
    name: string, pageCtx: ResolvedContext, ctx: ParseContext, depth: number
  ): ParsedSection {
    this.templateMarkers.push({
      sectionName: name, ruleType: ctx.ruleType,
      reason: 'TEMPLATE layout - JS-rendered, cannot parse statically',
    });
    return { name, sourceClass: ctx.primaryClass, bodyType: 'TEMPLATE',
      pageContext: pageCtx, fields: [], children: [], depth };
  }

  private async parseNested(
    body: Record<string, unknown>, ctx: ParseContext, depth: number, visited: Set<string>
  ): Promise<ParsedSection[]> {
    const nested = body.pySectionBody ?? body.pySections;
    if (!Array.isArray(nested)) return [];
    const results: ParsedSection[] = [];
    for (const child of nested) {
      if (!child || typeof child !== 'object') continue;
      const p = await this.parseSectionBody(child as Record<string, unknown>, ctx, depth + 1, visited);
      if (p) results.push(p);
    }
    return results;
  }

  /**
   * Fallback for stream-rendered harnesses (pySourceStream):
   * Extract section names from pxRuleReferences and resolve them via hierarchy resolver.
   */
  resolveReferencedSections(
    harnessJson: Record<string, unknown>, ctx: ParseContext
  ): Promise<ParsedSection[]> {
    return resolveReferencedSections({
      hierarchyResolver: this.hierarchyResolver,
      contextResolver: this.contextResolver,
      fieldExtractor: this.fieldExtractor,
      parseSections: (json, c, depth, visited) => this.parseSections(json, c, depth, visited),
    }, harnessJson, ctx);
  }
}
