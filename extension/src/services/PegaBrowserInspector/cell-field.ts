/**
 * FieldCellCapture — field-cell capture of DV Property Panel popups (SA4E-95).
 * Extracted from the original PegaBrowserInspector monolith — same behavior.
 */

import { type HTTPResponse, type Page } from "puppeteer-core";
import type { CellPropertyBinding } from "./types";
import type { InspectorState, LogFn } from "./state";
import { waitForPopupCapture } from "./waits";
import { parseFieldCellHTML } from "./cell-parsers";
import type { PegaRuleNavigator } from "./navigation";

/**
 * Captures DV Property Panel HTML by single-clicking field cells and opening
 * the gear icon popup; falls back to reading the popup DOM directly.
 */
export class FieldCellCapture {
  constructor(
    private readonly state: InspectorState,
    private readonly log: LogFn,
    private readonly navigator: PegaRuleNavigator,
  ) {}

  /** Click field cell to select, then click gear icon to open properties popup. */
  public async dblclickFieldCell(
    designFrame: any, cellIndex: number, label: string,
  ): Promise<CellPropertyBinding | null> {
    const page = this.state.page;
    if (!page) return null;
    const captured: { html: string } = { html: "" };
    await this.openAndCapture(page, designFrame, cellIndex, captured);

    if (!captured.html) {
      return this.fieldBindingFromDom(page, designFrame, label, cellIndex);
    }

    // Debug: dump first successful capture to file for analysis
    await this.dumpCapturedHtmlOnce(captured.html);

    const binding = parseFieldCellHTML(captured.html, label, this.log);
    await this.navigator.closeCellPopup(designFrame);
    return binding;
  }

  /** Attach the capture listener, click the cell + gear, and wait for the popup HTML. */
  private async openAndCapture(
    page: Page, designFrame: any, cellIndex: number, captured: { html: string },
  ): Promise<void> {
    const handler = this.makeCaptureHandler(captured);
    page.on("response", handler);
    await this.selectFieldCell(designFrame, cellIndex);
    await waitForPopupCapture(page, handler, captured);
  }

  /** Steps 1+2: single-click the field cell to select it, then click its gear icon. */
  private async selectFieldCell(designFrame: any, cellIndex: number): Promise<void> {
    // Step 1: Single click field cell to SELECT it (gear icon appears)
    await designFrame.evaluate((idx: number) => {
      const cells = document.querySelectorAll(".content-item.content-field");
      const cell = cells[idx] as HTMLElement;
      if (!cell) return;
      const rect = cell.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
      cell.dispatchEvent(new MouseEvent("mousedown", opts));
      cell.dispatchEvent(new MouseEvent("mouseup", opts));
      cell.dispatchEvent(new MouseEvent("click", opts));
    }, cellIndex);

    await new Promise((r) => setTimeout(r, 1000));

    // Step 2: Click gear icon (DVOpenPropPanel > openPropPanelSPAN)
    await designFrame.evaluate(() => {
      const gear = document.querySelector("#DVOpenPropPanel #openPropPanelSPAN") as HTMLElement;
      if (gear) {
        gear.style.display = "inline";
        gear.style.visibility = "visible";
        gear.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      }
    });
  }

  /** Build a response listener capturing the DV Property Panel popup HTML. */
  private makeCaptureHandler(captured: { html: string }): (resp: HTTPResponse) => Promise<void> {
    return async (resp: HTTPResponse) => {
      const url = resp.url();
      const ct = resp.headers()["content-type"] || "";
      if ((ct.includes("text/html") || url.includes("pzTransactionId"))
          && !url.match(/\.(js|css|png|gif|svg)$/)) {
        try {
          const body = await resp.text();
          if (body.length > 3000 && (body.includes("Cell Properties") || body.includes("Property") || body.includes("template-root-marker"))) {
            captured.html = body;
          }
        } catch (err) { console.debug('[PegaBrowserInspector] Operation failed (non-fatal):', (err as Error).message); }
      }
    };
  }

  /** Fallback: read popup DOM directly (Pega may render without AJAX for subsequent fields). */
  private async fieldBindingFromDom(
    page: Page, designFrame: any, label: string, cellIndex: number,
  ): Promise<CellPropertyBinding | null> {
    const domPropValue = await this.readFieldPropertyFromDOM(page, designFrame);
    if (domPropValue) {
      this.log(`[BrowserInspector] parseFieldCell "${label}" → property="${domPropValue}" (DOM)`);
      await this.navigator.closeCellPopup(designFrame);
      return this.domBinding(label, domPropValue);
    }
    if (cellIndex <= 1) {
      this.log(`[BrowserInspector] FIELD CELL: No response/DOM for "${label}"`);
    }
    return null;
  }

  /** Build a binding when only the property ref is known (DOM fallback path). */
  private domBinding(label: string, labelFor: string): CellPropertyBinding {
    return {
      headerText: label,
      labelFor,
      cellText: label,
      visibility: "Always",
      baseRef: "",
      gridRDName: "",
      gridRDClass: "",
    };
  }

  /** Debug: dump the first successful capture to file for analysis. */
  private async dumpCapturedHtmlOnce(capturedHTML: string): Promise<void> {
    if (this.state.fieldCellDumped) return;
    this.state.fieldCellDumped = true;
    this.log(`[BrowserInspector] FIELD POPUP HTML size=${capturedHTML.length}:`);
    try {
      const fs = await import("fs");
      const path = await import("path");
      const dumpPath = path.join(process.cwd(), "extension", "src", "dumps", "_field-cell-popup.html");
      fs.writeFileSync(dumpPath, capturedHTML, "utf-8");
      this.log(`[BrowserInspector] Dumped field popup to: ${dumpPath}`);
    } catch (e: any) {
      this.log(`[BrowserInspector] Dump failed: ${e.message}`);
    }
  }

  /**
   * Read property value directly from the DV Property Panel popup DOM.
   * Pega renders subsequent field popups via DOM manipulation (no AJAX).
   * The popup contains an input with ID="pyValue" showing the property reference.
   */
  private async readFieldPropertyFromDOM(page: Page, designFrame: any): Promise<string | null> {
    // The popup may render in the PegaGadget frame or the design frame
    const frames = [
      designFrame,
      ...page.frames().filter((f) => f.name().startsWith("PegaGadget")),
      page.mainFrame(),
    ];

    for (const frame of frames) {
      try {
        const propValue = await frame.evaluate(() => {
          // Pattern 1: Input with ID="pyValue" (exact match from captured HTML)
          const pyValueInput = document.querySelector<HTMLInputElement>(
            'input[id="pyValue"], input[ID="pyValue"]',
          );
          if (pyValueInput?.value) return pyValueInput.value;

          // Pattern 2: Input with name ending in $ppyValue
          const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[name*='ppyValue']"));
          for (const inp of inputs) {
            if (inp.value && inp.value.startsWith(".")) return inp.value;
          }

          // Pattern 3: Input with ISNS_CLASS="Rule-Obj-Property" and non-empty value
          const smartInputs = Array.from(document.querySelectorAll<HTMLInputElement>(
            'input[ISNS_CLASS="Rule-Obj-Property"]',
          ));
          for (const inp of smartInputs) {
            if (inp.value && inp.value.startsWith(".")) return inp.value;
          }

          return null;
        });

        if (propValue) {
          // Remove leading dot
          return propValue.startsWith(".") ? propValue.substring(1) : propValue;
        }
      } catch (err) {
        // Frame may be detached — try next
      }
    }

    return null;
  }
}
