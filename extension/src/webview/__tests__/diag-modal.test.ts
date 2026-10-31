/**
 * Diagnostic: verify getModalHtml() parses correctly in jsdom.
 */
import { describe, it, expect } from "vitest";
import { getModalHtml } from "../edit-provider-template.js";

describe("diag: getModalHtml parsing", () => {
  it("parses and finds all form elements", () => {
    const div = document.createElement("div");
    div.innerHTML = getModalHtml();
    const ids = [
      "modal-provider-select",
      "modal-api-key",
      "edit-provider-form",
      "modal-use-default-url",
      "modal-base-url",
      "modal-model",
      "modal-test-btn",
      "modal-cancel-btn",
      "modal-save-btn",
    ];
    const classes = ["toggle-visibility", "modal-close"];
    const results: Record<string, boolean> = {};
    for (const id of ids) {
      results[id] = div.querySelector(`#${id}`) !== null;
    }
    for (const cls of classes) {
      results[cls] = div.querySelector(`.${cls}`) !== null;
    }
    console.log("RESULTS:", JSON.stringify(results, null, 2));
    console.log("children:", div.children.length, div.children[0]?.tagName);
    expect(results["modal-provider-select"]).toBe(true);
  });
});
