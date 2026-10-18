/**
 * Pure HTML parsers for Cell Properties / DV Property Panel popups (SA4E-95).
 * Moved verbatim from the original PegaBrowserInspector monolith.
 */

import type { CellPropertyBinding } from "./types";
import type { LogFn } from "./state";

/** Parse Cell Properties HTML to extract field bindings. */
export function parseCellHTML(html: string, headerText: string): CellPropertyBinding {
  const gridRD = matchGridRD(html);
  return {
    headerText,
    labelFor: matchLabelFor(html),
    cellText: matchCellText(html),
    visibility: matchVisibility(html),
    baseRef: html.match(/BASE_REF="([^"]+)"/)?.[1] || "",
    gridRDName: gridRD.gridRDName,
    gridRDClass: gridRD.gridRDClass,
  };
}

/** Match "Label for" property ref (with value-before-ID fallback). */
function matchLabelFor(html: string): string {
  // Pega uses: ID="pyLabelFor" TYPE="text" value=".Access Group"
  // with ISNS_BASECLASS="pyLabelForPromptClass"
  const labelForMatch = html.match(
    /ID="pyLabelFor"[\s\S]{0,200}?value="([^"]*)"/,
  ) || html.match(
    /id="pyLabelFor"[\s\S]{0,200}?value="([^"]*)"/i,
  );

  // Fallback: value before ID
  const labelForAlt = html.match(
    /value="([^"]*)"[\s\S]{0,200}?ID="pyLabelFor"/,
  );

  return labelForMatch?.[1] || labelForAlt?.[1] || "";
}

/** Match cell text from pySmartPrompt input value. */
function matchCellText(html: string): string {
  // Cell text: pySmartPrompt input value
  const cellTextMatch = html.match(
    /ID="pySmartPrompt"[\s\S]{0,200}?value="([^"]*)"/i,
  ) || html.match(
    /name="[^"]*pySmartPromptClass[^"]*"[\s\S]{0,100}?value="([^"]*)"/,
  );

  return cellTextMatch?.[1] || "";
}

/** Match grid repeat data name/class (pyGridRDName / pyGridRDClass). */
function matchGridRD(html: string): { gridRDName: string; gridRDClass: string } {
  const gridRDNameMatch = html.match(
    /ID="pyGridRDName"[\s\S]{0,200}?value="([^"]*)"/i,
  ) || html.match(
    /name="[^"]*pyGridRDName[^"]*"[\s\S]{0,100}?value="([^"]*)"/,
  );
  const gridRDClassMatch = html.match(
    /ID="pyGridRDClass"[\s\S]{0,200}?value="([^"]*)"/i,
  ) || html.match(
    /name="[^"]*pyGridRDClass[^"]*"[\s\S]{0,100}?value="([^"]*)"/,
  );

  return { gridRDName: gridRDNameMatch?.[1] || "", gridRDClass: gridRDClassMatch?.[1] || "" };
}

/** Match visibility setting (defaults to "Always"). */
function matchVisibility(html: string): string {
  const visMatch = html.match(
    /Visibility[\s\S]{0,200}?selected[^>]*>([^<]+)</,
  ) || html.match(/pyVisibility[\s\S]{0,100}?value['":\s]+['"]([^'"]+)['"]/);

  return visMatch?.[1]?.trim() || "Always";
}

/**
 * Parse field cell popup HTML (DV Property Panel format).
 * Key pattern: ID="pyValue" TYPE="text" value=".pyTitle"
 * Name format: $PTempRecordForDVPropPanel$ppySections$l1$...$ppyValue
 */
export function parseFieldCellHTML(html: string, label: string, log: LogFn): CellPropertyBinding {
  // Clean: remove leading dot
  const cleanProp = stripLeadingDot(matchFieldPropRef(html));
  logFieldParseResult(log, label, cleanProp);
  return {
    headerText: label,
    labelFor: cleanProp,
    cellText: label,
    visibility: matchFieldVisibility(html),
    baseRef: "",
    gridRDName: "",
    gridRDClass: "",
  };
}

/** Primary pattern: ID="pyValue" input with property reference value. */
function matchPyValue(html: string): string | undefined {
  const pyValueMatch = html.match(
    /ID="pyValue"[\s\S]{0,300}?value="([^"]*)"/,
  ) || html.match(
    /id="pyValue"[\s\S]{0,300}?value="([^"]*)"/i,
  );

  return pyValueMatch?.[1];
}

/** Fallback: name ends with $ppyValue and has value with dot-prefix. */
function matchPpyValue(html: string): string | undefined {
  const ppyValueMatch = html.match(
    /name="[^"]*\$ppyValue"[\s\S]{0,300}?value="([^"]*)"/,
  ) || html.match(
    /name='[^']*\$ppyValue'[\s\S]{0,300}?value='([^']*)'/,
  );

  return ppyValueMatch?.[1];
}

/** Fallback: any input with data-ctl='non-auto' + ISNS_CLASS="Rule-Obj-Property" + value. */
function matchSmartPrompt(html: string): string | undefined {
  const smartPromptMatch = html.match(
    /data-ctl='non-auto'[\s\S]{0,500}?ISNS_CLASS="Rule-Obj-Property"[\s\S]{0,200}?value="([^"]*)"/,
  ) || html.match(
    /ISNS_CLASS="Rule-Obj-Property"[\s\S]{0,200}?value="([^"]*)"/,
  );

  return smartPromptMatch?.[1];
}

/** Extract property reference with fallbacks (pyValue → $ppyValue → smart prompt). */
function matchFieldPropRef(html: string): string {
  // Extract property reference
  return matchPyValue(html) || matchPpyValue(html) || matchSmartPrompt(html) || "";
}

/** Visibility: from JSON structure "pyDescription":"ALWAYS" (default). */
function matchFieldVisibility(html: string): string {
  const visMatch = html.match(
    /pyVisibilityWhenId[\s\S]{0,2000}?"pyDescription":"([^"]+)"/,
  );

  return visMatch?.[1]?.trim() || "Always";
}

/** Log the parse outcome for a field cell. */
function logFieldParseResult(log: LogFn, label: string, cleanProp: string): void {
  if (cleanProp) {
    log(`[BrowserInspector] parseFieldCell "${label}" → property="${cleanProp}"`);
  } else {
    log(`[BrowserInspector] parseFieldCell "${label}" → NO PROPERTY FOUND`);
  }
}

/** Remove leading dot from a property reference. */
function stripLeadingDot(propRef: string): string {
  return propRef.startsWith(".") ? propRef.substring(1) : propRef;
}
