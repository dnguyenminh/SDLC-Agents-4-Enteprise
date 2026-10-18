/**
 * Pure HTML parsers for Layout Properties popups (SA4E-95).
 * Moved verbatim from the original PegaBrowserInspector monolith.
 */

import type { LayoutPropertyInfo } from "./types";
import type { LogFn } from "./state";

/** Parse Layout Properties HTML — General + Operations tabs. */
export function parseLayoutHTML(html: string, tableLabel: string, log: LogFn): LayoutPropertyInfo {
  // Debug: dump key sections
  logLayoutHtmlDebug(html, log);
  const { listGroup, gridSummary } = matchListValues(html);
  const { source, itemClass } = matchSourceValues(html);
  const { rowEditing, detailFlowAction } = matchOperationsTab(html);
  return {
    tableLabel,
    source,
    listGroup,
    gridSummary,
    itemClass,
    rowEditing,
    detailFlowAction,
  };
}

/** Debug-log key HTML sections for layout parsing diagnosis. */
function logLayoutHtmlDebug(html: string, log: LogFn): void {
  log(`[BrowserInspector]   Layout HTML size: ${html.length}`);
  const pyRDIdx = html.indexOf("pyRD");
  if (pyRDIdx > -1) log(`[BrowserInspector]   pyRD context: ${html.substring(pyRDIdx - 20, pyRDIdx + 200).replace(/\s+/g, " ")}`);
  const listIdx = html.indexOf("pyaccessgroups");
  if (listIdx > -1) log(`[BrowserInspector]   pyaccessgroups: ${html.substring(listIdx - 50, listIdx + 150).replace(/\s+/g, " ")}`);
  const flowIdx = html.indexOf("pzAccessGroupsRoles");
  if (flowIdx > -1) log(`[BrowserInspector]   flowAction: ${html.substring(flowIdx - 100, flowIdx + 100).replace(/\s+/g, " ")}`);
  const detailIdx = html.indexOf("Detail");
  if (detailIdx > -1) log(`[BrowserInspector]   Detail: ${html.substring(detailIdx - 20, detailIdx + 200).replace(/\s+/g, " ")}`);
}

/** Match List/Group + Grid summary values. */
function matchListValues(html: string): { listGroup: string; gridSummary: string } {
  // Parse List/Group — ID="pyPageListProperty" value=".pyaccessgroups_opid"
  const listGroupMatch = html.match(
    /ID="pyPageListProperty"[\s\S]{0,200}?value="([^"]*)"/i,
  ) || html.match(
    /pyPageListProperty[\s\S]{0,200}?value="([^"]*)"/i,
  ) || html.match(
    /ID="pyGridRDName"[\s\S]{0,200}?value="([^"]*)"/i,
  );

  const gridSummaryMatch = html.match(/Grid\s*summary[\s\S]{0,200}?value="([^"]*)"/i)
    || html.match(/ID="pyGridSummary"[\s\S]{0,200}?value="([^"]*)"/i)
    || html.match(/pyGridSummary[\s\S]{0,200}?value="([^"]*)"/i);

  return { listGroup: listGroupMatch?.[1] || "", gridSummary: gridSummaryMatch?.[1] || "" };
}

/** Match Source + Item class values. */
function matchSourceValues(html: string): { source: string; itemClass: string } {
  const sourceMatch = html.match(/Source[\s\S]{0,200}?selected[^>]*>([^<]+)</);

  const itemClassMatch = html.match(/of Class\s+([A-Za-z][A-Za-z0-9-]*)/)
    || html.match(/ISNS_BASECLASS="([^"]*)"/);

  return { source: sourceMatch?.[1]?.trim() || "Property", itemClass: itemClassMatch?.[1] || "" };
}

/** Match Operations-tab values: row editing mode + detail flow action. */
function matchOperationsTab(html: string): { rowEditing: string; detailFlowAction: string } {
  const masterDetail = html.includes("Master") && html.includes("detail");
  let rowEditing = "None";
  if (masterDetail) rowEditing = "Master-detail";

  // Flow action
  const flowActionMatch = html.match(
    /Detail flow action[\s\S]{0,300}?value="([^"]*)"/i,
  ) || html.match(
    /pyFlowActionName[\s\S]{0,200}?value="([^"]*)"/i,
  ) || html.match(
    /flow.?action[\s\S]{0,300}?value="([^"]*)"/i,
  ) || html.match(
    /value="(pz[A-Z][a-zA-Z]+)"[\s\S]{0,100}?flow/i,
  );

  return { rowEditing, detailFlowAction: flowActionMatch?.[1] || "" };
}
