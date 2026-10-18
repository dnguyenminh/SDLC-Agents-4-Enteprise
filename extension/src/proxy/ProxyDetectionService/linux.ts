/**
 * Linux (GNOME) proxy detection via gsettings (ProxyDetectionService).
 */

import { execQuiet } from "./exec";

/** Detect proxy URL from GNOME gsettings configuration. */
export function detectLinuxProxy(): string | null {
  try {
    const mode = execQuiet("gsettings get org.gnome.system.proxy mode")
      .trim().replace(/'/g, "");
    if (mode !== "manual") { return null; }
    // Try HTTPS first, then HTTP
    const httpsHost = gsettingsGet("org.gnome.system.proxy.https", "host");
    const httpsPort = gsettingsGet("org.gnome.system.proxy.https", "port");
    if (httpsHost) { return `http://${httpsHost}${httpsPort ? `:${httpsPort}` : ""}`; }
    const httpHost = gsettingsGet("org.gnome.system.proxy.http", "host");
    const httpPort = gsettingsGet("org.gnome.system.proxy.http", "port");
    if (httpHost) { return `http://${httpHost}${httpPort ? `:${httpPort}` : ""}`; }
    return null;
  } catch {
    // gsettings not available (non-GNOME desktop or headless server)
    return null;
  }
}

/** Detect bypass list from GNOME ignore-hosts. */
export function detectLinuxBypass(): string | null {
  try {
    const output = execQuiet("gsettings get org.gnome.system.proxy ignore-hosts");
    // Format: ['localhost', '127.0.0.0/8', '::1']
    const entries = output.match(/'([^']+)'/g);
    if (!entries) { return null; }
    return entries.map((e) => e.replace(/'/g, "")).join(",");
  } catch {
    return null;
  }
}

/** Read a gsettings key, strip quotes, return null if empty or "0". */
function gsettingsGet(schema: string, key: string): string | null {
  try {
    const val = execQuiet(`gsettings get ${schema} ${key}`)
      .trim().replace(/'/g, "");
    return (val && val !== "0") ? val : null;
  } catch {
    return null;
  }
}
