/**
 * DetectorRuntime — owns the loaded Impeccable skill + WASM detector state
 * (UC-001, BR-01..03, SECURITY-REVIEW C2). Extracted from the integration
 * service so the facade stays small; behavior is unchanged.
 */
import { DetectionError, createDetectionError, EnvConfig, LoadInstance, SkillAPI, WasmDetectorRuntime } from "./types";
import { loadWasmDetector, readWasmBinary, validateWasmConstraints } from "./wasm.loader";
import { friendlyError } from "./error-text";
import { logRedacted } from "./path-redactor";

const DEFAULT_WASM_PATH = "./wasm/detector.wasm";

function newInstanceId(): string {
  return `inst_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** WASM binary path from environment (per DPG.md) or the default. */
function wasmPath(): string {
  return process.env[EnvConfig.IMPPECABLE_SKILL_PATH] || DEFAULT_WASM_PATH;
}

/** Holder of the skill API, the WASM runtime and the instance id. */
export class DetectorRuntime {
  private skillApi: SkillAPI | null = null;
  private wasmRuntime: WasmDetectorRuntime | null = null;
  private id = "";

  /** Loaded WASM runtime, or null before a successful load. */
  get wasm(): WasmDetectorRuntime | null { return this.wasmRuntime; }

  /** Identifier of the current load instance ("" before the first load). */
  get instanceId(): string { return this.id; }

  /**
   * Load the skill package and WASM detector; idempotent when already loaded.
   * C6: failures become a `loadStatus: "error"` result with a sanitized message.
   * @param root - workspace root used to redact paths in message and logs
   */
  async load(root?: string): Promise<LoadInstance> {
    if (this.skillApi?.isLoaded()) {
      this.id = this.skillApi.getInstanceId();
      return this.result("success", "Impeccable detector already loaded and cached");
    }
    try {
      this.installSkill(root);
      await this.loadWasmBinary(root);
      this.id = newInstanceId();
      return this.result("success", "Impeccable detector loaded successfully");
    } catch (error: any) {
      const message = friendlyError(error, root);
      logRedacted("error", `Load detector error: ${message}`, root);
      this.id = newInstanceId();
      return this.result("error", message);
    }
  }

  /** Forget everything (testing / new pipeline run). */
  reset(): void {
    this.skillApi = null;
    this.wasmRuntime = null;
    this.id = "";
  }

  private result(loadStatus: "success" | "error", message: string): LoadInstance {
    return { instanceId: this.id, loadStatus, message };
  }

  /** Install the skill facade (production: require('impeccable-skill')). */
  private installSkill(root?: string): void {
    this.skillApi = {
      loadWasm: async (buffer: Buffer) => (this.wasmRuntime = await loadWasmDetector(buffer)),
      isLoaded: () => this.skillApi !== null && this.wasmRuntime !== null,
      getInstanceId: () => this.id || "inst_mock",
    };
    logRedacted("log", "Impeccable skill package loaded", root);
  }

  /** Read, validate (C2) and instantiate the WASM binary. */
  private async loadWasmBinary(root?: string): Promise<void> {
    try {
      const buffer = readWasmBinary(wasmPath());
      if (!validateWasmConstraints(buffer)) {
        throw createDetectionError(DetectionError.WASM_INCOMPATIBLE,
          "WASM binary does not satisfy memory-only sandbox constraints");
      }
      this.wasmRuntime = await loadWasmDetector(buffer);
      logRedacted("log", "WASM detector runtime loaded successfully", root);
    } catch (error: any) {
      logRedacted("error", `Failed to load WASM binary: ${error.message}`, root);
      this.wasmRuntime = null;
      throw error;
    }
  }
}
