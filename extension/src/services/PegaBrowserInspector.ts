/**
 * PegaBrowserInspector — CDP-based browser automation for Pega DOM inspection (SA4E-95).
 * Launches Chrome headless, logs into Pega, navigates to RuleForm harnesses,
 * and extracts actually-rendered sections + field bindings from the live DOM.
 * Complements JSON API extraction by capturing dynamic/runtime section includes.
 */

import puppeteer, { type Browser, type Page, type HTTPResponse } from "puppeteer-core";
import { execSync } from "child_process";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { extractSectionsFromDOM, extractFieldsFromDOM } from "./PegaDomExtractor";

/** Property binding extracted from Cell Properties popup via dblclick */
export interface CellPropertyBinding {
  /** Column header text visible in design canvas */
  headerText: string;
  /** Property path from "Label for" field (e.g. ".Access Group") */
  labelFor: string;
  /** Cell text/display value */
  cellText: string;
  /** Visibility setting (Always, condition, etc.) */
  visibility: string;
  /** BASE_REF path in TempRecordForDVPropPanel */
  baseRef: string;
  /** Grid repeat data name (pyGridRDName) */
  gridRDName: string;
  /** Grid repeat data class (pyGridRDClass) */
  gridRDClass: string;
}

/** Layout/Table properties extracted from gear icon → Layout Properties popup */
export interface LayoutPropertyInfo {
  /** Table number label (e.g. "Table - 2") */
  tableLabel: string;
  /** Data source type (Property, Report, DataPage, etc.) */
  source: string;
  /** List/Group property (e.g. ".pyaccessgroups_opid") */
  listGroup: string;
  /** Grid summary name */
  gridSummary: string;
  /** Item class for the page list */
  itemClass: string;
  /** Operations: row editing mode (None, Inline, Master-detail) */
  rowEditing: string;
  /** Detail flow action name (for master-detail) */
  detailFlowAction: string;
}

/** Result of inspecting a single harness via browser */
export interface BrowserInspectionResult {
  renderedSections: string[];
  renderedFields: RenderedFieldInfo[];
  cellProperties?: CellPropertyBinding[];
  url: string;
  durationMs: number;
}

/** Field info extracted from rendered DOM */
export interface RenderedFieldInfo {
  fieldName: string;
  inputType: string;
  label?: string;
  required: boolean;
  sectionContext?: string;
}

/** Configuration for browser inspector */
export interface BrowserInspectorConfig {
  pegaEndpoint: string;
  username: string;
  password: string;
  headless?: boolean;
  chromePath?: string;
  timeout?: number;
}

const DEFAULT_TIMEOUT = 30_000;
const PROFILE_PREFIX = "pega-inspector-";

/**
 * Manages Chrome browser lifecycle and Pega DOM inspection.
 * Usage: create → launch → login → inspectHarness(es) → close.
 */
export class PegaBrowserInspector {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private userDataDir: string | null = null;
  private isLoggedIn = false;
  private _fieldCellDumped = false;

  constructor(
    private readonly config: BrowserInspectorConfig,
    private readonly log: (msg: string) => void,
  ) {}

  /** Launch Chrome with CDP and establish connection. */
  public async launch(): Promise<void> {
    const chromePath = this.config.chromePath || this.detectChromePath();
    if (!chromePath) throw new Error("Chrome not found. Set sdlcAgents.chromePath in settings.");
    this.userDataDir = path.join(os.tmpdir(), `${PROFILE_PREFIX}${Date.now()}`);
    fs.mkdirSync(this.userDataDir, { recursive: true });

    this.log(`[BrowserInspector] Launching Chrome: ${chromePath}`);
    this.browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: this.config.headless !== false,
      userDataDir: this.userDataDir,
      args: [
        "--no-first-run", "--no-default-browser-check", "--disable-extensions",
        "--disable-popup-blocking", "--disable-translate", "--ignore-certificate-errors",
        // Allow deprecated 'unload' event — Pega uses it, Chrome 117+ blocks it
        "--disable-features=PermissionsPolicyUnload",
      ],
      defaultViewport: { width: 1280, height: 900 },
    });
    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(this.config.timeout || DEFAULT_TIMEOUT);

    // Handle Pega alert dialogs (e.g. "Unable to open instance") — auto-dismiss
    this.page.on("dialog", async (dialog) => {
      this.log(`[BrowserInspector] Dialog: "${dialog.message().substring(0, 100)}" — dismissing`);
      await dialog.accept();
    });

    this.log("[BrowserInspector] Chrome launched.");
  }

  /** Login to Pega portal via form-based auth. */
  public async login(): Promise<void> {
    if (!this.page) throw new Error("Browser not launched.");
    const loginUrl = `${this.config.pegaEndpoint}/PRServlet`;
    this.log(`[BrowserInspector] Logging in: ${loginUrl}`);
    await this.page.goto(loginUrl, { waitUntil: "networkidle2" });

    const filled = await this.fillLoginForm();
    if (!filled) {
      const authUrl = this.config.pegaEndpoint.replace(
        "://", `://${encodeURIComponent(this.config.username)}:${encodeURIComponent(this.config.password)}@`,
      );
      await this.page.goto(`${authUrl}/PRServlet`, { waitUntil: "networkidle2" });
    } else {
      await this.submitLoginForm();
    }
    if (!(await this.verifyLogin())) throw new Error("Pega login failed.");
    this.isLoggedIn = true;
    // Navigate to Dev Studio (login may land on App Studio by default)
    await this.switchToDevStudio();
    this.log("[BrowserInspector] ✅ Logged into Pega Dev Studio.");
  }

  /** Switch from App Studio to Dev Studio portal. */
  private async switchToDevStudio(): Promise<void> {
    if (!this.page) return;
    const inDevStudio = await this.page.evaluate(() =>
      document.title.includes("Dev Studio") || !!document.querySelector('[data-test-id="DevStudio"]'),
    );
    if (inDevStudio) return;

    // Click portal switcher dropdown then select DEV STUDIO
    await this.page.evaluate(() => {
      const switcher = document.querySelector<HTMLElement>(
        '[data-test-id="studio-switcher"], .portal-switcher, [class*="studio-select"]',
      );
      if (switcher) switcher.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await this.page.evaluate(() => {
      const devOption = Array.from(document.querySelectorAll("a, button, [role='menuitem'], li, span"))
        .find((el) => el.textContent?.trim() === "DEV STUDIO" || el.textContent?.trim() === "Dev Studio");
      if (devOption) (devOption as HTMLElement).click();
    });
    await this.page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20_000 }).catch(() => {});
    await this.waitForPegaRender();
  }

  /** Navigate to RuleForm harness and extract rendered DOM info. */
  public async inspectHarness(className: string, pzInsKey: string): Promise<BrowserInspectionResult> {
    if (!this.page || !this.isLoggedIn) throw new Error("Not logged in.");
    const startTime = Date.now();
    this.log(`[BrowserInspector] Inspecting: ${className}`);

    await this.openRuleInDevStudio(className, pzInsKey);
    await this.waitForPegaRender();

    // Find rule content iframe (PegaGadgetNIfr) for section names
    const ruleFrame = await this.findRuleFrame(pzInsKey);
    const sectionSource = ruleFrame || this.page;
    if (ruleFrame) { this.log("[BrowserInspector] Extracting from rule iframe."); }

    // Extract section names from rule form frame
    const renderedSections = await extractSectionsFromDOM(sectionSource as any);

    // Find sectionDisplayIFRAME (nested iframe with design canvas + fields)
    const designFrame = this.findActiveDesignFrame();
    let renderedFields: RenderedFieldInfo[] = [];
    if (designFrame) {
      await new Promise((r) => setTimeout(r, 3000));
      renderedFields = await this.extractFieldsFromDesignCanvas(designFrame);
      this.log(`[BrowserInspector] Design canvas: ${renderedFields.length} fields.`);
    } else {
      this.log("[BrowserInspector] ⚠️ sectionDisplayIFRAME not found.");
    }

    const durationMs = Date.now() - startTime;
    this.log(`[BrowserInspector] ✅ ${className}: ${renderedSections.length} sections, ${renderedFields.length} fields (${durationMs}ms)`);
    return { renderedSections, renderedFields, url: this.page.url(), durationMs };
  }

  /** Extract fields from sectionDisplayIFRAME design canvas. */
  private async extractFieldsFromDesignCanvas(frame: any): Promise<RenderedFieldInfo[]> {
    return frame.evaluate(() => {
      const fields: Array<{
        fieldName: string; inputType: string;
        label?: string; required: boolean; sectionContext?: string;
      }> = [];
      const seen = new Set<string>();

      // Pattern 1: "[.propertyName of Class ClassName]" — table/repeat bindings
      document.body.querySelectorAll("div, span, td, th, label").forEach((el) => {
        if (el.closest("script, style, noscript")) return;
        const text = el.textContent?.trim() || "";
        if (!text || text.length > 300) return;

        // Match: "Table [.propName of Class ClassName]"
        const tableMatches = text.matchAll(/\[\s*\.([a-zA-Z_]\w*)\s+of Class\s+([A-Za-z][A-Za-z0-9-]*)\s*\]/g);
        for (const m of tableMatches) {
          const fieldName = m[1];
          const itemClass = m[2];
          if (!seen.has(fieldName)) {
            seen.add(fieldName);
            fields.push({
              fieldName, inputType: "PageList",
              label: `Table of ${itemClass}`, required: false,
              sectionContext: el.closest("[node_name]")?.getAttribute("node_name") || undefined,
            });
          }
        }

        // Match: standalone ".pyXxx" or ".pzXxx" (Pega OOTB naming)
        const propMatches = text.matchAll(/(?<!\w)\.(py[a-zA-Z_]\w*|pz[a-zA-Z_]\w*|px[a-zA-Z_]\w*)/g);
        for (const m of propMatches) {
          const fieldName = m[1];
          if (!seen.has(fieldName)) {
            seen.add(fieldName);
            fields.push({
              fieldName, inputType: "text", required: false,
              sectionContext: el.closest("[node_name]")?.getAttribute("node_name") || undefined,
            });
          }
        }

        // Match: "[.propName]" bracket-enclosed simple ref
        const bracketMatches = text.matchAll(/\[\s*\.([a-zA-Z_]\w*)\s*\]/g);
        for (const m of bracketMatches) {
          if (!seen.has(m[1])) { seen.add(m[1]); fields.push({ fieldName: m[1], inputType: "text", required: false }); }
        }
      });

      // Pattern 2: data-label attributes (field property names in design view)
      document.querySelectorAll("[data-label]").forEach((el) => {
        const propName = el.getAttribute("data-label") || "";
        if (propName && !seen.has(propName) && /^[a-z]/.test(propName)) {
          seen.add(propName);
          const parent = el.closest(".content-item");
          const labelEl = parent?.querySelector(".field-caption, label");
          const label = labelEl?.textContent?.trim().replace(/\u00a0/g, "").trim() || undefined;
          fields.push({
            fieldName: propName, inputType: "text",
            label, required: false,
            sectionContext: el.closest("[node_name]")?.getAttribute("node_name") || undefined,
          });
        }
      });

      // Pattern 3: text content matching property name (pyXxx without dot)
      document.querySelectorAll(".field-item div, .field-item span").forEach((el) => {
        const text = el.textContent?.trim() || "";
        if (text && /^(py|pz|px)[A-Z][a-zA-Z_]*$/.test(text) && !seen.has(text)) {
          seen.add(text);
          const parent = el.closest(".content-item");
          const labelEl = parent?.querySelector(".field-caption, label");
          const label = labelEl?.textContent?.trim().replace(/\u00a0/g, "").trim() || undefined;
          fields.push({
            fieldName: text, inputType: "text",
            label, required: false,
            sectionContext: el.closest("[node_name]")?.getAttribute("node_name") || undefined,
          });
        }
      });

      // Pattern 4: data-ui-meta with explicit property refs
      document.querySelectorAll("[data-ui-meta]").forEach((el) => {
        if (el.closest("script")) return;
        const meta = el.getAttribute("data-ui-meta") || "";
        const propMatch = meta.match(/pyValue['":\s]+['".]([a-z][a-zA-Z_]\w*)/);
        if (propMatch && !seen.has(propMatch[1])) {
          seen.add(propMatch[1]); fields.push({ fieldName: propMatch[1], inputType: "text", required: false });
        }
        const repeatMatch = meta.match(/pyPageListProperty['":\s]+['".]?([a-z][a-zA-Z_]\w*)/);
        if (repeatMatch && !seen.has(repeatMatch[1])) {
          seen.add(repeatMatch[1]); fields.push({ fieldName: repeatMatch[1], inputType: "PageList", required: false });
        }
      });

      // Pattern 5: Section includes — dvinfo with pxObjClass=Rule-HTML-Section
      document.querySelectorAll("[dvinfo]").forEach((el) => {
        const dvinfo = el.getAttribute("dvinfo") || "";
        if (!dvinfo.includes("Rule-HTML-Section")) return;
        const ruleNameMatch = dvinfo.match(/pyRuleName=([^&"]+)/);
        if (ruleNameMatch && !seen.has(`__section__${ruleNameMatch[1]}`)) {
          seen.add(`__section__${ruleNameMatch[1]}`);
          fields.push({
            fieldName: ruleNameMatch[1],
            inputType: "SectionInclude",
            required: false,
            sectionContext: "embedded",
          });
        }
      });

      return fields;
    });
  }

  /** Find the iframe containing the opened rule content. */
  private async findRuleFrame(pzInsKey: string): Promise<any | null> {
    if (!this.page) return null;
    const parts = pzInsKey.split(" ");
    const tsIdx = parts.findIndex((p) => p.startsWith("#"));
    const insName = (tsIdx > 1 ? parts.slice(1, tsIdx) : parts.slice(1)).join("!");

    const frames = this.page.frames();
    // Match iframe src containing insName
    for (const frame of frames) {
      const url = frame.url();
      if (url.includes(encodeURIComponent(insName)) || url.includes(insName)) {
        this.log(`[BrowserInspector] Found rule iframe: ${frame.name() || "unnamed"}`);
        return frame;
      }
    }
    // Fallback: newest PegaGadgetNIfr
    for (const frame of [...frames].reverse()) {
      const name = frame.name() || "";
      if (name.startsWith("PegaGadget") && name.endsWith("Ifr")) {
        this.log(`[BrowserInspector] Using gadget iframe: ${name}`);
        return frame;
      }
    }
    return null;
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
   * Find the sectionDisplayIFRAME belonging to the LAST opened rule tab.
   * When multiple tabs are open (PegaGadget0Ifr, PegaGadget1Ifr, etc.),
   * returns the sectionDisplayIFRAME inside the newest/highest-numbered gadget.
   */
  private findActiveDesignFrame(): any | null {
    if (!this.page) return null;
    const frames = this.page.frames();
    const designFrames = frames.filter((f) => f.name() === "sectionDisplayIFRAME");
    if (designFrames.length === 0) return null;
    if (designFrames.length === 1) return designFrames[0];
    return designFrames[designFrames.length - 1];
  }

  /**
   * Resolve a rule reference via Pega OOP class hierarchy using REST API.
   * Calls POST /api/CodeIntelligence/v1/rules/query with query params.
   * Returns resolved pxInsName + pyClassName (actual apply class from resolution).
   */
  public async resolveRule(
    objClass: string, appliesTo: string, ruleName: string,
  ): Promise<{ pxInsName: string; pyClassName: string; pzInsKey: string } | null> {
    const baseUrl = this.config.pegaEndpoint.replace(/\/PRServlet$/, "").replace(/\/prweb$/, "");
    const url = `${baseUrl}/prweb/api/CodeIntelligence/v1/rules/query`
      + `?pxObjClass=${encodeURIComponent(objClass)}`
      + `&appliesTo=${encodeURIComponent(appliesTo)}`
      + `&pyRuleName=${encodeURIComponent(ruleName)}`;

    const authHeader = "Basic " + Buffer.from(
      `${this.config.username}:${this.config.password}`,
    ).toString("base64");

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
      });

      if (!resp.ok) {
        this.log(`[BrowserInspector] resolveRule: ${resp.status} for ${objClass}/${appliesTo}/${ruleName}`);
        return null;
      }

      const json = await resp.json() as any;
      const pxInsName = json.pxInsName || "";
      const pyClassName = json.pyClassName || appliesTo;
      const pzInsKey = json.pzInsKey || "";

      this.log(`[BrowserInspector] resolveRule: ${ruleName} → ${pyClassName}/${pxInsName}`);
      return { pxInsName, pyClassName, pzInsKey };
    } catch (err: any) {
      this.log(`[BrowserInspector] resolveRule error: ${err.message}`);
      return null;
    }
  }

  /**
   * Extract cell property bindings by dblclick-ing each TH in design canvas.
   * Requires: rule already opened (call inspectHarness first).
   * Triggers pzPropertyPanel activity → captures HTML → parses "Label for" binding.
   */
  public async extractCellProperties(): Promise<CellPropertyBinding[]> {
    if (!this.page) throw new Error("Browser not launched.");
    const designFrame = this.findActiveDesignFrame();
    if (!designFrame) {
      this.log("[BrowserInspector] ⚠️ No sectionDisplayIFRAME for cell properties.");
      return [];
    }

    const bindings: CellPropertyBinding[] = [];

    // Pattern 1: TH elements (table column headers)
    const thElements = await designFrame.evaluate(() =>
      Array.from(document.querySelectorAll("th"))
        .map((th, i) => ({ index: i, text: th.textContent?.trim() || "" }))
        .filter((th) => th.text.length > 0),
    );

    if (thElements.length > 0) {
      this.log(`[BrowserInspector] Extracting from ${thElements.length} TH columns...`);
      for (const th of thElements) {
        try {
          const binding = await this.dblclickAndCapture(designFrame, th.index, th.text);
          if (binding) {
            bindings.push(binding);
            this.log(`[BrowserInspector]   ✓ "${th.text}" → labelFor="${binding.labelFor}"`);
          }
        } catch (err: any) {
          this.log(`[BrowserInspector]   ⚠️ "${th.text}": ${err.message}`);
        }
      }
    }

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
      for (const cell of fieldCells) {
        try {
          const binding = await this.dblclickFieldCell(designFrame, cell.index, cell.label);
          if (binding) {
            bindings.push(binding);
            this.log(`[BrowserInspector]   ✓ "${cell.label}" → labelFor="${binding.labelFor}"`);
          }
        } catch (err: any) {
          this.log(`[BrowserInspector]   ⚠️ field "${cell.label}": ${err.message}`);
        }
      }
    }

    if (bindings.length === 0) {
      this.log("[BrowserInspector] No cell/field bindings found.");
    } else {
      this.log(`[BrowserInspector] ✅ Extracted ${bindings.length} total bindings.`);
    }
    return bindings;
  }

  /** Click field cell to select, then click gear icon to open properties popup. */
  private async dblclickFieldCell(
    designFrame: any, cellIndex: number, label: string,
  ): Promise<CellPropertyBinding | null> {
    if (!this.page) return null;

    let capturedHTML = "";
    const handler = async (resp: HTTPResponse) => {
      const url = resp.url();
      const ct = resp.headers()["content-type"] || "";
      if ((ct.includes("text/html") || url.includes("pzTransactionId"))
          && !url.match(/\.(js|css|png|gif|svg)$/)) {
        try {
          const body = await resp.text();
          if (body.length > 3000 && (body.includes("Cell Properties") || body.includes("Property") || body.includes("template-root-marker"))) {
            capturedHTML = body;
          }
        } catch (err) { console.debug('[PegaBrowserInspector] Operation failed (non-fatal):', (err as Error).message); }
      }
    };
    this.page.on("response", handler);

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

    const deadline = Date.now() + 10_000;
    while (!capturedHTML && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 300));
    }
    this.page.off("response", handler);

    if (!capturedHTML) {
      // Fallback: read popup DOM directly (Pega may render without AJAX for subsequent fields)
      const domPropValue = await this.readFieldPropertyFromDOM(designFrame);
      if (domPropValue) {
        this.log(`[BrowserInspector] parseFieldCell "${label}" → property="${domPropValue}" (DOM)`);
        await this.closeCellPopup(designFrame);
        return {
          headerText: label,
          labelFor: domPropValue,
          cellText: label,
          visibility: "Always",
          baseRef: "",
          gridRDName: "",
          gridRDClass: "",
        };
      }
      if (cellIndex <= 1) {
        this.log(`[BrowserInspector] FIELD CELL: No response/DOM for "${label}"`);
      }
      return null;
    }

    // Debug: dump first successful capture to file for analysis
    if (!this._fieldCellDumped) {
      this._fieldCellDumped = true;
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

    const binding = this.parseFieldCellHTML(capturedHTML, label);
    await this.closeCellPopup(designFrame);
    return binding;
  }

  /** Dblclick TH, intercept pzPropertyPanel HTML, parse bindings, close popup. */
  private async dblclickAndCapture(
    designFrame: any, thIndex: number, headerText: string,
  ): Promise<CellPropertyBinding | null> {
    if (!this.page) return null;

    let capturedHTML = "";
    const handler = async (resp: HTTPResponse) => {
      const url = resp.url();
      const ct = resp.headers()["content-type"] || "";
      if ((ct.includes("text/html") || url.includes("pzTransactionId"))
          && !url.match(/\.(js|css|png|gif|svg)$/)) {
        try {
          const body = await resp.text();
          if (body.length > 5000 && body.includes("Cell Properties")) {
            capturedHTML = body;
          }
        } catch (err) { console.debug('[PegaBrowserInspector] stream consumed :', (err as Error).message); }
      }
    };
    this.page.on("response", handler);

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

    // Wait for AJAX (max 10s)
    const deadline = Date.now() + 10_000;
    while (!capturedHTML && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 300));
    }
    this.page.off("response", handler);

    if (!capturedHTML) return null;

    const binding = this.parseCellHTML(capturedHTML, headerText);
    await this.closeCellPopup(designFrame);
    return binding;
  }

  /** Parse Cell Properties HTML to extract field bindings. */
  private parseCellHTML(html: string, headerText: string): CellPropertyBinding {
    // Pega uses: ID="pyLabelFor" TYPE="text" value=".Access Group"
    // with ISNS_BASECLASS="pyLabelForPromptClass"
    const labelForMatch = html.match(
      /ID="pyLabelFor"[\s\S]{0,200}?value="([^"]*)"/,
    ) || html.match(
      /id="pyLabelFor"[\s\S]{0,200}?value="([^"]*)"/i,
    );

    // Fallback: value before ID
    const labelForAlt = html.match(
      /value="([^"]*)"[\s\S]{0,200}?ID="pyLabelFor"/,
    );

    // Cell text: pySmartPrompt input value
    const cellTextMatch = html.match(
      /ID="pySmartPrompt"[\s\S]{0,200}?value="([^"]*)"/i,
    ) || html.match(
      /name="[^"]*pySmartPromptClass[^"]*"[\s\S]{0,100}?value="([^"]*)"/,
    );

    const baseRefMatch = html.match(/BASE_REF="([^"]+)"/);

    const gridRDNameMatch = html.match(
      /ID="pyGridRDName"[\s\S]{0,200}?value="([^"]*)"/i,
    ) || html.match(
      /name="[^"]*pyGridRDName[^"]*"[\s\S]{0,100}?value="([^"]*)"/,
    );
    const gridRDClassMatch = html.match(
      /ID="pyGridRDClass"[\s\S]{0,200}?value="([^"]*)"/i,
    ) || html.match(
      /name="[^"]*pyGridRDClass[^"]*"[\s\S]{0,100}?value="([^"]*)"/,
    );

    const visMatch = html.match(
      /Visibility[\s\S]{0,200}?selected[^>]*>([^<]+)</,
    ) || html.match(/pyVisibility[\s\S]{0,100}?value['":\s]+['"]([^'"]+)['"]/);

    return {
      headerText,
      labelFor: labelForMatch?.[1] || labelForAlt?.[1] || "",
      cellText: cellTextMatch?.[1] || "",
      visibility: visMatch?.[1]?.trim() || "Always",
      baseRef: baseRefMatch?.[1] || "",
      gridRDName: gridRDNameMatch?.[1] || "",
      gridRDClass: gridRDClassMatch?.[1] || "",
    };
  }

  /**
   * Parse field cell popup HTML (DV Property Panel format).
   * Key pattern: ID="pyValue" TYPE="text" value=".pyTitle"
   * Name format: $PTempRecordForDVPropPanel$ppySections$l1$...$ppyValue
   */
  private parseFieldCellHTML(html: string, label: string): CellPropertyBinding {
    // Primary pattern: ID="pyValue" input with property reference value
    const pyValueMatch = html.match(
      /ID="pyValue"[\s\S]{0,300}?value="([^"]*)"/,
    ) || html.match(
      /id="pyValue"[\s\S]{0,300}?value="([^"]*)"/i,
    );

    // Fallback: name ends with $ppyValue and has value with dot-prefix
    const ppyValueMatch = html.match(
      /name="[^"]*\$ppyValue"[\s\S]{0,300}?value="([^"]*)"/,
    ) || html.match(
      /name='[^']*\$ppyValue'[\s\S]{0,300}?value='([^']*)'/,
    );

    // Fallback: any input with data-ctl='non-auto' + ISNS_CLASS="Rule-Obj-Property" + value
    const smartPromptMatch = html.match(
      /data-ctl='non-auto'[\s\S]{0,500}?ISNS_CLASS="Rule-Obj-Property"[\s\S]{0,200}?value="([^"]*)"/,
    ) || html.match(
      /ISNS_CLASS="Rule-Obj-Property"[\s\S]{0,200}?value="([^"]*)"/,
    );

    // Extract property reference
    const propRef = pyValueMatch?.[1]
      || ppyValueMatch?.[1]
      || smartPromptMatch?.[1]
      || "";

    // Clean: remove leading dot
    const cleanProp = propRef.startsWith(".") ? propRef.substring(1) : propRef;

    // Visibility: from JSON structure "pyDescription":"ALWAYS" (default)
    const visMatch = html.match(
      /pyVisibilityWhenId[\s\S]{0,2000}?"pyDescription":"([^"]+)"/,
    );

    if (cleanProp) {
      this.log(`[BrowserInspector] parseFieldCell "${label}" → property="${cleanProp}"`);
    } else {
      this.log(`[BrowserInspector] parseFieldCell "${label}" → NO PROPERTY FOUND`);
    }

    return {
      headerText: label,
      labelFor: cleanProp,
      cellText: label,
      visibility: visMatch?.[1]?.trim() || "Always",
      baseRef: "",
      gridRDName: "",
      gridRDClass: "",
    };
  }

  /**
   * Read property value directly from the DV Property Panel popup DOM.
   * Pega renders subsequent field popups via DOM manipulation (no AJAX).
   * The popup contains an input with ID="pyValue" showing the property reference.
   */
  private async readFieldPropertyFromDOM(designFrame: any): Promise<string | null> {
    if (!this.page) return null;

    // The popup may render in the PegaGadget frame or the design frame
    const frames = [
      designFrame,
      ...this.page.frames().filter((f) => f.name().startsWith("PegaGadget")),
      this.page.mainFrame(),
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

  /** Close Cell Properties popup after extraction. */
  private async closeCellPopup(designFrame: any): Promise<void> {
    if (!this.page) return;
    const gadgetFrame = this.page.frames().find((f) => f.name().startsWith("PegaGadget"));
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

  /**
   * Extract Layout Properties by clicking gear icon on each table in design canvas.
   * Gear icon = SPAN with onclick="oVManager.POPUPLEGENDCLICK(event)".
   */
  public async extractLayoutProperties(): Promise<LayoutPropertyInfo[]> {
    if (!this.page) throw new Error("Browser not launched.");
    const designFrame = this.findActiveDesignFrame();
    if (!designFrame) {
      this.log("[BrowserInspector] ⚠️ No sectionDisplayIFRAME for layout properties.");
      return [];
    }

    const legends = await designFrame.evaluate(() => {
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

    if (legends.length === 0) {
      this.log("[BrowserInspector] No table layouts with gear icons.");
      return [];
    }

    this.log(`[BrowserInspector] Extracting layout properties from ${legends.length} tables...`);
    const results: LayoutPropertyInfo[] = [];

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

    this.log(`[BrowserInspector] ✅ Extracted ${results.length} layout properties.`);
    return results;
  }

  /** Click gear icon on legend and capture Layout Properties popup. */
  private async clickGearAndCapture(
    designFrame: any, legendIndex: number, label: string,
  ): Promise<LayoutPropertyInfo | null> {
    if (!this.page) return null;

    let capturedHTML = "";
    const handler = async (resp: HTTPResponse) => {
      try {
        const body = await resp.text();
        if (body.length > 3000 && (body.includes("Layout Properties") || body.includes("Data source") || body.includes("Row operations"))) {
          capturedHTML = body;
        }
      } catch (err) { console.debug('[PegaBrowserInspector] Operation failed (non-fatal):', (err as Error).message); }
    };
    this.page.on("response", handler);

    // Step 1: Click legend to select it (make it active/focused)
    await designFrame.evaluate((idx: number) => {
      const legends = document.querySelectorAll("legend");
      const legend = legends[idx];
      if (!legend) return;
      legend.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      legend.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      legend.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }, legendIndex);

    await new Promise((r) => setTimeout(r, 1000));

    // Step 2: Trigger POPUPLEGENDCLICK — dispatch real click event ON the gear element
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

    // Wait for AJAX
    const deadline = Date.now() + 10_000;
    while (!capturedHTML && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 300));
    }
    this.page.off("response", handler);

    if (!capturedHTML) return null;

    const info = this.parseLayoutHTML(capturedHTML, label);
    await this.closeCellPopup(designFrame);
    return info;
  }

  /** Parse Layout Properties HTML — General + Operations tabs. */
  private parseLayoutHTML(html: string, tableLabel: string): LayoutPropertyInfo {
    // Debug: dump key sections
    this.log(`[BrowserInspector]   Layout HTML size: ${html.length}`);
    const pyRDIdx = html.indexOf("pyRD");
    if (pyRDIdx > -1) this.log(`[BrowserInspector]   pyRD context: ${html.substring(pyRDIdx - 20, pyRDIdx + 200).replace(/\s+/g, " ")}`);
    const listIdx = html.indexOf("pyaccessgroups");
    if (listIdx > -1) this.log(`[BrowserInspector]   pyaccessgroups: ${html.substring(listIdx - 50, listIdx + 150).replace(/\s+/g, " ")}`);
    const flowIdx = html.indexOf("pzAccessGroupsRoles");
    if (flowIdx > -1) this.log(`[BrowserInspector]   flowAction: ${html.substring(flowIdx - 100, flowIdx + 100).replace(/\s+/g, " ")}`);
    const detailIdx = html.indexOf("Detail");
    if (detailIdx > -1) this.log(`[BrowserInspector]   Detail: ${html.substring(detailIdx - 20, detailIdx + 200).replace(/\s+/g, " ")}`);

    // Parse List/Group — ID="pyPageListProperty" value=".pyaccessgroups_opid"
    const listGroupMatch = html.match(
      /ID="pyPageListProperty"[\s\S]{0,200}?value="([^"]*)"/i,
    ) || html.match(
      /pyPageListProperty[\s\S]{0,200}?value="([^"]*)"/i,
    ) || html.match(
      /ID="pyGridRDName"[\s\S]{0,200}?value="([^"]*)"/i,
    );

    const gridSummaryMatch = html.match(/Grid\s*summary[\s\S]{0,200}?value="([^"]*)"/i)
      || html.match(/ID="pyGridSummary"[\s\S]{0,200}?value="([^"]*)"/i)
      || html.match(/pyGridSummary[\s\S]{0,200}?value="([^"]*)"/i);

    const sourceMatch = html.match(/Source[\s\S]{0,200}?selected[^>]*>([^<]+)</);

    const itemClassMatch = html.match(/of Class\s+([A-Za-z][A-Za-z0-9-]*)/)
      || html.match(/ISNS_BASECLASS="([^"]*)"/);

    const masterDetail = html.includes("Master") && html.includes("detail");
    let rowEditing = "None";
    if (masterDetail) rowEditing = "Master-detail";

    // Flow action
    const flowActionMatch = html.match(
      /Detail flow action[\s\S]{0,300}?value="([^"]*)"/i,
    ) || html.match(
      /pyFlowActionName[\s\S]{0,200}?value="([^"]*)"/i,
    ) || html.match(
      /flow.?action[\s\S]{0,300}?value="([^"]*)"/i,
    ) || html.match(
      /value="(pz[A-Z][a-zA-Z]+)"[\s\S]{0,100}?flow/i,
    );

    return {
      tableLabel,
      source: sourceMatch?.[1]?.trim() || "Property",
      listGroup: listGroupMatch?.[1] || "",
      gridSummary: gridSummaryMatch?.[1] || "",
      itemClass: itemClassMatch?.[1] || "",
      rowEditing,
      detailFlowAction: flowActionMatch?.[1] || "",
    };
  }

  /** Close browser and cleanup temp profile. */
  public async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null; this.page = null; this.isLoggedIn = false;
    }
    if (this.userDataDir && fs.existsSync(this.userDataDir)) {
      try { fs.rmSync(this.userDataDir, { recursive: true, force: true }); } catch (err) { console.debug('[PegaBrowserInspector] ok :', (err as Error).message); }
      this.userDataDir = null;
    }
  }

  /**
   * Open a rule inside Dev Studio using Pega's internal JS API.
   * Uses pega.desktop.openRuleByClassAndName(insName, objClass, "", "").
   * insName format: "APPLIESTO RULENAME" (space-separated from pzInsKey parts).
   */
  private async openRuleInDevStudio(className: string, pzInsKey: string): Promise<void> {
    if (!this.page) return;
    // Extract insName from pzInsKey: skip first part (class) and timestamp (#...)
    // pxInsName format: "APPLIESTO!RULENAME" (joined with !)
    const parts = pzInsKey.split(" ");
    const tsIdx = parts.findIndex((p) => p.startsWith("#"));
    const insNameParts = tsIdx > 1 ? parts.slice(1, tsIdx) : parts.slice(1);
    const insName = insNameParts.join("!");
    // objClass for the rule type (e.g., "Rule-HTML-Harness")
    const ruleClass = parts[0].split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join("-");

    this.log(`[BrowserInspector] Opening: ruleClass=${ruleClass}, insName=${insName}`);

    const opened = await this.page.evaluate((cls: string, name: string) => {
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
    await new Promise((r) => setTimeout(r, 4000));
    await this.waitForPegaRender();
    // Wait for design canvas to fully load inside rule iframe
    await this.waitForIframeContentLoad();
    // Dismiss any error popup (e.g. "Unable to open instance")
    await this.dismissErrorPopup();
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
    if (!this.page) return;
    try {
      const dismissed = await this.page.evaluate(() => {
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

  private async fillLoginForm(): Promise<boolean> {
    if (!this.page) return false;
    return this.page.evaluate((u: string, p: string) => {
      const ui = document.querySelector<HTMLInputElement>('input[name="UserIdentifier"], input[id="txtUserID"]');
      const pi = document.querySelector<HTMLInputElement>('input[name="Password"], input[id="txtPassword"]');
      if (!ui || !pi) return false;
      ui.value = u; pi.value = p;
      ui.dispatchEvent(new Event("input", { bubbles: true }));
      pi.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }, this.config.username, this.config.password);
  }

  private async submitLoginForm(): Promise<void> {
    if (!this.page) return;
    await this.page.evaluate(() => {
      const btn = document.querySelector<HTMLElement>('button[type="submit"], input[type="submit"], #sub');
      if (btn) btn.click(); else document.querySelector("form")?.submit();
    });
    await this.page.waitForNavigation({ waitUntil: "networkidle2" });
  }

  private async verifyLogin(): Promise<boolean> {
    if (!this.page) return false;
    return this.page.evaluate(() => {
      const err = document.querySelector(".login-error, .error-message, #ErrorMsg");
      if (err && err.textContent?.trim()) return false;
      return document.title.includes("Pega") || document.title.includes("Dev Studio")
        || !!document.querySelector(".portal-header, #pzDesktopLayout");
    });
  }

  private async waitForPegaRender(): Promise<void> {
    if (!this.page) return;
    try {
      await this.page.waitForFunction(() => {
        const l = document.querySelector(".loading-indicator, #pzLoading, .pega-busy");
        return !l || (l as HTMLElement).style.display === "none";
      }, { timeout: 15_000 });
    } catch (err) { console.debug('[PegaBrowserInspector] no loader :', (err as Error).message); }
    await this.page.waitForFunction(() => new Promise<boolean>((resolve) => {
      let t: ReturnType<typeof setTimeout>;
      const o = new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { o.disconnect(); resolve(true); }, 1000); });
      o.observe(document.body, { childList: true, subtree: true });
      t = setTimeout(() => { o.disconnect(); resolve(true); }, 3000);
    }), { timeout: 10_000 });
  }

  private detectChromePath(): string | null {
    const candidates: string[] = [];
    if (os.platform() === "win32") {
      candidates.push(
        path.join(process.env["PROGRAMFILES"] || "", "Google/Chrome/Application/chrome.exe"),
        path.join(process.env["PROGRAMFILES(X86)"] || "", "Google/Chrome/Application/chrome.exe"),
        path.join(process.env["LOCALAPPDATA"] || "", "Google/Chrome/Application/chrome.exe"),
        path.join(process.env["PROGRAMFILES"] || "", "Microsoft/Edge/Application/msedge.exe"),
      );
    } else if (os.platform() === "darwin") {
      candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    } else {
      try { const w = execSync("which google-chrome || which chromium-browser", { encoding: "utf-8" }).trim(); if (w) return w; } catch (err) { console.debug('[PegaBrowserInspector] noop :', (err as Error).message); }
      candidates.push("/usr/bin/google-chrome", "/usr/bin/chromium-browser");
    }
    for (const c of candidates) { if (fs.existsSync(c)) return c; }
    return null;
  }
}
