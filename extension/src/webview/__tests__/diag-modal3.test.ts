/**
 * Diagnostic 3: inspect the ACTUAL initFormElements function body at runtime.
 */
import { describe, it, expect } from "vitest";
import { getModalHtml } from "../edit-provider-template.js";
import * as formModule from "../edit-provider-form.js";

describe("diag3: inspect initFormElements", () => {
  it("prints function source and queries", () => {
    const modalEl = document.createElement("div");
    modalEl.className = "modal-overlay hidden";
    modalEl.innerHTML = getModalHtml();

    // Direct query
    const direct = modalEl.querySelector("#modal-provider-select");
    console.log("direct query:", direct ? "FOUND" : "NULL");

    // Actual function body
    const fn = (formModule as any).initFormElements;
    console.log("fn name:", fn?.name);
    console.log("fn source:", fn?.toString()?.slice(0, 400));

    // Call it
    const el = fn(modalEl);
    console.log("el.providerSelect:", el?.providerSelect ? "FOUND" : "NULL");

    // Does template have TWO selects? Print all select IDs
    const selects = modalEl.querySelectorAll("select");
    console.log("select count:", selects.length);
    selects.forEach((s, i) => console.log(`select[${i}] id="${s.id}"`));

    expect(true).toBe(true);
  });
});
