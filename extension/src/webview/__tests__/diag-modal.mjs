/**
 * Quick diagnostic: parse getModalHtml() in jsdom and check element availability.
 */
import { JSDOM } from "jsdom";
import { getModalHtml } from "../edit-provider-template.js";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
const document = dom.window.document;

const div = document.createElement("div");
div.innerHTML = getModalHtml();

const checks = {
  "modal-provider-select": div.querySelector("#modal-provider-select"),
  "modal-api-key": div.querySelector("#modal-api-key"),
  "edit-provider-form": div.querySelector("#edit-provider-form"),
  "modal-use-default-url": div.querySelector("#modal-use-default-url"),
  "modal-base-url": div.querySelector("#modal-base-url"),
  "modal-model": div.querySelector("#modal-model"),
  "modal-test-btn": div.querySelector("#modal-test-btn"),
  "modal-cancel-btn": div.querySelector("#modal-cancel-btn"),
  "modal-save-btn": div.querySelector("#modal-save-btn"),
  "toggle-visibility": div.querySelector(".toggle-visibility"),
  "modal-close": div.querySelector(".modal-close"),
  "api-key-group": div.querySelector("#api-key-group"),
};

for (const [name, el] of Object.entries(checks)) {
  console.log(`${name}: ${el ? "OK" : "NULL"}`);
}
console.log("top-level children:", div.children.length);
console.log("first child tag:", div.children[0]?.tagName);
