/**
 * DesignCanvasFieldExtractor — extracts rendered field bindings from the
 * sectionDisplayIFRAME design canvas (SA4E-95).
 * Extracted from the original PegaBrowserInspector monolith — same behavior.
 */

import type { RenderedFieldInfo } from "./types";

/**
 * Extracts field info from the design canvas frame via in-page evaluation.
 */
export class DesignCanvasFieldExtractor {
  /** Extract fields from sectionDisplayIFRAME design canvas. */
  public async extractFieldsFromDesignCanvas(frame: any): Promise<RenderedFieldInfo[]> {
    return frame.evaluate(() => {
      const fields: Array<{
        fieldName: string; inputType: string;
        label?: string; required: boolean; sectionContext?: string;
      }> = [];
      const seen = new Set<string>();

      // Pattern 1: "[.propertyName of Class ClassName]" — table/repeat bindings
      document.body.querySelectorAll("div, span, td, th, label").forEach((el) => {
        if (el.closest("script, style, noscript")) return;
        const text = el.textContent?.trim() || "";
        if (!text || text.length > 300) return;

        // Match: "Table [.propName of Class ClassName]"
        const tableMatches = text.matchAll(/\[\s*\.([a-zA-Z_]\w*)\s+of Class\s+([A-Za-z][A-Za-z0-9-]*)\s*\]/g);
        for (const m of tableMatches) {
          const fieldName = m[1];
          const itemClass = m[2];
          if (!seen.has(fieldName)) {
            seen.add(fieldName);
            fields.push({
              fieldName, inputType: "PageList",
              label: `Table of ${itemClass}`, required: false,
              sectionContext: el.closest("[node_name]")?.getAttribute("node_name") || undefined,
            });
          }
        }

        // Match: standalone ".pyXxx" or ".pzXxx" (Pega OOTB naming)
        const propMatches = text.matchAll(/(?<!\w)\.(py[a-zA-Z_]\w*|pz[a-zA-Z_]\w*|px[a-zA-Z_]\w*)/g);
        for (const m of propMatches) {
          const fieldName = m[1];
          if (!seen.has(fieldName)) {
            seen.add(fieldName);
            fields.push({
              fieldName, inputType: "text", required: false,
              sectionContext: el.closest("[node_name]")?.getAttribute("node_name") || undefined,
            });
          }
        }

        // Match: "[.propName]" bracket-enclosed simple ref
        const bracketMatches = text.matchAll(/\[\s*\.([a-zA-Z_]\w*)\s*\]/g);
        for (const m of bracketMatches) {
          if (!seen.has(m[1])) { seen.add(m[1]); fields.push({ fieldName: m[1], inputType: "text", required: false }); }
        }
      });

      // Pattern 2: data-label attributes (field property names in design view)
      document.querySelectorAll("[data-label]").forEach((el) => {
        const propName = el.getAttribute("data-label") || "";
        if (propName && !seen.has(propName) && /^[a-z]/.test(propName)) {
          seen.add(propName);
          const parent = el.closest(".content-item");
          const labelEl = parent?.querySelector(".field-caption, label");
          const label = labelEl?.textContent?.trim().replace(/\u00a0/g, "").trim() || undefined;
          fields.push({
            fieldName: propName, inputType: "text",
            label, required: false,
            sectionContext: el.closest("[node_name]")?.getAttribute("node_name") || undefined,
          });
        }
      });

      // Pattern 3: text content matching property name (pyXxx without dot)
      document.querySelectorAll(".field-item div, .field-item span").forEach((el) => {
        const text = el.textContent?.trim() || "";
        if (text && /^(py|pz|px)[A-Z][a-zA-Z_]*$/.test(text) && !seen.has(text)) {
          seen.add(text);
          const parent = el.closest(".content-item");
          const labelEl = parent?.querySelector(".field-caption, label");
          const label = labelEl?.textContent?.trim().replace(/\u00a0/g, "").trim() || undefined;
          fields.push({
            fieldName: text, inputType: "text",
            label, required: false,
            sectionContext: el.closest("[node_name]")?.getAttribute("node_name") || undefined,
          });
        }
      });

      // Pattern 4: data-ui-meta with explicit property refs
      document.querySelectorAll("[data-ui-meta]").forEach((el) => {
        if (el.closest("script")) return;
        const meta = el.getAttribute("data-ui-meta") || "";
        const propMatch = meta.match(/pyValue['":\s]+['".]([a-z][a-zA-Z_]\w*)/);
        if (propMatch && !seen.has(propMatch[1])) {
          seen.add(propMatch[1]); fields.push({ fieldName: propMatch[1], inputType: "text", required: false });
        }
        const repeatMatch = meta.match(/pyPageListProperty['":\s]+['".]?([a-z][a-zA-Z_]\w*)/);
        if (repeatMatch && !seen.has(repeatMatch[1])) {
          seen.add(repeatMatch[1]); fields.push({ fieldName: repeatMatch[1], inputType: "PageList", required: false });
        }
      });

      // Pattern 5: Section includes — dvinfo with pxObjClass=Rule-HTML-Section
      document.querySelectorAll("[dvinfo]").forEach((el) => {
        const dvinfo = el.getAttribute("dvinfo") || "";
        if (!dvinfo.includes("Rule-HTML-Section")) return;
        const ruleNameMatch = dvinfo.match(/pyRuleName=([^&"]+)/);
        if (ruleNameMatch && !seen.has(`__section__${ruleNameMatch[1]}`)) {
          seen.add(`__section__${ruleNameMatch[1]}`);
          fields.push({
            fieldName: ruleNameMatch[1],
            inputType: "SectionInclude",
            required: false,
            sectionContext: "embedded",
          });
        }
      });

      return fields;
    });
  }
}
