/**
 * SA4E-393 — Shared WASM detector path resolution (extracted from extension.ts).
 *
 * Single implementation used by both Command Palette commands and
 * LOCAL_TOOL_REGISTRY design_gate_run tool. 3-tier fallback:
 * 1) Packaged VSIX: resources/wasm/detector.wasm (copy-resources ships here)
 * 2) Dev tsc build: out/wasm/detector.wasm
 * 3) F5 / repo checkout: ../source/source-slash/wasm/detector.wasm
 *
 * Sets IMPPECABLE_SKILL_PATH env var consumed by integration.service.getWasmPath().
 */

import * as fs from 'fs';
import * as path from 'path';
import { EnvConfig } from './types';

/**
 * Resolve WASM detector path and set IMPPECABLE_SKILL_PATH env.
 * @param extensionPath The extension's install path (context.extensionPath in activation).
 * @returns The resolved absolute path to detector.wasm.
 */
export function resolveWasmPath(extensionPath: string): string {
  // 1) Packaged VSIX: copy-resources ships detector binary at resources/wasm/
  //    (esbuild bundles out/ to a single file — out/wasm does not survive packaging)
  const packaged = path.join(extensionPath, 'resources', 'wasm', 'detector.wasm');
  if (fs.existsSync(packaged)) {
    process.env[EnvConfig.IMPPECABLE_SKILL_PATH] = packaged;
    return packaged;
  }

  // 2) Dev tsc build: out/wasm/detector.wasm
  const built = path.join(extensionPath, 'out', 'wasm', 'detector.wasm');
  if (fs.existsSync(built)) {
    process.env[EnvConfig.IMPPECABLE_SKILL_PATH] = built;
    return built;
  }

  // 3) F5 / repo checkout: workspace source layout
  const devCandidate = path.join(extensionPath, '..', 'source', 'source-slash', 'wasm', 'detector.wasm');
  process.env[EnvConfig.IMPPECABLE_SKILL_PATH] = devCandidate;
  return devCandidate;
}