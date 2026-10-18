/**
 * pySourceStream fetcher for non-auto-generated Pega sections (SA4E-95).
 * Resolves the section rule, checks pyAutoHTML and parses the raw JSP/HTML
 * source for property references.
 */

import type { RenderedFieldInfo } from "../PegaBrowserInspector";

/**
 * Fetch rule pySourceStream (for non-auto-generated sections) and extract property refs.
 * Parses JSP/HTML source for: <pega:reference name=".propName"/>
 * and tools.getProperty(".propName") patterns.
 */
export async function extractFromSourceStream(
  baseUrl: string, authHeader: string, log: (msg: string) => void,
  className: string, sectionName: string, depth: number,
): Promise<RenderedFieldInfo[]> {
  try {
    // Step 1: Resolve rule to get pzInsKey
    const resolveUrl = `${baseUrl}/prweb/api/CodeIntelligence/v1/rules/query`
      + `?pxObjClass=Rule-HTML-Section`
      + `&appliesTo=${encodeURIComponent(className)}`
      + `&pyRuleName=${encodeURIComponent(sectionName)}`;

    const resolveResp = await fetch(resolveUrl, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
    });
    if (!resolveResp.ok) return [];

    const resolveData = await resolveResp.json() as any;
    const insKey = resolveData.pzInsKey;
    if (!insKey) return [];

    // Check if non-auto-generated
    if (resolveData.pyAutoHTML !== false && resolveData.pyAutoHTML !== "false") {
      return []; // Auto-generated — browser should handle it
    }

    // Step 2: Fetch full rule to get pySourceStream
    const ruleUrl = `${baseUrl}/prweb/api/CodeIntelligence/v1/rules/${encodeURIComponent(insKey)}`;
    const ruleResp = await fetch(ruleUrl, {
      method: "GET",
      headers: { Authorization: authHeader },
    });
    if (!ruleResp.ok) return [];

    const ruleData = await ruleResp.json() as any;
    const source = ruleData.pySourceStream || "";
    if (!source) return [];

    log(`[SchemaGen] ${"  ".repeat(depth)}  Non-auto section: parsing pySourceStream (${source.length} chars)`);

    // Step 3: Parse property references from JSP/HTML source
    const props = new Set<string>();

    // Pattern 1: <pega:reference name=".pyPropertyName"/>
    const pegaRefMatches = source.matchAll(/<pega:reference\s+name=['"]\.([a-zA-Z_]\w*)['"]/g);
    for (const m of pegaRefMatches) { props.add(m[1]); }

    // Pattern 2: tools.getProperty(".pyPropertyName")
    const getPropertyMatches = source.matchAll(/tools\.getProperty\s*\(\s*["']\.([a-zA-Z_]\w*)["']\s*\)/g);
    for (const m of getPropertyMatches) { props.add(m[1]); }

    // Pattern 3: tools.getParamValue / tools.putSaveValue with property ref
    const paramMatches = source.matchAll(/tools\.(?:getParamValue|putSaveValue)\s*\(\s*["']([a-zA-Z_]\w*)["']/g);
    for (const m of paramMatches) {
      // Only include if it looks like a property (not a temp param name like "imgname")
      if (/^(py|px|pz)[A-Z]/.test(m[1])) { props.add(m[1]); }
    }

    // Pattern 4: .pyPropertyName in JSP expressions (getPrimaryPage().getProperty)
    const pagePropertyMatches = source.matchAll(/getProperty\s*\(\s*["']\.([a-zA-Z_]\w*)["']\s*\)/g);
    for (const m of pagePropertyMatches) { props.add(m[1]); }

    // Pattern 5: $save(propName) or property in pega:reference without dot
    const saveMatches = source.matchAll(/\$save\(([a-zA-Z_]\w*)\)/g);
    for (const m of saveMatches) {
      if (/^(py|px|pz)[A-Z]/.test(m[1])) { props.add(m[1]); }
    }

    return Array.from(props).map((name) => ({
      fieldName: name,
      inputType: "text",
      label: undefined,
      required: false,
      sectionContext: `${sectionName} (sourceStream)`,
    }));
  } catch (err: any) {
    log(`[SchemaGen] ${"  ".repeat(depth)}  ⚠️ SourceStream: ${err.message}`);
    return [];
  }
}
