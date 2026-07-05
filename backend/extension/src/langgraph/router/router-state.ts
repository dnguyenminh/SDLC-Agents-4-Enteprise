/**
 * Router State — Multi-Graph Architecture
 * Router-specific state extensions for intent classification and subgraph routing.
 */

export type { PipelineIntent } from "../state";

/**
 * Confidence score from intent classification.
 * Used to decide whether regex match is sufficient or LLM fallback is needed.
 */
export interface IntentClassification {
  intent: import("../state").PipelineIntent;
  confidence: number; // 0.0–1.0
  source: "regex" | "llm";
}

/** Threshold below which we fall back to LLM classification */
export const CONFIDENCE_THRESHOLD = 0.8;
