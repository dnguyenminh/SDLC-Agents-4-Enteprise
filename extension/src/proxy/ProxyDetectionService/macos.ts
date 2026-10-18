/**
 * macOS proxy detection via `scutil --proxy` (ProxyDetectionService).
 */

import { execQuiet } from "./exec";

/** Detect proxy URL from macOS System Configuration. */
export function detectMacOsProxy(): string | null {
  try {
    const output = execQuiet("scutil --proxy");
    // Check HTTPS first, then HTTP
    const httpsEnabled = /HTTPSEnable\s*:\s*1/i.test(output);
    if (httpsEnabled) {
      const host = output.match(/HTTPSProxy\s*:\s*(\S+)/i)?.[1];
      const port = output.match(/HTTPSPort\s*:\s*(\d+)/i)?.[1];
      if (host) { return `http://${host}${port ? `:${port}` : ""}`; }
    }
    const httpEnabled = /HTTPEnable\s*:\s*1/i.test(output);
    if (httpEnabled) {
      const host = output.match(/HTTPProxy\s*:\s*(\S+)/i)?.[1];
      const port = output.match(/HTTPPort\s*:\s*(\d+)/i)?.[1];
      if (host) { return `http://${host}${port ? `:${port}` : ""}`; }
    }
    return null;
  } catch {
    return null;
  }
}

/** Detect bypass list from macOS ExceptionsList. */
export function detectMacOsBypass(): string | null {
  try {
    const output = execQuiet("scutil --proxy");
    // ExceptionsList : <array> { 0 : *.local  1 : 169.254/16 }
    const match = output.match(/ExceptionsList\s*:\s*<array>\s*\{([^}]+)\}/i);
    if (!match) { return null; }
    const entries = match[1].match(/\d+\s*:\s*(\S+)/g);
    if (!entries) { return null; }
    const list = entries.map((e) => e.replace(/^\d+\s*:\s*/, "").trim());
    return list.join(",");
  } catch {
    return null;
  }
}
