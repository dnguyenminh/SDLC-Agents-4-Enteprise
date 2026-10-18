/**
 * LayoutPropertyExtractor — gear-icon Layout Properties extraction (SA4E-95).
 * Extracted from the original PegaBrowserInspector monolith — same behavior.
 */

import { type HTTPResponse } from "puppeteer-core";
import type { LayoutPropertyInfo } from "./types";
import type { InspectorState, LogFn } from "./state";
import { waitForPopupCapture } from "./waits";
import { parseLayoutHTML } from "./layout-parsers";
import type { PegaRuleNavigator } from "./navigation";

/** A <legend> element describing a table layout in the design canvas. */
interface LegendInfo {
  index: number;
  label: string;
  hasGear: boolean;
  isTable: boolean;
}

/**
 * Extracts Layout/Table properties from the design canvas via gear icons.
 */
export class LayoutPropertyExtractor {
  constructor(
    private readonly state: InspectorState,
    private readonly log: LogFn,
    private readonly navigator: PegaRuleNavigator,
  ) {}

  /**
   * Extract Layout Properties by clicking gear icon on each table in design canvas.
   * Gear icon = SPAN with onclick="oVManager.POPUPLEGENDCLICK(event)".
   */
  public async extractLayoutProperties(): Promise<LayoutPropertyInfo[]> {
    if (!this.state.page) throw new Error("Browser not launched.");
    const designFrame = this.navigator.findActiveDesignFrame();
    if (!designFrame) {
      this.log("[BrowserInspector] ⚠️ No sectionDisplayIFRAME for layout properties.");
      return [];
    }

    const legends = await collectTableLegends(designFrame);
    if (legends.length === 0) {
      this.log("[BrowserInspector] No table layouts with gear icons.");
      return [];
    }

    this.log(`[BrowserInspector] Extracting layout properties from ${legends.length} tables...`);
    const results: LayoutPropertyInfo[] = [];
    await this.captureLegends(designFrame, legends, results);
    this.log(`[BrowserInspector] ✅ Extracted ${results.length} layout properties.`);
    return results;
  }

  /** Click gear icon on each legend and capture its Layout Properties. */
  private async captureLegends(
    designFrame: any, legends: LegendInfo[], results: LayoutPropertyInfo[],
  ): Promise<void> {
    for (const legend of legends) {
      try {
        const info = await this.clickGearAndCapture(designFrame, legend.index, legend.label);
        if (info) {
          results.push(info);
          this.log(`[BrowserInspector]   ✓ "${legend.label}" → list="${info.listGroup}" flow="${info.detailFlowAction}"`);
        }
      } catch (err: any) {
        this.log(`[BrowserInspector]   ⚠️ "${legend.label}": ${err.message}`);
      }
    }
  }

  /** Click gear icon on legend and capture Layout Properties popup. */
  private async clickGearAndCapture(
    designFrame: any, legendIndex: number, label: string,
  ): Promise<LayoutPropertyInfo | null> {
    const page = this.state.page;
    if (!page) return null;
    const captured: { html: string } = { html: "" };
    const handler = this.makeCaptureHandler(captured);
    page.on("response", handler);
    // Step 1: Click legend to select it (make it active/focused)
    await this.selectLegend(designFrame, legendIndex);
    // Step 2: Trigger POPUPLEGENDCLICK — dispatch real click event ON the gear element
    await this.triggerGearClick(designFrame, legendIndex);
    await waitForPopupCapture(page, handler, captured);
    if (!captured.html) return null;

    const info = parseLayoutHTML(captured.html, label, this.log);
    await this.navigator.closeCellPopup(designFrame);
    return info;
  }

  /** Build a response listener capturing the Layout Properties popup HTML. */
  private makeCaptureHandler(captured: { html: string }): (resp: HTTPResponse) => Promise<void> {
    return async (resp: HTTPResponse) => {
      try {
        const body = await resp.text();
        if (body.length > 3000 && (body.includes("Layout Properties") || body.includes("Data source") || body.includes("Row operations"))) {
          captured.html = body;
        }
      } catch (err) { console.debug('[PegaBrowserInspector] Operation failed (non-fatal):', (err as Error).message); }
    };
  }

  /** Click legend to select it (make it active/focused). */
  private async selectLegend(designFrame: any, legendIndex: number): Promise<void> {
    await designFrame.evaluate((idx: number) => {
      const legends = document.querySelectorAll("legend");
      const legend = legends[idx];
      if (!legend) return;
      legend.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      legend.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      legend.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }, legendIndex);
    await new Promise((r) => setTimeout(r, 1000));
  }

  /** Trigger POPUPLEGENDCLICK — dispatch real click event ON the gear element. */
  private async triggerGearClick(designFrame: any, legendIndex: number): Promise<void> {
    // This makes browser set event.target = gear (which POPUPLEGENDCLICK needs for .parentNode)
    const debugResult = await designFrame.evaluate((idx: number) => {
      const legends = document.querySelectorAll("legend");
      const legend = legends[idx];
      if (!legend) return "legend not found";

      const gear = legend.querySelector("[onclick*='POPUPLEGENDCLICK']") as HTMLElement;
      if (!gear) return "gear SPAN not found";

      // Force display so click event dispatches properly
      gear.style.display = "inline";
      gear.style.width = "16px";
      gear.style.height = "16px";
      gear.style.visibility = "visible";

      // Dispatch real click — browser sets event.target = gear
      gear.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));

      return `dispatched click on gear=${gear.tagName}#${gear.id}`;
    }, legendIndex);

    this.log(`[BrowserInspector]   DEBUG gear: ${debugResult}`);
  }
}

/** Collect table legends that have a gear icon (POPUPLEGENDCLICK). */
async function collectTableLegends(designFrame: any): Promise<LegendInfo[]> {
  return designFrame.evaluate(() => {
    return Array.from(document.querySelectorAll("legend"))
      .map((leg, i) => {
        const caption = leg.querySelector("[id*='fieldSetCaption']");
        const num = leg.querySelector("[id*='fieldSetNum']");
        const text = (caption?.textContent?.trim() || "") + (num?.textContent?.trim() || "");
        const gearSpan = leg.querySelector("[onclick*='POPUPLEGENDCLICK']");
        return { index: i, label: text.trim(), hasGear: !!gearSpan, isTable: text.includes("Table") };
      })
      .filter((l) => l.hasGear && l.isTable);
  });
}
