/**
 * PegaSchemaGenerator — Generates JSON Schema from Pega class via API + Browser.
 * SA4E-95: Combines /rules/query API (OOP resolution) with browser design canvas.
 *
 * Flow:
 * 1. Open section in browser → extract fields, cell props, layout props
 * 2. For each property: resolve type/pageClass via /rules/query API
 * 3. For PageList with flow action: recurse into nested section
 * 4. Output: JSON Schema with full property tree
 */

import type { PegaBrowserInspector } from "../PegaBrowserInspector";
import { DEFAULT_MAX_DEPTH } from "./types";
import type { SchemaGenerationResult, SchemaGeneratorConfig, SchemaNode, SchemaProperty } from "./types";
import { PegaRuleApi } from "./rule-api";
import { SectionFieldExtractor } from "./field-extractor";
import { PegaSchemaExtractor } from "./extract";

/**
 * Generates JSON Schema from Pega class definition + browser inspection.
 */
export class PegaSchemaGenerator extends PegaSchemaExtractor {
  constructor(
    config: SchemaGeneratorConfig,
    inspector: PegaBrowserInspector | null,
    log: (msg: string) => void,
  ) {
    const baseUrl = config.pegaEndpoint.replace(/\/PRServlet$/, "").replace(/\/prweb$/, "");
    const authHeader = "Basic " + Buffer.from(
      `${config.username}:${config.password}`,
    ).toString("base64");
    const maxDepth = config.maxDepth || DEFAULT_MAX_DEPTH;
    const api = new PegaRuleApi(baseUrl, authHeader, log);
    super(config, inspector, log, api, new SectionFieldExtractor(api, inspector, log), maxDepth);
  }

  /** Generate complete JSON schema for a Pega class starting from a section. */
  public async generateFromSection(
    className: string, sectionName: string,
  ): Promise<SchemaGenerationResult> {
    const startTime = Date.now();
    this.visitedClasses.clear();
    this.sectionCache.clear();
    this.propertyCache.clear();
    this.sectionCount = 0;
    this.propertyCount = 0;

    this.log(`[SchemaGen] Generating schema: ${className} / ${sectionName}`);

    const schema = await this.extractAndBuild(className, sectionName, 0);

    return {
      rootClass: className,
      schema,
      metadata: {
        totalProperties: this.propertyCount,
        totalSections: this.sectionCount,
        depth: this.maxDepth,
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      },
    };
  }

  /** Generate complete JSON schema for ALL sections of a Pega class. */
  public async generateFromClass(className: string): Promise<SchemaGenerationResult> {
    const startTime = Date.now();
    this.visitedClasses.clear();
    this.sectionCache.clear();
    this.propertyCache.clear();
    this.sectionCount = 0;
    this.propertyCount = 0;

    this.log(`[SchemaGen] Generating FULL schema for class: ${className}`);

    // Step 1: List all sections via API
    const sectionNames = await this.api.listSectionsForClass(className);
    this.log(`[SchemaGen] Found ${sectionNames.length} sections for ${className}`);

    // Step 2: Process each section, merge properties (limit for sequential test)
    const allProperties = await this.runSectionBatch(className, sectionNames);

    const schema: SchemaNode = { className, properties: allProperties };

    return {
      rootClass: className,
      schema,
      metadata: {
        totalProperties: allProperties.length,
        totalSections: this.sectionCount,
        depth: this.maxDepth,
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      },
    };
  }

  /** Process each section of a class and merge de-duplicated properties. */
  private async runSectionBatch(
    className: string, sectionNames: string[],
  ): Promise<SchemaProperty[]> {
    const limit = sectionNames.length; // No limit — process all
    const allProperties: SchemaProperty[] = [];
    const seenProps = new Set<string>();

    for (let i = 0; i < Math.min(limit, sectionNames.length); i++) {
      const name = sectionNames[i];
      this.log(`[SchemaGen] [${i + 1}/${sectionNames.length}] ${name}`);

      try {
        const node = await this.extractAndBuild(className, name, 0);
        for (const prop of node.properties) {
          if (!seenProps.has(prop.name)) {
            seenProps.add(prop.name);
            allProperties.push(prop);
          }
        }
      } catch (err: any) {
        this.log(`[SchemaGen]   ⚠️ ${name}: ${err.message}`);
      }
    }

    return allProperties;
  }
}
