/**
 * PegaBrowserInspector — thin facade (BR-18 refactor of the SA4E-95 monolith).
 * CDP-based browser automation for Pega DOM inspection: launches Chrome headless,
 * logs into Pega, navigates to RuleForm harnesses, and extracts rendered sections
 * + field bindings from the live DOM. Implementation lives in ./PegaBrowserInspector/.
 * Public symbols are re-exported unchanged — existing importers need no edits.
 */

export { PegaBrowserInspector } from "./PegaBrowserInspector/inspector";
export type {
  BrowserInspectionResult,
  BrowserInspectorConfig,
  CellPropertyBinding,
  LayoutPropertyInfo,
  RenderedFieldInfo,
} from "./PegaBrowserInspector/types";
