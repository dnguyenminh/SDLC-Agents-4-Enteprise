/**
 * Pure parsers for Pega section rule data (extracted from PegaSchemaGenerator).
 * No I/O — each function maps rule JSON / JSP source to rendered field info.
 */

import type { RenderedFieldInfo } from "../PegaBrowserInspector";
import type { SchemaProperty } from "./types";

/** Detect section view type from rule JSON. */
export function detectViewType(ruleData: any): "simple" | "non-auto" | "complex" {
  if (!ruleData) return "complex";
  // Non-auto-generated (raw HTML/JSP)
  if (ruleData.pyAutoHTML === false || ruleData.pyAutoHTML === "false") return "non-auto";
  // Simple view: has pySections with field data (pyValue refs)
  // Works for both Design Template sections AND Smart Layout sections
  if (ruleData.pySections && Array.isArray(ruleData.pySections) && ruleData.pySections.length > 0) {
    // Quick check: does pySections contain any pyValue field references?
    const json = JSON.stringify(ruleData.pySections);
    if (json.includes('"pyValue"') && json.match(/"pyValue"\s*:\s*"\./)) {
      return "simple";
    }
  }
  return "complex";
}

/** Push a pyValue field binding into the accumulated field list. */
function pushPyValueField(
  fields: RenderedFieldInfo[], seen: Set<string>, obj: any, sectionName: string,
): void {
  // If this object has pyValue with dot-prefix → it's a field binding
  if (obj.pyValue && typeof obj.pyValue === "string" && obj.pyValue.startsWith(".")) {
    const propName = obj.pyValue.substring(1);
    if (propName && !seen.has(propName)) {
      seen.add(propName);
      fields.push({
        fieldName: propName,
        inputType: obj.pyType || "text",
        label: obj.pyLabelValue || obj.pyCaption || undefined,
        required: obj.pyRequired === "true" || obj.pyRequired === true,
        sectionContext: `${sectionName} (pySections)`,
      });
    }
  }
}

/** Push a pyPageListProperty table/repeat source (PageList) into the field list. */
function pushPageListField(
  fields: RenderedFieldInfo[], seen: Set<string>, obj: any, sectionName: string,
): void {
  // If this object has pyPageListProperty → it's a table/repeat source (PageList)
  if (obj.pyPageListProperty && typeof obj.pyPageListProperty === "string" && obj.pyPageListProperty.startsWith(".")) {
    const propName = obj.pyPageListProperty.substring(1);
    if (propName && !seen.has(propName)) {
      seen.add(propName);
      fields.push({
        fieldName: propName,
        inputType: "PageList",
        label: obj.pyCaption || undefined,
        required: obj.pyRequired === "true" || obj.pyRequired === true,
        sectionContext: `${sectionName} (pySections)`,
      });
    }
  }
}

/** Push a section include reference into the field list. */
function pushSectionIncludeField(fields: RenderedFieldInfo[], seen: Set<string>, obj: any): void {
  // If this is a section include reference
  if (obj.pySectionName && typeof obj.pySectionName === "string") {
    const secName = obj.pySectionName;
    if (!seen.has(`__section__${secName}`)) {
      seen.add(`__section__${secName}`);
      fields.push({
        fieldName: secName,
        inputType: "SectionInclude",
        required: false,
        sectionContext: "embedded",
      });
    }
  }
}

/** Visit one pySections node: emit field bindings, then recurse. */
function visitPySectionNode(
  fields: RenderedFieldInfo[], seen: Set<string>, obj: any, sectionName: string,
): void {
  if (!obj || typeof obj !== "object") return;
  pushPyValueField(fields, seen, obj, sectionName);
  pushPageListField(fields, seen, obj, sectionName);
  pushSectionIncludeField(fields, seen, obj);
}

/** Recursive traversal of pySections → pySectionBody → pyTable → pyRows → pyCells */
function traversePySections(
  fields: RenderedFieldInfo[], seen: Set<string>, obj: any, sectionName: string,
): void {
  visitPySectionNode(fields, seen, obj, sectionName);
  // Recurse into arrays and objects
  if (Array.isArray(obj)) {
    for (const item of obj) traversePySections(fields, seen, item, sectionName);
  } else if (obj && typeof obj === "object") {
    for (const val of Object.values(obj)) {
      if (val && typeof val === "object") traversePySections(fields, seen, val, sectionName);
    }
  }
}

/** Extract fields from pySections JSON structure (simple view sections). */
export function extractFromPySections(ruleData: any, sectionName: string): RenderedFieldInfo[] {
  const fields: RenderedFieldInfo[] = [];
  const seen = new Set<string>();
  traversePySections(fields, seen, ruleData.pySections, sectionName);
  return fields;
}

/** Add property references matched from JSP/HTML reference/getProperty patterns. */
function addReferenceMatches(source: string, props: Set<string>): void {
  // Pattern 1: <pega:reference name=".pyPropertyName"/>
  const pegaRefMatches = source.matchAll(/<pega:reference\s+name=['"]\.([a-zA-Z_]\w*)['"]/g);
  for (const m of pegaRefMatches) { props.add(m[1]); }

  // Pattern 2: tools.getProperty(".pyPropertyName")
  const getPropertyMatches = source.matchAll(/tools\.getProperty\s*\(\s*["']\.([a-zA-Z_]\w*)["']\s*\)/g);
  for (const m of getPropertyMatches) { props.add(m[1]); }

  // Pattern 3: getPrimaryPage().getProperty(".propName")
  const pagePropertyMatches = source.matchAll(/getProperty\s*\(\s*["']\.([a-zA-Z_]\w*)["']\s*\)/g);
  for (const m of pagePropertyMatches) { props.add(m[1]); }
}

/** Add property references from tools.putSaveValue / getParamValue with py/px/pz prefix. */
function addToolMatches(source: string, props: Set<string>): void {
  // Pattern 4: tools.putSaveValue with py/px/pz prefix
  const paramMatches = source.matchAll(/tools\.(?:getParamValue|putSaveValue)\s*\(\s*["']([a-zA-Z_]\w*)["']/g);
  for (const m of paramMatches) {
    if (/^(py|px|pz)[A-Z]/.test(m[1])) { props.add(m[1]); }
  }
}

/** Parse pySourceStream JSP/HTML content for property references. */
export function parseSourceStreamContent(source: string, sectionName: string): RenderedFieldInfo[] {
  if (!source) return [];
  const props = new Set<string>();
  addReferenceMatches(source, props);
  addToolMatches(source, props);

  return Array.from(props).map((name) => ({
    fieldName: name,
    inputType: "text",
    label: undefined,
    required: false,
    sectionContext: `${sectionName} (sourceStream)`,
  }));
}

/** Map Pega property type to JSON Schema type. */
export function mapType(pegaType: string): SchemaProperty["type"] {
  switch (pegaType) {
    case "PageList": return "array";
    case "Page": return "object";
    case "Integer": case "Double": case "Decimal": return "number";
    case "Boolean": case "TrueFalse": return "boolean";
    default: return "string";
  }
}
