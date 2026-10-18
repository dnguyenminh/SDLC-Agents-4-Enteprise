/**
 * Public types for the PegaBrowserInspector facade (SA4E-95).
 * Moved verbatim from the original PegaBrowserInspector.ts monolith.
 */

/** Property binding extracted from Cell Properties popup via dblclick */
export interface CellPropertyBinding {
  /** Column header text visible in design canvas */
  headerText: string;
  /** Property path from "Label for" field (e.g. ".Access Group") */
  labelFor: string;
  /** Cell text/display value */
  cellText: string;
  /** Visibility setting (Always, condition, etc.) */
  visibility: string;
  /** BASE_REF path in TempRecordForDVPropPanel */
  baseRef: string;
  /** Grid repeat data name (pyGridRDName) */
  gridRDName: string;
  /** Grid repeat data class (pyGridRDClass) */
  gridRDClass: string;
}

/** Layout/Table properties extracted from gear icon → Layout Properties popup */
export interface LayoutPropertyInfo {
  /** Table number label (e.g. "Table - 2") */
  tableLabel: string;
  /** Data source type (Property, Report, DataPage, etc.) */
  source: string;
  /** List/Group property (e.g. ".pyaccessgroups_opid") */
  listGroup: string;
  /** Grid summary name */
  gridSummary: string;
  /** Item class for the page list */
  itemClass: string;
  /** Operations: row editing mode (None, Inline, Master-detail) */
  rowEditing: string;
  /** Detail flow action name (for master-detail) */
  detailFlowAction: string;
}

/** Result of inspecting a single harness via browser */
export interface BrowserInspectionResult {
  renderedSections: string[];
  renderedFields: RenderedFieldInfo[];
  cellProperties?: CellPropertyBinding[];
  url: string;
  durationMs: number;
}

/** Field info extracted from rendered DOM */
export interface RenderedFieldInfo {
  fieldName: string;
  inputType: string;
  label?: string;
  required: boolean;
  sectionContext?: string;
}

/** Configuration for browser inspector */
export interface BrowserInspectorConfig {
  pegaEndpoint: string;
  username: string;
  password: string;
  headless?: boolean;
  chromePath?: string;
  timeout?: number;
}
