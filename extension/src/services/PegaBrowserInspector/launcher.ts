/**
 * Chrome launcher for PegaBrowserInspector (SA4E-95).
 * Extracted from the original monolith — same flags, same timeouts, same order.
 */

import puppeteer, { type Browser, type LaunchOptions, type Page } from "puppeteer-core";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { detectChromePath } from "./chrome-path";
import type { BrowserInspectorConfig } from "./types";
import type { LogFn } from "./state";

const DEFAULT_TIMEOUT = 30_000;
const PROFILE_PREFIX = "pega-inspector-";

/** Result of a successful Chrome launch. */
export interface LaunchResult {
  browser: Browser;
  page: Page;
  userDataDir: string;
}

/** Launch Chrome (headless by default) with CDP and open the initial page. */
export async function launchBrowser(config: BrowserInspectorConfig, log: LogFn): Promise<LaunchResult> {
  const chromePath = config.chromePath || detectChromePath();
  if (!chromePath) throw new Error("Chrome not found. Set sdlcAgents.chromePath in settings.");
  const userDataDir = path.join(os.tmpdir(), `${PROFILE_PREFIX}${Date.now()}`);
  fs.mkdirSync(userDataDir, { recursive: true });

  log(`[BrowserInspector] Launching Chrome: ${chromePath}`);
  const browser = await puppeteer.launch(buildLaunchOptions(config, chromePath, userDataDir));
  const page = await browser.newPage();
  page.setDefaultTimeout(config.timeout || DEFAULT_TIMEOUT);

  // Handle Pega alert dialogs (e.g. "Unable to open instance") — auto-dismiss
  page.on("dialog", async (dialog) => {
    log(`[BrowserInspector] Dialog: "${dialog.message().substring(0, 100)}" — dismissing`);
    await dialog.accept();
  });

  log("[BrowserInspector] Chrome launched.");
  return { browser, page, userDataDir };
}

/** Build puppeteer launch options (same flags as the original monolith). */
function buildLaunchOptions(
  config: BrowserInspectorConfig, chromePath: string, userDataDir: string,
): LaunchOptions {
  return {
    executablePath: chromePath,
    headless: config.headless !== false,
    userDataDir: userDataDir,
    args: [
      "--no-first-run", "--no-default-browser-check", "--disable-extensions",
      "--disable-popup-blocking", "--disable-translate", "--ignore-certificate-errors",
      // Allow deprecated 'unload' event — Pega uses it, Chrome 117+ blocks it
      "--disable-features=PermissionsPolicyUnload",
    ],
    defaultViewport: { width: 1280, height: 900 },
  };
}
