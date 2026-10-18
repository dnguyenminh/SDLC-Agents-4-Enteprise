/**
 * CellPropertyExtractor — orchestrates Cell Properties extraction (SA4E-95).
 * Extracted from the original PegaBrowserInspector monolith — same behavior.
 */

import type { CellPropertyBinding } from "./types";
import type { InspectorState, LogFn } from "./state";
import type { PegaRuleNavigator } from "./navigation";
import { ThCellCapture } from "./cell-th";
import { FieldCellCapture } from "./cell-field";

/**
 * Extracts cell property bindings from the design canvas
 * (TH column headers + individual field cells).
 */
export class CellPropertyExtractor {
  private readonly thCapture: ThCellCapture;
  private readonly fieldCapture: FieldCellCapture;

  constructor(
    private readonly state: InspectorState,
    private readonly log: LogFn,
    private readonly navigator: PegaRuleNavigator,
  ) {
    this.thCapture = new ThCellCapture(state, navigator);
    this.fieldCapture = new FieldCellCapture(state, log, navigator);
  }

  /**
   * Extract cell property bindings by dblclick-ing each TH in design canvas.
   * Requires: rule already opened (call inspectHarness first).
   * Triggers pzPropertyPanel activity → captures HTML → parses "Label for" binding.
   */
  public async extractCellProperties(): Promise<CellPropertyBinding[]> {
    if (!this.state.page) throw new Error("Browser not launched.");
    const designFrame = this.navigator.findActiveDesignFrame();
    if (!designFrame) {
      this.log("[BrowserInspector] ⚠️ No sectionDisplayIFRAME for cell properties.");
      return [];
    }

    const bindings: CellPropertyBinding[] = [];
    await this.extractFromThColumns(designFrame, bindings);
    await this.extractFromFieldCells(designFrame, bindings);

    if (bindings.length === 0) {
      this.log("[BrowserInspector] No cell/field bindings found.");
    } else {
      this.log(`[BrowserInspector] ✅ Extracted ${bindings.length} total bindings.`);
    }
    return bindings;
  }

  /** Pattern 1: TH elements (table column headers). */
  private async extractFromThColumns(designFrame: any, bindings: CellPropertyBinding[]): Promise<void> {
    // Pattern 1: TH elements (table column headers)
    const thElements = await designFrame.evaluate(() =>
      Array.from(document.querySelectorAll("th"))
        .map((th, i) => ({ index: i, text: th.textContent?.trim() || "" }))
        .filter((th) => th.text.length > 0),
    );
    if (thElements.length > 0) {
      this.log(`[BrowserInspector] Extracting from ${thElements.length} TH columns...`);
      await this.captureThBindings(designFrame, thElements, bindings);
    }
  }

  /** Dblclick each TH and capture its binding. */
  private async captureThBindings(
    designFrame: any, thElements: Array<{ index: number; text: string }>, bindings: CellPropertyBinding[],
  ): Promise<void> {
    for (const th of thElements) {
      try {
        const binding = await this.thCapture.dblclickAndCapture(designFrame, th.index, th.text);
        if (binding) {
          bindings.push(binding);
          this.log(`[BrowserInspector]   ✓ "${th.text}" → labelFor="${binding.labelFor}"`);
        }
      } catch (err: any) {
        this.log(`[BrowserInspector]   ⚠️ "${th.text}": ${err.message}`);
      }
    }
  }

  /** Pattern 2: content-item content-field divs (individual field cells). */
  private async extractFromFieldCells(designFrame: any, bindings: CellPropertyBinding[]): Promise<void> {
    // Pattern 2: content-item content-field divs (individual field cells)
    const fieldCells = await designFrame.evaluate(() =>
      Array.from(document.querySelectorAll(".content-item.content-field"))
        .map((el, i) => {
          const label = el.querySelector(".field-caption, label")?.textContent?.trim() || "";
          return { index: i, label: label.replace(/\u00a0/g, "").trim() };
        })
        .filter((f) => f.label.length > 0 && f.label !== "(Drop to append to this layout)"),
    );
    if (fieldCells.length > 0) {
      this.log(`[BrowserInspector] Extracting from ${fieldCells.length} field cells...`);
      await this.captureFieldCellBindings(designFrame, fieldCells, bindings);
    }
  }

  /** Click each field cell and capture its binding. */
  private async captureFieldCellBindings(
    designFrame: any, fieldCells: Array<{ index: number; label: string }>, bindings: CellPropertyBinding[],
  ): Promise<void> {
    for (const cell of fieldCells) {
      try {
        const binding = await this.fieldCapture.dblclickFieldCell(designFrame, cell.index, cell.label);
        if (binding) {
          bindings.push(binding);
          this.log(`[BrowserInspector]   ✓ "${cell.label}" → labelFor="${binding.labelFor}"`);
        }
      } catch (err: any) {
        this.log(`[BrowserInspector]   ⚠️ field "${cell.label}": ${err.message}`);
      }
    }
  }
}
