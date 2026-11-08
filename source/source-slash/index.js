"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImpeccableIntegrationService = void 0;
exports.registerDesignGateCommand = registerDesignGateCommand;
exports.runDetection = runDetection;
const integration_service_1 = require("./integration.service");
Object.defineProperty(exports, "ImpeccableIntegrationService", { enumerable: true, get: function () { return integration_service_1.ImpeccableIntegrationService; } });
const types_1 = require("./types");
// Singleton service instance
let impeccableService = null;
/**
 * Get the singleton ImpeccableIntegrationService instance.
 * Creates it on first access if not already created.
 */
function getService() {
    if (!impeccableService) {
        impeccableService = new integration_service_1.ImpeccableIntegrationService();
    }
    return impeccableService;
}
/**
 * Register the design-gate command with the slash menu.
 * This is called from registerAll() in the slash command controller.
 */
function registerDesignGateCommand() {
    slashMenu.register("design-gate-run", async (ctx) => {
        const service = getService();
        const payload = {
            detectionMode: "both",
            threshold: parseFloat(process.env[types_1.EnvConfig.QUALITY_GATE_THRESHOLD] || "0.8"),
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
async function runDetection(config = {}) {
    const service = getService();
    // Set workspace root from environment if available
    const workspaceRoot = process.env[types_1.EnvConfig.WORKSPACE_ROOT];
    if (workspaceRoot) {
        // The service will pick this up via getWorkspaceRoot()
    }
    // Default configuration
    const detectionConfig = {
        detectionMode: config.detectionMode ?? "both",
        threshold: config.threshold ?? DEFAULT_THRESHOLD,
        cacheReuse: config.cacheReuse ?? true,
        sourceRoot: config.sourceRoot,
    };
    // Run the full detection pipeline
    const result = await service.runFullDetection(config.sourceRoot ?? process.cwd(), config.localhostUrl ?? process.env[types_1.EnvConfig.LOCALHOST_DEV_SERVER_URL] || "http://localhost:5173", config.urls ?? [], detectionConfig);
    return {
        service,
        combinedResult: result.result,
        report: result.report,
    };
}
// Reference to slashMenu for command registration
// This would be imported from the controller in the actual extension
// export const slashMenu = require("../controller").slashMenu;
// Default export for module system compatibility
exports.default = {
    registerDesignGateCommand,
    runDetection,
    getService,
};
//# sourceMappingURL=index.js.map