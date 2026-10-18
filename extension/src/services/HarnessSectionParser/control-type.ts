/**
 * Pega control type mapping helpers (SA4E-93, SA4E-95).
 * Maps raw Pega harness property indicators to our PegaControlType enum.
 */

import type { PegaControlType } from "../../models";

/** Known Pega control type identifiers mapped to our enum */
export const CONTROL_TYPE_MAP: Record<string, PegaControlType> = {
  pxTextInput: "TextInput",
  pxTextArea: "TextArea",
  pxNumber: "NumberInput",
  pxCheckbox: "Checkbox",
  pxDropdown: "Dropdown",
  pxRadioButtons: "RadioButtons",
  pxDateTime: "DatePicker",
  pxAutoComplete: "Autocomplete",
  pxLink: "Link",
  pxInteger: "Integer",
  pxHidden: "Hidden",
  pxRepeatingDynamicLayout: "PageList",
  pxRepeatingGrid: "PageList",
  pxPageGroup: "PageGroup",
};

/** Infer PegaControlType from raw property indicators */
export function inferControlType(props: Record<string, unknown>): PegaControlType {
  const rawType = (props.pyControlType as string)
    || (props.pyTemplateType as string)
    || "";
  // Direct match by pyControlType value
  for (const [key, value] of Object.entries(CONTROL_TYPE_MAP)) {
    if (rawType === key || rawType === value) { return value; }
  }
  // Heuristic: check property mode indicators
  if (props.pyPropertyMode === "PageList") { return "PageList"; }
  if (props.pyPropertyMode === "PageGroup") { return "PageGroup"; }
  return "Unknown";
}

/** SA4E-95: Map pyFormat to PegaControlType */
export function mapPyFormatToControlType(pyFormat: string): PegaControlType {
  return CONTROL_TYPE_MAP[pyFormat] || "Unknown";
}

/** SA4E-95: Map pyType string to PegaControlType */
export function inferControlTypeFromPyType(pyType: string): PegaControlType {
  switch (pyType.toUpperCase()) {
    case "FIELD": return "TextInput";
    case "CHECKBOX": return "Checkbox";
    case "DROPDOWN": return "Dropdown";
    case "RADIOBUTTON": case "RADIO": return "RadioButtons";
    case "TEXTAREA": return "TextArea";
    case "DATETIME": case "DATE": return "DatePicker";
    case "LINK": return "Link";
    default: return "Unknown";
  }
}
