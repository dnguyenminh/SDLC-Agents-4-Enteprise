/**
 * Chrome executable detection for PegaBrowserInspector (SA4E-95).
 * Moved verbatim from the original monolith.
 */

import { execSync } from "child_process";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

/** Locate a Chrome/Chromium/Edge executable, or return null when none exists. */
export function detectChromePath(): string | null {
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
