/**
 * PegaRuleNavigator — rule opening + iframe navigation helpers (SA4E-95).
 * Extracted from the original PegaBrowserInspector monolith — same behavior.
 */

import type { Frame, Page } from "puppeteer-core";
import type { InspectorState, LogFn } from "./state";
import { waitForPegaRender } from "./waits";

/**
 * Navigates Dev Studio rules and locates the rule/design-canvas iframes.
 */
export class PegaRuleNavigator {
  constructor(
    private readonly state: InspectorState,
    private readonly log: LogFn,
  ) {}

  /** Find the iframe containing the opened rule content. */
  public async findRuleFrame(pzInsKey: string): Promise<any | null> {
    const page = this.state.page;
    if (!page) return null;
    const insName = this.insNameFromKey(pzInsKey);

    const frames = page.frames();
    // Match iframe src containing insName
    const byUrl = this.findFrameByUrl(frames, insName);
    if (byUrl) return byUrl;
    // Fallback: newest PegaGadgetNIfr
    return this.findGadgetFrame(frames);
  }

  /** Match iframe src containing insName. */
  private findFrameByUrl(frames: Frame[], insName: string): Frame | null {
    for (const frame of frames) {
      const url = frame.url();
      if (url.includes(encodeURIComponent(insName)) || url.includes(insName)) {
        this.log(`[BrowserInspector] Found rule iframe: ${frame.name() || "unnamed"}`);
        return frame;
      }
    }
    return null;
  }

  /** Fallback: newest PegaGadgetNIfr. */
  private findGadgetFrame(frames: Frame[]): Frame | null {
    for (const frame of [...frames].reverse()) {
      const name = frame.name() || "";
      if (name.startsWith("PegaGadget") && name.endsWith("Ifr")) {
        this.log(`[BrowserInspector] Using gadget iframe: ${name}`);
        return frame;
      }
    }
    return null;
  }

  /** Extract "APPLIESTO!RULENAME" from a pzInsKey (skip class part + timestamp (#...)). */
  private insNameFromKey(pzInsKey: string): string {
    const parts = pzInsKey.split(" ");
    const tsIdx = parts.findIndex((p) => p.startsWith("#"));
    return (tsIdx > 1 ? parts.slice(1, tsIdx) : parts.slice(1)).join("!");
  }

  /**
   * Find the sectionDisplayIFRAME belonging to the LAST opened rule tab.
   * When multiple tabs are open (PegaGadget0Ifr, PegaGadget1Ifr, etc.),
   * returns the sectionDisplayIFRAME inside the newest/highest-numbered gadget.
   */
  public findActiveDesignFrame(): any | null {
    const page = this.state.page;
    if (!page) return null;
    const frames = page.frames();
    const designFrames = frames.filter((f) => f.name() === "sectionDisplayIFRAME");
    if (designFrames.length === 0) return null;
    if (designFrames.length === 1) return designFrames[0];
    return designFrames[designFrames.length - 1];
  }

  /**
   * Open a rule inside Dev Studio using Pega's internal JS API.
   * Uses pega.desktop.openRuleByClassAndName(insName, objClass, "", "").
   * insName format: "APPLIESTO RULENAME" (space-separated from pzInsKey parts).
   */
  public async openRuleInDevStudio(className: string, pzInsKey: string): Promise<void> {
    const page = this.state.page;
    if (!page) return;
    const insName = this.insNameFromKey(pzInsKey);
    // objClass for the rule type (e.g., "Rule-HTML-Harness")
    const ruleClass = pzInsKey.split(" ")[0].split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join("-");

    this.log(`[BrowserInspector] Opening: ruleClass=${ruleClass}, insName=${insName}`);
    await this.openRuleApi(page, ruleClass, insName);
    await new Promise((r) => setTimeout(r, 4000));
    await waitForPegaRender(page);
    // Wait for design canvas to fully load inside rule iframe
    await this.waitForIframeContentLoad();
    // Dismiss any error popup (e.g. "Unable to open instance")
    await this.dismissErrorPopup();
  }

  /** Open rule via Pega's internal JS API and log the outcome. */
  private async openRuleApi(page: Page, ruleClass: string, insName: string): Promise<void> {
    const opened = await page.evaluate((cls: string, name: string) => {
      try {
        if ((window as any).pega?.desktop?.openRuleByClassAndName) {
          (window as any).pega.desktop.openRuleByClassAndName(name, cls, "", "");
          return "openRuleByClassAndName";
        }
        if (typeof (window as any).openRuleByClassAndName === "function") {
          (window as any).openRuleByClassAndName(name, cls, "", "");
          return "global";
        }
        return null;
      } catch (e: any) { return `error:${e.message}`; }
    }, ruleClass, insName);

    this.log(`[BrowserInspector] openRule result: ${opened || "no API"}`);
  }

  /** Wait for iframe content to fully load by polling Pega's loading state. */
  private async waitForIframeContentLoad(): Promise<void> {
    const ruleFrame = await this.findRuleFrame("");
    if (!ruleFrame) return;
    // Poll until Pega finishes all AJAX loads inside iframe
    await (ruleFrame as any).evaluate(() => new Promise<boolean>((resolve) => {
      let attempts = 0;
      const maxAttempts = 30; // 30 * 500ms = 15s max
      const check = () => {
        attempts++;
        const pud = (window as any).pega?.u?.d;
        const isLoading = pud?.gIsLoading || pud?.processOnInitialloadsActive;
        // Check if design content has loaded (more than just SECTIONINCLUDE stubs)
        const designTab = document.querySelector('[node_name="pzDesignTabContent"]');
        const designContent = designTab?.querySelector('[node_name="pzDesignViewInclude"]');
        const hasContent = designContent && designContent.children.length > 2;
        if ((!isLoading && hasContent) || attempts >= maxAttempts) {
          resolve(true);
        } else {
          setTimeout(check, 500);
        }
      };
      setTimeout(check, 1000);
    }), { timeout: 30_000 }).catch(() => {});
  }

  /** Dismiss Pega error popup ("Unable to open instance" etc.) by clicking OK button. */
  private async dismissErrorPopup(): Promise<void> {
    const page = this.state.page;
    if (!page) return;
    try {
      const dismissed = await page.evaluate(() => {
        const okButtons = Array.from(document.querySelectorAll('button, input[type="button"]'));
        for (const btn of okButtons) {
          const text = (btn as HTMLElement).textContent?.trim() || (btn as HTMLInputElement).value || "";
          if (text === "OK" || text === "Ok") {
            (btn as HTMLElement).click();
            return "clicked-OK";
          }
        }
        return null;
      });
      if (dismissed) {
        this.log(`[BrowserInspector] Dismissed error popup: ${dismissed}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (err) { console.debug('[PegaBrowserInspector] ignore :', (err as Error).message); }
  }

  /** Close Cell Properties popup after extraction. */
  public async closeCellPopup(designFrame: any): Promise<void> {
    const page = this.state.page;
    if (!page) return;
    const gadgetFrame = page.frames().find((f) => f.name().startsWith("PegaGadget"));
    const closeFrame = gadgetFrame || designFrame;

    await closeFrame.evaluate(() => {
      const btn = document.querySelector<HTMLElement>(
        '[aria-label="Close modal"], #container_close, .Icon.container-close',
      );
      if (btn) { btn.click(); return; }
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }).catch(() => {});

    await new Promise((r) => setTimeout(r, 1500));
  }
}
