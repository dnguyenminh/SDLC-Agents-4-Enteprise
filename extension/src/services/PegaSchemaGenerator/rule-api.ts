/**
 * Pega REST API collaborator for PegaSchemaGenerator — resolves section rules
 * and property definitions via the CodeIntelligence /rules endpoints.
 */

import type { SchemaProperty } from "./types";
import { mapType } from "./source-parsers";

/** Base-URL + Basic-auth caller for the CodeIntelligence rules API. */
export class PegaRuleApi {
  constructor(
    private readonly baseUrl: string,
    private readonly authHeader: string,
    private readonly log: (msg: string) => void,
  ) {}

  /** List all section names for a class via /rules/listRules API. */
  public async listSectionsForClass(className: string): Promise<string[]> {
    const sections = new Set<string>();
    let pageIndex = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `${this.baseUrl}/prweb/api/CodeIntelligence/v1/rules/listRules`
        + `?ObjClass=Rule-HTML-Section`
        + `&FilterPropName=pyClassName`
        + `&FilterPropValue=${encodeURIComponent(className)}`
        + `&PageSize=50&PageIndex=${pageIndex}`;

      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { Authorization: this.authHeader, "Content-Type": "application/json" },
        });

        if (!resp.ok) break;
        const json = await resp.json() as any;
        const results = json.pxResults || [];

        for (const r of results) {
          const name = r.pyStreamName || r.pyPropertyName || "";
          if (name) sections.add(name);
        }

        hasMore = results.length >= 50;
        pageIndex++;
      } catch (err) {
        break;
      }
    }

    return Array.from(sections);
  }

  /** Resolve a single property's type and page class via Pega API. */
  public async resolveProperty(
    className: string, propertyName: string, depth: number,
  ): Promise<SchemaProperty | null> {
    try {
      const url = `${this.baseUrl}/prweb/api/CodeIntelligence/v1/rules/query`
        + `?pxObjClass=Rule-Obj-Property`
        + `&appliesTo=${encodeURIComponent(className)}`
        + `&pyRuleName=${encodeURIComponent(propertyName)}`;

      const resp = await fetch(url, {
        method: "POST",
        headers: { Authorization: this.authHeader, "Content-Type": "application/json" },
      });

      if (!resp.ok) {
        return { name: propertyName, type: "string", pegaType: "SingleValue", required: false };
      }

      const json = await resp.json() as any;
      const pegaType = json.pyPropertyMode || "SingleValue";
      const pageClass = json.pyPageClass || "";

      return {
        name: propertyName,
        type: mapType(pegaType),
        pegaType,
        pageClass: pageClass || undefined,
        required: false,
      };
    } catch (err) {
      return { name: propertyName, type: "string", pegaType: "SingleValue", required: false };
    }
  }

  /** Resolve section rule and fetch full JSON in one step. */
  public async resolveAndFetchRule(
    className: string, sectionName: string,
  ): Promise<{ ruleData: any; actualClass: string; ruleKey: string } | null> {
    const resolveUrl = `${this.baseUrl}/prweb/api/CodeIntelligence/v1/rules/query`
      + `?pxObjClass=Rule-HTML-Section`
      + `&appliesTo=${encodeURIComponent(className)}`
      + `&pyRuleName=${encodeURIComponent(sectionName)}`;

    const resolveResp = await fetch(resolveUrl, {
      method: "POST",
      headers: { Authorization: this.authHeader, "Content-Type": "application/json" },
    });
    if (!resolveResp.ok) return null;

    const resolveData = await resolveResp.json() as any;
    const ruleKey = resolveData.pzInsKey || "";
    const actualClass = resolveData.pyClassName || className;
    if (!ruleKey) return null;

    // Fetch full rule JSON
    const ruleUrl = `${this.baseUrl}/prweb/api/CodeIntelligence/v1/rules/${encodeURIComponent(ruleKey)}`;
    const ruleResp = await fetch(ruleUrl, {
      method: "GET",
      headers: { Authorization: this.authHeader },
    });
    if (!ruleResp.ok) return { ruleData: resolveData, actualClass, ruleKey };

    const ruleData = await ruleResp.json() as any;
    return { ruleData, actualClass, ruleKey };
  }
}
