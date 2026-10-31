/**
 * Diagnostic: replicate EXACT EditProviderModal.createModal flow.
 */
import { describe, it, expect } from "vitest";
import { getModalHtml } from "../edit-provider-template.js";
import { initFormElements } from "../edit-provider-form.js";

describe("diag: replicate createModal flow", () => {
  it("initFormElements finds providerSelect", () => {
    // Step 1: simulate test fixture polluting document.body
    document.body.innerHTML = `
      <div class="modal-overlay hidden"><div class="modal-dialog">STALE FIXTURE <select id="modal-provider-select"></select></div></div>
    `;

    // Step 2: replicate createModal
    const modalEl = document.createElement("div");
    modalEl.className = "modal-overlay hidden";
    modalEl.innerHTML = getModalHtml();
    document.body.appendChild(modalEl);

    // Step 3: run initFormElements
    const el = initFormElements(modalEl);
    console.log("providerSelect:", el.providerSelect ? "OK" : "NULL");
    console.log("form:", el.form ? "OK" : "NULL");
    console.log("apiKeyInput:", el.apiKeyInput ? "OK" : "NULL");
    console.log("toggleVisibilityBtn:", el.toggleVisibilityBtn ? "OK" : "NULL");
    console.log("closeBtn:", el.closeBtn ? "OK" : "NULL");
    console.log("testBtn:", el.testBtn ? "OK" : "NULL");
    console.log("cancelBtn:", el.cancelBtn ? "OK" : "NULL");
    console.log("saveBtn:", el.saveBtn ? "OK" : "NULL");

    // how many overlays exist?
    console.log("overlay count:", document.querySelectorAll(".modal-overlay").length);
    console.log("provider-select count in doc:", document.querySelectorAll("#modal-provider-select").length);
    console.log("provider-select count in modalEl:", modalEl.querySelectorAll("#modal-provider-select").length);

    expect(el.providerSelect).not.toBeNull();
  });
});
