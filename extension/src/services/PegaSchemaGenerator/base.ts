/**
 * PegaSchemaGeneratorBase — shared state, browser tab management and
 * JSON Schema conversion for the PegaSchemaGenerator class chain.
 */

import type { PegaBrowserInspector } from "../PegaBrowserInspector";
import type { SchemaGenerationResult, SchemaGeneratorConfig, SchemaNode, SchemaProperty } from "./types";
import type { PegaRuleApi } from "./rule-api";
import { SectionFieldExtractor } from "./field-extractor";

/**
 * Base class of the PegaSchemaGenerator inheritance chain. Holds the caches,
 * counters and collaborators; subclasses add the extraction pipeline and the
 * public generation entry points.
 */
export class PegaSchemaGeneratorBase {
  protected visitedClasses = new Set<string>();
  protected sectionCache = new Map<string, SchemaNode>();
  protected propertyCache = new Map<string, SchemaProperty>();
  protected sectionCount = 0;
  protected propertyCount = 0;

  constructor(
    protected readonly config: SchemaGeneratorConfig,
    protected readonly inspector: PegaBrowserInspector | null,
    protected readonly log: (msg: string) => void,
    protected readonly api: PegaRuleApi,
    protected readonly fieldExtractor: SectionFieldExtractor,
    protected readonly maxDepth: number,
  ) {}

  /** Cache/visited guard for a section key. Returns a finished node when the
   *  section is cached or already visited; otherwise marks it and returns null. */
  protected checkCacheAndMark(
    key: string, className: string, sectionName: string, depth: number,
  ): SchemaNode | null {
    // Check cache first — avoid reopening same section
    const cached = this.sectionCache.get(key);
    if (cached) {
      this.log(`[SchemaGen] ${"  ".repeat(depth)}Cache hit: ${sectionName} (${className})`);
      return cached;
    }

    if (this.visitedClasses.has(key)) {
      return { className, sectionName, properties: [] };
    }
    this.visitedClasses.add(key);
    this.sectionCount++;
    return null;
  }

  /** Cache a built node, then close the rule tab in Pega Dev Studio. */
  protected async finalizeNode(key: string, node: SchemaNode): Promise<SchemaNode> {
    // Cache result for reuse
    this.sectionCache.set(key, node);

    // Close the rule tab in browser (Pega limits open tabs)
    await this.closeCurrentRuleTab();
    return node;
  }

  /** Close the current rule tab in Pega Dev Studio. */
  protected async closeCurrentRuleTab(): Promise<void> {
    if (!this.inspector) return;
    const page = (this.inspector as any).page;
    if (!page) return;

    try {
      const closed = await page.evaluate(() => {
        // Path: ul > li[N] > span > span > table > tbody > tr > td:nth-child(3) > span
        const tabLis = document.querySelectorAll("#workarea ul > li");
        if (tabLis.length <= 2) return "only-home";

        // Find last REAL tab (skip spacer li at end)
        for (let i = tabLis.length - 1; i >= 1; i--) {
          const closeBtn = tabLis[i].querySelector(
            "td:nth-child(3) > span",
          ) as HTMLElement;
          if (closeBtn && closeBtn.offsetParent !== null) {
            closeBtn.click();
            return "closed-li-" + i;
          }
          const ariaClose = tabLis[i].querySelector(
            'span[aria-label="Close this tab"]',
          ) as HTMLElement;
          if (ariaClose) {
            ariaClose.click();
            return "closed-aria-li-" + i;
          }
        }
        return "no-close-found";
      });
      this.log(`[SchemaGen]   Tab close: ${closed}`);
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) { console.debug('[PegaSchemaGenerator] ignore :', (err as Error).message); }
  }

  /** Convert result to standard JSON Schema format. */
  public toJsonSchema(result: SchemaGenerationResult): object {
    const requiredProps = result.schema.properties
      .filter((p) => p.required)
      .map((p) => p.name);

    return {
      $schema: "http://json-schema.org/draft-07/schema#",
      title: result.rootClass,
      description: `Pega class schema for ${result.rootClass}`,
      type: "object",
      properties: this.toProps(result.schema),
      ...(requiredProps.length > 0 ? { required: requiredProps } : {}),
      "x-pega-metadata": result.metadata,
    };
  }

  private toProps(node: SchemaNode): object {
    const props: Record<string, object> = {};
    for (const p of node.properties) {
      const sp: any = { type: p.type, description: p.label || p.pegaType };
      if (p.pageClass) sp["x-pega-class"] = p.pageClass;
      if (p.type === "array" && p.items) {
        sp.items = { type: "object", properties: this.toProps(p.items), "x-pega-class": p.items.className };
      }
      if (p.type === "object" && p.properties) {
        sp.properties = this.toProps(p.properties);
        sp["x-pega-class"] = p.properties.className;
      }
      props[p.name] = sp;
    }
    return props;
  }
}
