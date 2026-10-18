/**
 * PegaBrowserInspector implementation — orchestrates the collaborator modules:
 * login, navigation, field/cell/layout extraction, rule resolution (SA4E-95).
 * CDP-based browser automation for Pega DOM inspection. The public API is
 * re-exported unchanged by ../PegaBrowserInspector.ts.
 */

import type { Page } from "puppeteer-core";
import * as fs from "fs";
import { extractSectionsFromDOM } from "../PegaDomExtractor";
import type {
  BrowserInspectionResult, BrowserInspectorConfig, CellPropertyBinding,
  LayoutPropertyInfo, RenderedFieldInfo,
} from "./types";
import { createInspectorState, type InspectorState, type LogFn } from "./state";
import { launchBrowser } from "./launcher";
import { waitForPegaRender } from "./waits";
import { PegaLoginFlow } from "./login";
import { PegaRuleNavigator } from "./navigation";
import { DesignCanvasFieldExtractor } from "./field-extraction";
import { CellPropertyExtractor } from "./cell-properties";
import { LayoutPropertyExtractor } from "./layout-properties";
import { resolveRule } from "./rule-resolution";

/**
 * Manages Chrome browser lifecycle and Pega DOM inspection.
 * Usage: create → launch → login → inspectHarness(es) → close.
 */
export class PegaBrowserInspector {
  private readonly state: InspectorState;
  private readonly loginFlow: PegaLoginFlow;
  private readonly navigator: PegaRuleNavigator;
  private readonly fieldExtractor: DesignCanvasFieldExtractor;
  private readonly cellExtractor: CellPropertyExtractor;
  private readonly layoutExtractor: LayoutPropertyExtractor;

  constructor(
    private readonly config: BrowserInspectorConfig,
    private readonly log: LogFn,
  ) {
    this.state = createInspectorState();
    this.loginFlow = new PegaLoginFlow(this.state, config, log);
    this.navigator = new PegaRuleNavigator(this.state, log);
    this.fieldExtractor = new DesignCanvasFieldExtractor();
    this.cellExtractor = new CellPropertyExtractor(this.state, log, this.navigator);
    this.layoutExtractor = new LayoutPropertyExtractor(this.state, log, this.navigator);
  }

  /** Launch Chrome with CDP and establish connection. */
  public async launch(): Promise<void> {
    const launched = await launchBrowser(this.config, this.log);
    this.state.browser = launched.browser;
    this.state.page = launched.page;
    this.state.userDataDir = launched.userDataDir;
  }

  /** Login to Pega portal via form-based auth. */
  public async login(): Promise<void> {
    await this.loginFlow.login();
  }

  /** Navigate to RuleForm harness and extract rendered DOM info. */
  public async inspectHarness(className: string, pzInsKey: string): Promise<BrowserInspectionResult> {
    const page = this.state.page;
    if (!page || !this.state.isLoggedIn) throw new Error("Not logged in.");
    const startTime = Date.now();
    this.log(`[BrowserInspector] Inspecting: ${className}`);

    await this.navigator.openRuleInDevStudio(className, pzInsKey);
    await waitForPegaRender(page);

    const { renderedSections, renderedFields } = await this.extractRenderedDom(page, pzInsKey);

    const durationMs = Date.now() - startTime;
    this.log(`[BrowserInspector] ✅ ${className}: ${renderedSections.length} sections, ${renderedFields.length} fields (${durationMs}ms)`);
    return { renderedSections, renderedFields, url: page.url(), durationMs };
  }

  /** Inspect multiple harnesses sequentially. */
  public async inspectMultiple(
    harnesses: Array<{ className: string; pzInsKey: string }>,
  ): Promise<Map<string, BrowserInspectionResult>> {
    const results = new Map<string, BrowserInspectionResult>();
    for (const h of harnesses) {
      try { results.set(h.pzInsKey, await this.inspectHarness(h.className, h.pzInsKey)); }
      catch (err: any) { this.log(`[BrowserInspector] ⚠️ Failed ${h.className}: ${err.message}`); }
    }
    return results;
  }

  /**
   * Extract cell property bindings by dblclick-ing each TH in design canvas.
   * Requires: rule already opened (call inspectHarness first).
   * Triggers pzPropertyPanel activity → captures HTML → parses "Label for" binding.
   */
  public async extractCellProperties(): Promise<CellPropertyBinding[]> {
    return this.cellExtractor.extractCellProperties();
  }

  /**
   * Extract Layout Properties by clicking gear icon on each table in design canvas.
   * Gear icon = SPAN with onclick="oVManager.POPUPLEGENDCLICK(event)".
   */
  public async extractLayoutProperties(): Promise<LayoutPropertyInfo[]> {
    return this.layoutExtractor.extractLayoutProperties();
  }

  /**
   * Resolve a rule reference via Pega OOP class hierarchy using REST API.
   * Calls POST /api/CodeIntelligence/v1/rules/query with query params.
   * Returns resolved pxInsName + pyClassName (actual apply class from resolution).
   */
  public async resolveRule(
    objClass: string, appliesTo: string, ruleName: string,
  ): Promise<{ pxInsName: string; pyClassName: string; pzInsKey: string } | null> {
    return resolveRule(this.config, this.log, objClass, appliesTo, ruleName);
  }

  /** Close browser and cleanup temp profile. */
  public async close(): Promise<void> {
    if (this.state.browser) {
      await this.state.browser.close();
      this.state.browser = null; this.state.page = null; this.state.isLoggedIn = false;
    }
    if (this.state.userDataDir && fs.existsSync(this.state.userDataDir)) {
      try { fs.rmSync(this.state.userDataDir, { recursive: true, force: true }); } catch (err) { console.debug('[PegaBrowserInspector] ok :', (err as Error).message); }
      this.state.userDataDir = null;
    }
  }

  /** Extract section names + design-canvas fields from the opened rule. */
  private async extractRenderedDom(
    page: Page, pzInsKey: string,
  ): Promise<{ renderedSections: string[]; renderedFields: RenderedFieldInfo[] }> {
    // Find rule content iframe (PegaGadgetNIfr) for section names
    const ruleFrame = await this.navigator.findRuleFrame(pzInsKey);
    const sectionSource = ruleFrame || page;
    if (ruleFrame) { this.log("[BrowserInspector] Extracting from rule iframe."); }

    // Extract section names from rule form frame
    const renderedSections = await extractSectionsFromDOM(sectionSource as any);
    const renderedFields = await this.extractDesignCanvasFields();
    return { renderedSections, renderedFields };
  }

  /** Find sectionDisplayIFRAME (nested iframe with design canvas + fields) and extract. */
  private async extractDesignCanvasFields(): Promise<RenderedFieldInfo[]> {
    const designFrame = this.navigator.findActiveDesignFrame();
    let renderedFields: RenderedFieldInfo[] = [];
    if (designFrame) {
      await new Promise((r) => setTimeout(r, 3000));
      renderedFields = await this.fieldExtractor.extractFieldsFromDesignCanvas(designFrame);
      this.log(`[BrowserInspector] Design canvas: ${renderedFields.length} fields.`);
    } else {
      this.log("[BrowserInspector] ⚠️ sectionDisplayIFRAME not found.");
    }
    return renderedFields;
  }
}
