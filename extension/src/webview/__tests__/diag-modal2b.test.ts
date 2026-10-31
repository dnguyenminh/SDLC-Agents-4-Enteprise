/**
 * Diagnostic 2b: replicate diag2 EXACTLY (fixture pollution) with file output.
 */
import { describe, it, expect } from "vitest";
import { writeFileSync } from "fs";
import { getModalHtml } from "../edit-provider-template.js";
import { initFormElements } from "../edit-provider-form.js";

describe("diag2b", () => {
  it("fixture pollution check", () => {
    const lines: string[] = [];

    // Step 1: fixture pollution (same as real test beforeEach)
    document.body.innerHTML = `
      <div class="modal-overlay hidden">
        <div class="modal-dialog">STALE <select id="modal-provider-select"></select></div>
      </div>
    `;

    // Step 2: createModal flow
    const modalEl = document.createElement("div");
    modalEl.className = "modal-overlay hidden";
    modalEl.innerHTML = getModalHtml();
    document.body.appendChild(modalEl);

    // Step 3: inspect
    const direct = modalEl.querySelector("#modal-provider-select");
    lines.push(`direct query on modalEl: ${direct ? "FOUND" : "NULL"}`);
    lines.push(`modalEl.innerHTML length: ${modalEl.innerHTML.length}`);
    lines.push(`modalEl contains select: ${modalEl.innerHTML.includes("modal-provider-select")}`);

    const el = initFormElements(modalEl);
    lines.push(`el.providerSelect: ${el?.providerSelect ? "FOUND" : "NULL"}`);
    lines.push(`el.form: ${el?.form ? "FOUND" : "NULL"}`);
    lines.push(`el.apiKeyInput: ${el?.apiKeyInput ? "FOUND" : "NULL"}`);

    writeFileSync("diag2b-results.txt", lines.join("\n"), "utf8");
    expect(true).toBe(true);
  });
});
