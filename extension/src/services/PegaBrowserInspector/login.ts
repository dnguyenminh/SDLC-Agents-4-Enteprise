/**
 * PegaLoginFlow — form-based Pega login + Dev Studio portal switch (SA4E-95).
 * Extracted from the original PegaBrowserInspector monolith — same behavior.
 */

import type { Page } from "puppeteer-core";
import type { BrowserInspectorConfig } from "./types";
import type { InspectorState, LogFn } from "./state";
import { waitForPegaRender } from "./waits";

/**
 * Handles Pega portal login and the switch to the Dev Studio portal.
 */
export class PegaLoginFlow {
  constructor(
    private readonly state: InspectorState,
    private readonly config: BrowserInspectorConfig,
    private readonly log: LogFn,
  ) {}

  /** Login to Pega portal via form-based auth. */
  public async login(): Promise<void> {
    const page = this.state.page;
    if (!page) throw new Error("Browser not launched.");
    const loginUrl = `${this.config.pegaEndpoint}/PRServlet`;
    this.log(`[BrowserInspector] Logging in: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: "networkidle2" });

    const filled = await this.fillLoginForm();
    await this.openPortal(page, filled);
    if (!(await this.verifyLogin())) throw new Error("Pega login failed.");
    this.state.isLoggedIn = true;
    // Navigate to Dev Studio (login may land on App Studio by default)
    await this.switchToDevStudio();
    this.log("[BrowserInspector] ✅ Logged into Pega Dev Studio.");
  }

  /** Submit the login form, or fall back to basic-auth URL navigation. */
  private async openPortal(page: Page, filled: boolean): Promise<void> {
    if (!filled) {
      const authUrl = this.config.pegaEndpoint.replace(
        "://", `://${encodeURIComponent(this.config.username)}:${encodeURIComponent(this.config.password)}@`,
      );
      await page.goto(`${authUrl}/PRServlet`, { waitUntil: "networkidle2" });
    } else {
      await this.submitLoginForm();
    }
  }

  /** Switch from App Studio to Dev Studio portal. */
  private async switchToDevStudio(): Promise<void> {
    const page = this.state.page;
    if (!page) return;
    const inDevStudio = await page.evaluate(() =>
      document.title.includes("Dev Studio") || !!document.querySelector('[data-test-id="DevStudio"]'),
    );
    if (inDevStudio) return;
    await this.clickDevStudioOption(page);
    await waitForPegaRender(page);
  }

  /** Click portal switcher dropdown then select DEV STUDIO. */
  private async clickDevStudioOption(page: Page): Promise<void> {
    // Click portal switcher dropdown then select DEV STUDIO
    await page.evaluate(() => {
      const switcher = document.querySelector<HTMLElement>(
        '[data-test-id="studio-switcher"], .portal-switcher, [class*="studio-select"]',
      );
      if (switcher) switcher.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await page.evaluate(() => {
      const devOption = Array.from(document.querySelectorAll("a, button, [role='menuitem'], li, span"))
        .find((el) => el.textContent?.trim() === "DEV STUDIO" || el.textContent?.trim() === "Dev Studio");
      if (devOption) (devOption as HTMLElement).click();
    });
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20_000 }).catch(() => {});
  }

  private async fillLoginForm(): Promise<boolean> {
    const page = this.state.page;
    if (!page) return false;
    return page.evaluate((u: string, p: string) => {
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
    const page = this.state.page;
    if (!page) return;
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLElement>('button[type="submit"], input[type="submit"], #sub');
      if (btn) btn.click(); else document.querySelector("form")?.submit();
    });
    await page.waitForNavigation({ waitUntil: "networkidle2" });
  }

  private async verifyLogin(): Promise<boolean> {
    const page = this.state.page;
    if (!page) return false;
    return page.evaluate(() => {
      const err = document.querySelector(".login-error, .error-message, #ErrorMsg");
      if (err && err.textContent?.trim()) return false;
      return document.title.includes("Pega") || document.title.includes("Dev Studio")
        || !!document.querySelector(".portal-header, #pzDesktopLayout");
    });
  }
}
