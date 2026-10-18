/**
 * Deep scan fallback for harness JSON (SA4E-95).
 * Walks all object/array values recursively to find controls using
 * multi-pattern extraction: pyValue, pyPageListProperty, pyGridProperty,
 * pyListSource, pyDataPage, pyReferencePath, pyFieldName on controls.
 */

import type { ControlDefinition } from "../../models";
import {
  inferControlTypeFromPyType,
  mapPyFormatToControlType,
} from "./control-type";

/**
 * Deep scan fallback: walk all object/array values recursively to find controls.
 * SA4E-95: Multi-pattern extraction — pyValue, pyPageListProperty, pyGridProperty,
 * pyListSource, pyDataPage, pyReferencePath, pyFieldName on controls.
 */
export function deepScanForControls(obj: Record<string, unknown>): ControlDefinition[] {
  const controls: ControlDefinition[] = [];
  const scan = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const item of node) scan(item); return; }
    const rec = node as Record<string, unknown>;

    // Pattern 1: pyValue starting with "." (direct field binding on editable controls)
    if (rec.pyValue && typeof rec.pyValue === "string" && (rec.pyValue as string).startsWith(".")) {
      const fieldName = (rec.pyValue as string).substring(1);
      if (fieldName) {
        const pyFormat = (rec.pyFormat as string) || "Default";
        const pyType = (rec.pyType as string) || "FIELD";
        const controlType = (rec.pxObjClass === "Embed-Display-Table-Cell")
          ? mapPyFormatToControlType(pyFormat)
          : inferControlTypeFromPyType(pyType);
        controls.push({
          fieldName,
          controlType,
          required: false,
          label: (rec.pyLabelPreview as string) || (rec.pyLabel as string) || undefined,
        });
      }
    }

    // Pattern 2: pyPageListProperty (REPEAT layout = PageList)
    if (rec.pyPageListProperty && typeof rec.pyPageListProperty === "string") {
      const propName = (rec.pyPageListProperty as string).replace(/^\./, "");
      const itemClass = (rec.pyPageListPropertyClass as string) || "";
      if (propName) {
        controls.push({
          fieldName: propName,
          controlType: "PageList",
          required: false,
          label: itemClass ? `Page list of ${itemClass}` : undefined,
        });
      }
    }

    // Pattern 3: pyGridProperty (Grid table page list binding)
    if (rec.pyGridProperty && typeof rec.pyGridProperty === "string") {
      const propName = (rec.pyGridProperty as string).replace(/^\./, "");
      if (propName) {
        const gridClass = (rec.pyGridClass as string) || "";
        controls.push({
          fieldName: propName,
          controlType: "PageList",
          required: false,
          label: gridClass ? `Grid of ${gridClass}` : undefined,
        });
      }
    }

    // Pattern 4: pyListSource (dropdown/autocomplete list source, dot-prefixed)
    if (rec.pyListSource && typeof rec.pyListSource === "string" && (rec.pyListSource as string).startsWith(".")) {
      const fieldName = (rec.pyListSource as string).substring(1);
      if (fieldName) {
        controls.push({
          fieldName,
          controlType: "PageList",
          required: false,
          label: (rec.pyLabel as string) || undefined,
        });
      }
    }

    // Pattern 5: pyDataPage (data page reference)
    if (rec.pyDataPage && typeof rec.pyDataPage === "string" && (rec.pyDataPage as string).trim()) {
      const pageName = (rec.pyDataPage as string).replace(/^\./, "");
      if (pageName) {
        controls.push({
          fieldName: pageName,
          controlType: "PageList",
          required: false,
          label: `Data page: ${pageName}`,
        });
      }
    }

    // Pattern 6: pyReferencePath (dot-prefixed path in advanced controls)
    if (rec.pyReferencePath && typeof rec.pyReferencePath === "string" && (rec.pyReferencePath as string).startsWith(".")) {
      const fieldName = (rec.pyReferencePath as string).substring(1);
      if (fieldName) {
        controls.push({ fieldName, controlType: "TextInput", required: false });
      }
    }

    // Pattern 7: pyFieldName on controls (without dot, must have control context)
    if (rec.pyFieldName && typeof rec.pyFieldName === "string" && !(rec.pyFieldName as string).startsWith(".")) {
      const isControl = rec.pyType || rec.pyControlType || rec.pyTemplateType || rec.pyFormat;
      if (isControl) {
        controls.push({
          fieldName: rec.pyFieldName as string,
          controlType: inferControlTypeFromPyType((rec.pyType as string) || "FIELD"),
          required: rec.pyMandatory === true || rec.pyMandatory === "true",
          label: (rec.pyLabel as string) || undefined,
        });
      }
    }

    // Recurse into all values
    for (const val of Object.values(rec)) { scan(val); }
  };
  scan(obj);
  return controls;
}
