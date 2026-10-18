/**
 * SectionFieldExtractor — raw field input collection for PegaSchemaGenerator.
 * Resolves the section rule via the API and extracts fields from the
 * pySections JSON, pySourceStream or the browser design canvas.
 */

import type { PegaBrowserInspector, CellPropertyBinding, LayoutPropertyInfo, RenderedFieldInfo } from "../PegaBrowserInspector";
import { detectViewType, extractFromPySections, parseSourceStreamContent } from "./source-parsers";
import type { PegaRuleApi } from "./rule-api";

/** Resolved rule bundle for one section (defaults when resolution failed). */
export interface ResolvedRule {
  ruleData: any;
  actualClass: string;
  ruleKey: string;
}

/** Raw field inputs collected for one section before property merging. */
export interface RawFieldInputs {
  fields: RenderedFieldInfo[];
  cells: CellPropertyBinding[];
  layouts: LayoutPropertyInfo[];
}

/** Collects raw field inputs for one section from API / JSON / browser. */
export class SectionFieldExtractor {
  constructor(
    private readonly api: PegaRuleApi,
    private readonly inspector: PegaBrowserInspector | null,
    private readonly log: (msg: string) => void,
  ) {}

  /** Step 0 — resolve rule via API, degrading to "no rule data" on failure. */
  async resolveRuleSafe(className: string, sectionName: string, depth: number): Promise<ResolvedRule> {
    let ruleData: any = null;
    let actualClass = className;
    let ruleKey = "";

    try {
      const resolved = await this.api.resolveAndFetchRule(className, sectionName);
      if (resolved) {
        ruleData = resolved.ruleData;
        actualClass = resolved.actualClass;
        ruleKey = resolved.ruleKey;
      }
    } catch (err: any) {
      this.log(`[SchemaGen] ${"  ".repeat(depth)}  ⚠️ Rule fetch: ${err.message}`);
    }

    return { ruleData, actualClass, ruleKey };
  }

  /** Step 1 — detect the section view type and collect raw field inputs. */
  async extractFieldsFromView(
    className: string, sectionName: string, resolved: ResolvedRule, depth: number,
  ): Promise<RawFieldInputs> {
    let fields: RenderedFieldInfo[] = [];
    let cells: CellPropertyBinding[] = [];
    let layouts: LayoutPropertyInfo[] = [];

    const viewType = detectViewType(resolved.ruleData);
    this.log(`[SchemaGen] ${"  ".repeat(depth)}  View: ${viewType}`);

    if (viewType === "simple" && resolved.ruleData) {
      // Simple view (Design Template) — extract from pySections JSON directly
      fields = extractFromPySections(resolved.ruleData, sectionName);
      this.log(`[SchemaGen] ${"  ".repeat(depth)}  JSON: ${fields.length} fields`);

    } else if (viewType === "non-auto" && resolved.ruleData) {
      // Non-auto-generated — parse pySourceStream
      fields = parseSourceStreamContent(resolved.ruleData.pySourceStream || "", sectionName);
      this.log(`[SchemaGen] ${"  ".repeat(depth)}  SourceStream: ${fields.length} fields`);

    } else if (this.inspector) {
      // Complex view — use browser
      ({ fields, cells, layouts } =
        await this.inspectViaBrowser(this.inspector, className, sectionName, resolved, depth));
    }

    return { fields, cells, layouts };
  }

  /** Complex view — inspect the rendered section via the browser inspector. */
  private async inspectViaBrowser(
    inspector: PegaBrowserInspector, className: string, sectionName: string,
    resolved: ResolvedRule, depth: number,
  ): Promise<RawFieldInputs> {
    let fields: RenderedFieldInfo[] = [];
    let cells: CellPropertyBinding[] = [];
    let layouts: LayoutPropertyInfo[] = [];
    let actualClass = resolved.actualClass;
    let ruleKey = resolved.ruleKey;

    try {
      if (!ruleKey) {
        const resolvedRule = await inspector.resolveRule(
          "Rule-HTML-Section", className, sectionName,
        );
        actualClass = resolvedRule?.pyClassName || className;
        ruleKey = resolvedRule?.pzInsKey
          || `RULE-HTML-SECTION ${className.toUpperCase()} ${sectionName.toUpperCase()} #20230101T000000.000 GMT`;
      }

      const result = await inspector.inspectHarness(actualClass, ruleKey);
      fields = result.renderedFields;
      cells = await inspector.extractCellProperties();
      layouts = await inspector.extractLayoutProperties();

      this.log(`[SchemaGen] ${"  ".repeat(depth)}  Browser: ${fields.length}F ${cells.length}C ${layouts.length}L`);
    } catch (err: any) {
      this.log(`[SchemaGen] ${"  ".repeat(depth)}  ⚠️ Browser: ${err.message}`);
    }

    // Fallback: if browser found nothing, try pySourceStream
    if (fields.length === 0 && cells.length === 0 && resolved.ruleData) {
      const sourceProps = parseSourceStreamContent(resolved.ruleData.pySourceStream || "", sectionName);
      if (sourceProps.length > 0) {
        this.log(`[SchemaGen] ${"  ".repeat(depth)}  Fallback SourceStream: ${sourceProps.length} props`);
        fields = sourceProps;
      }
    }

    return { fields, cells, layouts };
  }
}
