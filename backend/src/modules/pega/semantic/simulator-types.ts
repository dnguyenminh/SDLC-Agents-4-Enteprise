/** Shared simulator option/result/trace types (BR-18 extraction). */
export interface SimulationOptions {
  maxSteps?: number;
  collectTrace?: boolean;
  timeoutMs?: number;
}

export interface SimulationTrace {
  step: number;
  action: string;
  detail: string;
  timestamp: number;
}

export interface SimulationRequest {
  pxObjClass: string;
  json: Record<string, unknown>;
  inputClipboard?: Record<string, Record<string, unknown>>;
  options?: SimulationOptions;
}

export interface SimulationResult {
  success: boolean;
  outputClipboard?: Record<string, Record<string, unknown>>;
  trace: SimulationTrace[];
  errors: string[];
  executionTimeMs: number;
}
