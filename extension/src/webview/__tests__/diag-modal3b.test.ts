/**
 * Diagnostic 3b: write results to file (vitest swallows console.log).
 */
import { describe, it, expect } from "vitest";
import { writeFileSync } from "fs";
import { getModalHtml } from "../edit-provider-template.js";
import * as formModule from "../edit-provider-form.js";

describe("diag3b", () => {
  it("writes findings to file", () => {
    const lines: string[] = [];
    const modalEl = document.createElement("div");
    modalEl.className = "modal-overlay hidden";
    modalEl.innerHTML = getModalHtml();

    const direct = modalEl.querySelector("#modal-provider-select");
    lines.push(`direct query: ${direct ? "FOUND" : "NULL"}`);

    const fn = (formModule as any).initFormElements;
    lines.push(`fn source: ${fn?.toString()?.slice(0, 500)}`);

    const el = fn(modalEl);
    lines.push(`el.providerSelect: ${el?.providerSelect ? "FOUND" : "NULL"}`);

    const selects = modalEl.querySelectorAll("select");
    lines.push(`select count: ${selects.length}`);
    selects.forEach((s, i) => lines.push(`select[${i}] id="${s.id}"`));

    // Also check template raw HTML for the select
    const html = getModalHtml();
    const idx = html.indexOf("modal-provider-select");
    lines.push(`template contains 'modal-provider-select' at index: ${idx}`);
    lines.push(`template snippet: ${idx >= 0 ? html.slice(idx - 40, idx + 60) : "N/A"}`);

    writeFileSync("diag3b-results.txt", lines.join("\n"), "utf8");
    expect(lines.length).toBeGreaterThan(0);
  });
});
