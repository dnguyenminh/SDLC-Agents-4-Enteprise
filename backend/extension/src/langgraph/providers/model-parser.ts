/**
 * Model response parser --- KSA-231
 */

import type { KiroModel } from "./model-registry";

export function parseModelsResponse(data: { data?: any[]; models?: any[] }): KiroModel[] {
  if (Array.isArray(data.data)) {
    return data.data.filter((m: any) => m.id).map((m: any) => ({
      id: m.id,
      displayName: m.display_name || m.displayName || m.id,
      provider: "kiro",
      contextWindow: m.contextWindow || 0,
      capabilities: { chat: m.capabilities?.chat ?? true, code: m.capabilities?.code ?? false, vision: m.capabilities?.vision ?? false },
      maxOutputTokens: m.maxOutputTokens || undefined,
    }));
  }
  if (!data.models || !Array.isArray(data.models)) { return []; }
  return data.models.filter((m: any) => m.id && m.displayName).map((m: any) => ({
    id: m.id,
    displayName: m.displayName || m.id,
    provider: m.provider || "unknown",
    capabilities: { chat: m.capabilities?.chat ?? true, code: m.capabilities?.code ?? false, vision: m.capabilities?.vision ?? false },
    contextWindow: m.contextWindow || 0,
    maxOutputTokens: m.maxOutputTokens || undefined,
  }));
}

export function modelsChanged(prev: KiroModel[], next: KiroModel[]): boolean {
  if (prev.length !== next.length) { return true; }
  const prevIds = new Set(prev.map(m => m.id));
  return next.some(m => !prevIds.has(m.id));
}
