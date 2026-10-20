/**
 * SA4E-95 - HarnessParser (facade): recursive descent parser for Pega
 * harness/section hierarchy. Walks: Harness -> pySections -> pySectionBody
 * -> pyRows -> pyCells -> FIELD. Implements BR-01, BR-09, BR-15.
 *
 * Dual-strategy section discovery (results merged, union):
 * 1. Rule-based: walk pySections, resolve pxRuleReferences
 * 2. LLM-based: ask LLM to identify sections/fields from raw harness JSON
 *
 * Implementation submodules (same directory):
 * - HarnessParserTypes.ts        — ParseContext + extractor/parser contracts
 * - HarnessLlmSections.ts        — LLM-based strategy + section merge
 * - HarnessSectionBodyWalker.ts  — recursive body walker (depth/circular guards)
 */

import type { ParsedHarness } from '../models/ParsedHarness.js';
import type { ParsedSection } from '../models/ParsedSection.js';
import type { HarnessFetcher } from '../fetcher/HarnessFetcher.js';
import type { IPageContextResolver } from '../resolver/PageContextResolver.js';
import type { IClassHierarchyResolver } from '../resolver/ClassHierarchyResolver.js';
import { HarnessSectionBodyWalker } from './HarnessSectionBodyWalker.js';
import { extractSectionsViaLlm, mergeSections } from './HarnessLlmSections.js';
import type { ILlmSectionExtractor, ParseContext } from './HarnessParserTypes.js';

// Preserve the original public type exports at this module path.
export type { LlmExtractedSection, ILlmSectionExtractor, IHarnessParser, ParseContext } from './HarnessParserTypes.js';
import type { IHarnessParser } from './HarnessParserTypes.js';

/** Recursive descent parser facade. Max depth 5 (BR-09), circular ref detection (BR-15). */
export class HarnessParser implements IHarnessParser {
  private readonly walker: HarnessSectionBodyWalker;

  constructor(
    private readonly fetcher: HarnessFetcher,
    hierarchyResolver: IClassHierarchyResolver,
    contextResolver: IPageContextResolver,
    private readonly llmExtractor?: ILlmSectionExtractor,
  ) {
    this.walker = new HarnessSectionBodyWalker(hierarchyResolver, contextResolver);
  }

  /** Parse a full harness JSON into intermediate representation */
  async parse(harnessJson: Record<string, unknown>): Promise<ParsedHarness> {
    this.walker.reset();
    const ruleType = String(harnessJson.pxObjClass ?? '');
    const primaryClass = String(harnessJson.pyClassName ?? ruleType);
    const contextPages = this.walker.extractContextPages(harnessJson);
    const ctx: ParseContext = { primaryClass, contextPages, ruleType };

    // Strategy 1: Rule-based section discovery
    let ruleSections: ParsedSection[] = await this.walker.parseSections(harnessJson, ctx, 0, new Set());

    // Fallback: stream-rendered harnesses → resolve from pxRuleReferences
    if (ruleSections.length === 0) {
      ruleSections = await this.walker.resolveReferencedSections(harnessJson, ctx);
    }

    // SA4E-214 Phase D: Detect stream-rendered harness (pySourceStream present) —
    // force LLM extraction when standard parse is empty, even if no pxRuleReferences
    const isStreamRendered = Boolean(harnessJson.pySourceStream) && ruleSections.length === 0;

    // Strategy 2: LLM-based section discovery (complements rule-based)
    // For stream-rendered harnesses, LLM is the primary strategy (not just supplement)
    const llmSections = await extractSectionsViaLlm(this.llmExtractor, harnessJson, ruleType, ctx);

    // Merge: union of both strategies
    const sections = mergeSections(ruleSections, llmSections);
    void isStreamRendered;

    return {
      ruleType, primaryClass, contextPages, sections,
      templateMarkers: [...this.walker.templateMarkers],
      metadata: {
        insKey: String(harnessJson.pzInsKey ?? ''),
        updateDateTime: String(harnessJson.pxUpdateDateTime ?? ''),
        ruleSetVersion: String(harnessJson.pyRuleSetVersion ?? ''),
      },
    };
  }
}
