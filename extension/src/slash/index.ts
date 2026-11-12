/**
 * Impeccable Design Detection Extension Entry Point
 *
 * Tier-2 slash command module that registers the Impeccable design detection
 * skill with the SDLC Agents 4 Enterprise extension host and exposes
 * runDetection() for the design quality gate pipeline.
 *
 * Per TDD §1.1 (design integration) and §3.1 (API contract).
 */

import { CommandContext } from "./context";
import { ImpeccableIntegrationService, CombinedResult } from "./integration.service";
import { DetectionConfig, EnvConfig, QualityReport, DEFAULT_THRESHOLD } from "./types";
import { slashMenu } from "./controller";
import { requireWorkspaceRoot } from "./path-guard";

// Singleton service instance
let impeccableService: ImpeccableIntegrationService | null = null;

/** Get the singleton service, creating it on first access. */
function getService(): ImpeccableIntegrationService {
  if (!impeccableService) {
    impeccableService = new ImpeccableIntegrationService();
  }
  return impeccableService;
}

/** Report the loaded detector to the command context (log + output channel). */
function reportLoaded(ctx: CommandContext, instanceId: string, threshold: number | undefined): void {
  ctx.log(`Design gate loaded: ${instanceId}`);
  // Full pipeline needs sourcePath/localhostUrl: /sdctl design-gate run --source ./src --url http://localhost:5173
  ctx.outputChannel?.appendLine(`Design quality gate loaded successfully`);
  ctx.outputChannel?.appendLine(`Instance ID: ${instanceId}`);
  ctx.outputChannel?.appendLine(`Threshold: ${threshold}`);
}

/** Handler of the `design-gate-run` slash command: load the detector. */
async function handleDesignGateCommand(ctx: CommandContext): Promise<void> {
  const payload: DetectionConfig = {
    detectionMode: "both",
    threshold: parseFloat(process.env[EnvConfig.QUALITY_GATE_THRESHOLD] || "0.8"),
    cacheReuse: true,
  };
  const loadResult = await getService().loadDetector(payload);
  ctx.runtime.metrics.toolCalls++;
  if (loadResult.loadStatus === "error") {
    ctx.log(`Design gate load failed: ${loadResult.message}`);
    return;
  }
  reportLoaded(ctx, loadResult.instanceId, payload.threshold);
}

/**
 * Register the design-gate command with the slash menu.
 * This is called from registerAll() in the slash command controller.
 */
export function registerDesignGateCommand(): void {
  slashMenu.register("design-gate-run", handleDesignGateCommand, { description: "Run Impeccable design quality gate" });
}

/** Defaults applied to a caller-supplied config (workspaceRoot passes through, SEC-F08). */
function buildDetectionConfig(config: DetectionConfig & { workspaceRoot: string }): DetectionConfig & { workspaceRoot: string } {
  return {
    detectionMode: config.detectionMode ?? "both",
    threshold: config.threshold ?? DEFAULT_THRESHOLD,
    cacheReuse: config.cacheReuse ?? true,
    sourceRoot: config.sourceRoot,
    workspaceRoot: config.workspaceRoot,
  };
}

/**
 * Execute design detection with the specified configuration.
 *
 * @param config - mode, threshold, sourceRoot, workspaceRoot, localhostUrl
 * @returns Detection result with combined findings and quality report
 */
export async function runDetection(config: DetectionConfig & { workspaceRoot: string }): Promise<{
  service: ImpeccableIntegrationService;
  combinedResult: CombinedResult;
  report: QualityReport;
}> {
  // Fail before any load/IO: the root is mandatory (no cwd/env fallback).
  const workspaceRoot = requireWorkspaceRoot(config.workspaceRoot);
  const service = getService();
  const detectionConfig = buildDetectionConfig(config);
  // Load detector (skill + WASM) first — C2 lifecycle; idempotent when already loaded.
  const loadResult = await service.loadDetector(detectionConfig);
  if (loadResult.loadStatus === "error") {
    throw new Error(`Detector load failed: ${loadResult.message}`);
  }
  const url = config.localhostUrl ?? (process.env[EnvConfig.LOCALHOST_DEV_SERVER_URL] || "http://localhost:5173");
  const result = await service.runFullDetection(config.sourceRoot ?? workspaceRoot, url, config.urls ?? [], detectionConfig);
  return { service, combinedResult: result.result, report: result.report };
}

/**
 * Exported types for the slash command module.
 * Re-exported from types.ts for consumer access.
 */
export type { Finding, QualityReport, DetectionConfig, DetectionRun } from "./types";
export { DetectionError, EnvConfig, DEFAULT_THRESHOLD } from "./types";

// Export the service class for direct use
export { ImpeccableIntegrationService };

// Reference to slashMenu for command registration
export { slashMenu } from "./controller";

// Default export for module system compatibility
export default {
  registerDesignGateCommand,
  runDetection,
  getService,
};
