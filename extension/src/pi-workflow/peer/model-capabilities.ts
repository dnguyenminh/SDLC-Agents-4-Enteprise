/**
 * SA4E-391 — peer model capability detection.
 *
 * peer_list must tell the asking agent WHICH peer tabs can read images, so it
 * can delegate "read this image" to a vision-capable tab instead of guessing.
 * The pi harness has no portable per-model vision flag for arbitrary local
 * (LM Studio / Ollama) models, so we derive a `vision` capability from the
 * model id/name using well-known vision-model markers. This is a published
 * hint the agent reasons over — not a hard guarantee.
 */

/** Substrings that mark a vision/multimodal model (case-insensitive). */
const VISION_MARKERS: readonly string[] = [
  '-vl', 'vl-', 'vl_', 'vision', 'llava', 'bakllava', 'moondream',
  'qwen-vl', 'qwen2-vl', 'qwen2.5-vl', 'gpt-4o', 'gpt-4.1', 'gpt-4-vision',
  'claude-3', 'claude-sonnet', 'claude-opus', 'claude-haiku', 'gemini',
  'pixtral', 'internvl', 'minicpm-v', 'phi-3-vision', 'phi-3.5-vision',
  'llama-3.2-vision', 'llama3.2-vision', 'cogvlm', 'idefics', 'florence',
];

/** True when the model id/name looks vision-capable (multimodal image input). */
export function modelSupportsVision(modelId?: string): boolean {
  if (!modelId) return false;
  const id = modelId.toLowerCase();
  return VISION_MARKERS.some((m) => id.includes(m));
}

/** The capability token published in peer_list for vision-capable tabs. */
export const VISION_CAPABILITY = 'vision';

/**
 * Derive the capability list for a registered peer from its model id.
 * Returns ['vision'] for a vision model, [] otherwise. Extend here as more
 * capability signals (e.g. tool-use tiers) become available.
 */
export function capabilitiesForModel(modelId?: string): string[] {
  return modelSupportsVision(modelId) ? [VISION_CAPABILITY] : [];
}

/**
 * SA4E-391: merge agent-declared capability tags with model-derived ones into
 * a single lowercased, de-duplicated list for peer_list. Agent tags come
 * first (authored intent), model tags (e.g. 'vision') are appended.
 */
export function mergeCapabilities(agentTags?: string[], modelTags?: string[]): string[] {
  const out: string[] = [];
  for (const tag of [...(agentTags ?? []), ...(modelTags ?? [])]) {
    const t = String(tag || '').trim().toLowerCase();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}
