/**
 * ThCellCapture — TH-column dblclick capture of Cell Properties popups (SA4E-95).
 * Extracted from the original PegaBrowserInspector monolith — same behavior.
 */

import { type HTTPResponse } from "puppeteer-core";
import type { CellPropertyBinding } from "./types";
import type { InspectorState } from "./state";
import { waitForPopupCapture } from "./waits";
import { parseCellHTML } from "./cell-parsers";
import type { PegaRuleNavigator } from "./navigation";

/**
 * Captures Cell Properties HTML by dblclicking TH column headers.
 */
export class ThCellCapture {
  constructor(
    private readonly state: InspectorState,
    private readonly navigator: PegaRuleNavigator,
  ) {}

  /** Dblclick TH, intercept pzPropertyPanel HTML, parse bindings, close popup. */
  public async dblclickAndCapture(
    designFrame: any, thIndex: number, headerText: string,
  ): Promise<CellPropertyBinding | null> {
    const page = this.state.page;
    if (!page) return null;
    const captured: { html: string } = { html: "" };
    const handler = this.makeCaptureHandler(captured);
    page.on("response", handler);
    await this.dispatchDblClick(designFrame, thIndex);
    await waitForPopupCapture(page, handler, captured);
    if (!captured.html) return null;

    const binding = parseCellHTML(captured.html, headerText);
    await this.navigator.closeCellPopup(designFrame);
    return binding;
  }

  /** Build a response listener capturing the Cell Properties popup HTML. */
  private makeCaptureHandler(captured: { html: string }): (resp: HTTPResponse) => Promise<void> {
    return async (resp: HTTPResponse) => {
      const url = resp.url();
      const ct = resp.headers()["content-type"] || "";
      if ((ct.includes("text/html") || url.includes("pzTransactionId"))
          && !url.match(/\.(js|css|png|gif|svg)$/)) {
        try {
          const body = await resp.text();
          if (body.length > 5000 && body.includes("Cell Properties")) {
            captured.html = body;
          }
        } catch (err) { console.debug('[PegaBrowserInspector] stream consumed :', (err as Error).message); }
      }
    };
  }

  /** Dispatch full dblclick sequence on the TH at thIndex. */
  private async dispatchDblClick(designFrame: any, thIndex: number): Promise<void> {
    // Dispatch full dblclick sequence
    await designFrame.evaluate((idx: number) => {
      const th = document.querySelectorAll("th")[idx];
      if (!th) return;
      const rect = th.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
      th.dispatchEvent(new MouseEvent("mousedown", opts));
      th.dispatchEvent(new MouseEvent("mouseup", opts));
      th.dispatchEvent(new MouseEvent("click", opts));
      th.dispatchEvent(new MouseEvent("mousedown", opts));
      th.dispatchEvent(new MouseEvent("mouseup", opts));
      th.dispatchEvent(new MouseEvent("click", opts));
      th.dispatchEvent(new MouseEvent("dblclick", opts));
    }, thIndex);
  }
}
