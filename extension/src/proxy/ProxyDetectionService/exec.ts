/**
 * Quiet subprocess execution for OS proxy detection (ProxyDetectionService).
 */

import { execSync } from "child_process";

/** Execute a command quietly — returns stdout, throws on error. */
export function execQuiet(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8", timeout: 3000, windowsHide: true });
}
