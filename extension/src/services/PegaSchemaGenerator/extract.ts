/**
 * PegaSchemaExtractor — extraction pipeline of the schema generator.
 * Builds SchemaProperty entries from the raw field inputs collected by the
 * SectionFieldExtractor, recursing into embedded sections and PageLists.
 */

import type { CellPropertyBinding, LayoutPropertyInfo, RenderedFieldInfo } from "../PegaBrowserInspector";
import type { SchemaNode, SchemaProperty } from "./types";
import type { RawFieldInputs } from "./field-extractor";
import { PegaSchemaGeneratorBase } from "./base";

export class PegaSchemaExtractor extends PegaSchemaGeneratorBase {
  /** Extract section via browser + resolve properties via API. */
  protected async extractAndBuild(
    className: string, sectionName: string, depth: number,
  ): Promise<SchemaNode> {
    const key = `${className}/${sectionName}`;
    const done = this.checkCacheAndMark(key, className, sectionName, depth);
    if (done) { return done; }

    this.log(`[SchemaGen] ${"  ".repeat(depth)}Section: ${sectionName} (${className})`);

    // Step 0: Resolve rule via API and fetch full rule JSON
    const resolved = await this.fieldExtractor.resolveRuleSafe(className, sectionName, depth);

    // Step 1: Detect view type and extract fields
    const raw = await this.fieldExtractor.extractFieldsFromView(className, sectionName, resolved, depth);

    // Step 2: Build properties from browser results
    const node = await this.buildNode(className, sectionName, depth, raw);
    return this.finalizeNode(key, node);
  }

  /** Step 2 — merge the raw inputs into schema properties and count them. */
  private async buildNode(
    className: string, sectionName: string, depth: number, raw: RawFieldInputs,
  ): Promise<SchemaNode> {
    const properties: SchemaProperty[] = [];
    const seen = new Set<string>();

    // From design canvas fields (PageList, text, etc.)
    await this.mergeFieldProperties(className, depth, raw.fields, seen, properties);
    // From cell properties (field bindings from dblclick)
    await this.mergeCellProperties(className, depth, raw.cells, seen, properties);
    // From layout properties (table source = PageList)
    await this.mergeLayoutProperties(className, depth, raw.layouts, seen, properties);

    this.propertyCount += properties.length;
    return { className, sectionName, properties };
  }

  /** Merge design canvas fields (PageList, text, etc.) into properties. */
  private async mergeFieldProperties(
    className: string, depth: number, fields: RenderedFieldInfo[],
    seen: Set<string>, properties: SchemaProperty[],
  ): Promise<void> {
    for (const f of fields) {
      if (seen.has(f.fieldName)) continue;
      seen.add(f.fieldName);

      // Section includes — recursively process embedded section
      if (f.inputType === "SectionInclude") {
        await this.mergeSectionInclude(className, f, depth, seen, properties);
        continue;
      }

      const prop = await this.api.resolveProperty(className, f.fieldName, depth);
      if (prop) {
        prop.label = f.label;
        if (f.required) prop.required = true;
        properties.push(prop);
      }
    }
  }

  /** Recursively process an embedded section include. */
  private async mergeSectionInclude(
    className: string, f: RenderedFieldInfo, depth: number,
    seen: Set<string>, properties: SchemaProperty[],
  ): Promise<void> {
    this.log(`[SchemaGen] ${"  ".repeat(depth)}  ↳ Section include: ${f.fieldName}`);
    if (depth < this.maxDepth) {
      const nestedNode = await this.extractAndBuild(className, f.fieldName, depth + 1);
      for (const np of nestedNode.properties) {
        if (!seen.has(np.name)) {
          seen.add(np.name);
          properties.push(np);
        }
      }
    }
  }

  /** Merge cell properties (field bindings from dblclick) into properties. */
  private async mergeCellProperties(
    className: string, depth: number, cells: CellPropertyBinding[],
    seen: Set<string>, properties: SchemaProperty[],
  ): Promise<void> {
    for (const c of cells) {
      const name = c.labelFor.replace(/^\./, "");
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const prop = await this.api.resolveProperty(className, name, depth);
      if (prop) {
        prop.label = c.headerText;
        properties.push(prop);
      }
    }
  }

  /**
   * Merge layout properties (table source = PageList).
   * May already exist from fields loop — merge flow action recursion.
   */
  private async mergeLayoutProperties(
    className: string, depth: number, layouts: LayoutPropertyInfo[],
    seen: Set<string>, properties: SchemaProperty[],
  ): Promise<void> {
    for (const l of layouts) {
      const name = l.listGroup.replace(/^\./, "");
      if (!name) continue;

      let prop = properties.find((p) => p.name === name);
      if (!prop) {
        const resolved = await this.api.resolveProperty(className, name, depth);
        if (resolved) { prop = resolved; properties.push(prop); }
      }

      if (prop && prop.type === "array" && l.detailFlowAction && !prop.items) {
        const nestedClass = prop.pageClass || className;
        const nested = await this.extractAndBuild(nestedClass, l.detailFlowAction, depth + 1);
        prop.items = nested;
      }
    }
  }
}
