/**
 * Diagnostic 2c: dump innerHTML details around provider-select.
 */
import { describe, it, expect } from "vitest";
import { writeFileSync } from "fs";
import { getModalHtml } from "../edit-provider-template.js";
import { initFormElements } from "../edit-provider-form.js";

describe("diag2c", () => {
  it("dumps innerHTML details", () => {
    const lines: string[] = [];

    document.body.innerHTML = `
      <div class="modal-overlay hidden">
        <div class="modal-dialog">STALE <select id="modal-provider-select"></select></div>
      </div>
    `;

    const modalEl = document.createElement("div");
    modalEl.className = "modal-overlay hidden";
    modalEl.innerHTML = getModalHtml();
    document.body.appendChild(modalEl);

    const html = modalEl.innerHTML;
    // find ALL occurrences of provider-select
    let idx = -1;
    let occurrence = 0;
    while ((idx = html.indexOf("provider-select", idx + 1)) !== -1) {
      occurrence++;
      lines.push(`occurrence ${occurrence} @${idx}: ...${html.slice(Math.max(0, idx - 60), idx + 40).replace(/\n/g, "\\n")}...`);
    }
    lines.push(`total occurrences: ${occurrence}`);

    // all select tags with ids
    const selects = modalEl.querySelectorAll("select");
    lines.push(`select tags: ${selects.length}`);
    selects.forEach((s, i) => {
      lines.push(`select[${i}]: outerStart="${s.outerHTML.slice(0, 80)}"`);
      lines.push(`  hasAttribute id: ${s.hasAttribute("id")}, id="${s.getAttribute("id")}", idLength=${s.id?.length}`);
      // char codes of id
      const codes = Array.from(s.id || "").map((c) => c.charCodeAt(0).toString(16)).join(",");
      lines.push(`  id char codes: ${codes}`);
    });

    // form element children
    const form = modalEl.querySelector("#edit-provider-form");
    lines.push(`form children: ${form?.children.length}`);
    if (form) {
      Array.from(form.querySelectorAll("select")).forEach((s, i) => {
        lines.push(`form select[${i}]: id="${s.getAttribute("id")}"`);
      });
    }

    writeFileSync("diag2c-results.txt", lines.join("\n"), "utf8");
    expect(true).toBe(true);
  });
});
