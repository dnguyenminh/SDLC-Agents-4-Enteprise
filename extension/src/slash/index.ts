/**
 * Impeccable Design Detection Extension Entry Point
 * 
 * Tier-2 slash command module that registers the Impeccable design detection
 * skill with the SDLC Agents 4 Enterprise extension host.
 * 
 * This is the public entry point that VS Code/Kiro extension host uses to
 * invoke the design quality gate pipeline.
 * 
 * Per TDD §1.1: Design integration of Impeccable design detection skill and
 * WASM detector into SDLC Agents 4 Enterprise VS Code/Kiro extension.
 * 
 * Per TDD §3.1: API Contract - POST /pipeline/design-gate/load
 */

import { CommandContext } from "./context";
import { ImpeccableIntegrationService, CombinedResult } from "./integration.service";
import { DetectionError, DetectionConfig, EnvConfig, Finding, QualityReport, DEFAULT_THRESHOLD } from "./types";
import { slashMenu } from "./controller";

// Singleton service instance
let impeccableService: ImpeccableIntegrationService | null = null;

/**
 * Get the singleton ImpeccableIntegrationService instance.
 * Creates it on first access if not already created.
 */
function getService(): ImpeccableIntegrationService {
  if (!impeccableService) {
    impeccableService = new ImpeccableIntegrationService();
  }
  return impeccableService;
}

/**
 * Register the design-gate command with the slash menu.
 * This is called from registerAll() in the slash command controller.
 */
export function registerDesignGateCommand(): void {
  slashMenu.register("design-gate-run", async (ctx: CommandContext) => {
    const service = getService();
    const payload: DetectionConfig = {
      detectionMode: "both",
      threshold: parseFloat(process.env[EnvConfig.QUALITY_GATE_THRESHOLD] || "0.8"),
      cacheReuse: true,
    };

    // Call the load detector API
    const loadResult = await service.loadDetector(payload);

    if (loadResult.loadStatus === "error") {
      ctx.runtime.metrics.toolCalls++;
      ctx.log(`Design gate load failed: ${loadResult.message}`);
      return;
    }

    ctx.runtime.metrics.toolCalls++;
    ctx.log(`Design gate loaded: ${loadResult.instanceId}`);

    // For now, just report load success - full pipeline would need
    // additional command parameters for sourcePath, localhostUrl, etc.
    // The pipeline command would be: /sdctl design-gate run --source ./src --url http://localhost:5173
    ctx.outputChannel?.appendLine(`Design quality gate loaded successfully`);
    ctx.outputChannel?.appendLine(`Instance ID: ${loadResult.instanceId}`);
    ctx.outputChannel?.appendLine(`Threshold: ${payload.threshold}`);
  }, { description: "Run Impeccable design quality gate" });
}

/**
 * Execute design detection with the specified configuration.
 * 
 * @param config - Detection configuration (mode, threshold, sourcePath, localhostUrl)
 * @returns Detection result with combined findings and quality report
 */
export async function runDetection(config: DetectionConfig = {}): Promise<{
  service: ImpeccableIntegrationService;
  combinedResult: CombinedResult;
  report: QualityReport;
}> {
  const service = getService();

  // Default configuration
  const detectionConfig: DetectionConfig = {
    detectionMode: config.detectionMode ?? "both",
    threshold: config.threshold ?? DEFAULT_THRESHOLD,
    cacheReuse: config.cacheReuse ?? true,
    sourceRoot: config.sourceRoot,
  };

  // Load detector (skill + WASM runtime) before any analysis — the pipeline
  // requires a loaded runtime (C2 lifecycle); idempotent when already loaded.
  const loadResult = await service.loadDetector(detectionConfig);
  if (loadResult.loadStatus === "error") {
    throw new Error(`Detector load failed: ${loadResult.message}`);
  }

  // Run the full detection pipeline
  const result = await service.runFullDetection(
    config.sourceRoot ?? process.cwd(),
    config.localhostUrl ?? (process.env[EnvConfig.LOCALHOST_DEV_SERVER_URL] || "http://localhost:5173"),
    config.urls ?? [],
    detectionConfig,
  );

  return {
    service,
    combinedResult: result.result,
    report: result.report,
  };
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