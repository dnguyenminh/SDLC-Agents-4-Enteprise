/**
 * ModelPickerGroups — grouping logic for model picker.
 * Extracted from ModelPickerPopup for SRP and line limits.
 */

import { ModelItem } from "./model-picker-popup.js";

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  lmstudio: "LM Studio",
  openrouter: "OpenRouter",
  ollama: "Ollama",
  onnx: "ONNX",
};

export interface ModelGroup {
  providerLabel: string;
  models: ModelItem[];
}

/**
 * Group models by provider label.
 */
export function groupModelsByProvider(models: ModelItem[]): ModelGroup[] {
  const groups = new Map<string, ModelItem[]>();

  for (const model of models) {
    const providerLabel = PROVIDER_LABELS[model.providerId] || model.provider;
    if (!groups.has(providerLabel)) {
      groups.set(providerLabel, []);
    }
    groups.get(providerLabel)!.push(model);
  }

  return Array.from(groups.entries()).map(([providerLabel, models]) => ({
    providerLabel,
    models,
  }));
}

/**
 * Get provider label for a provider ID.
 */
export function getProviderLabel(providerId: string): string {
  return PROVIDER_LABELS[providerId] || providerId;
}

/**
 * Render grouped models as HTML string.
 */
export function renderGroupedModels(groups: ModelGroup[], escapeHtml: (str: string) => string): string {
  let html = "";
  for (const group of groups) {
    html += `<div class="model-group"><h5>${escapeHtml(group.providerLabel)}</h5><div class="model-group-list">`;
    for (const model of group.models) {
      html += renderModelItem(model, false, escapeHtml);
    }
    html += `</div></div>`;
  }
  return html;
}

/**
 * Render a single model item as HTML.
 */
function renderModelItem(model: ModelItem, isRecent: boolean, escapeHtml: (str: string) => string): string {
  const freeBadge = model.isFree
    ? `<span class="model-badge free-badge">Free</span>`
    : model.rateMultiplier && model.rateMultiplier > 0
      ? `<span class="model-badge paid-badge">${model.rateMultiplier}x</span>`
      : "";

  return `
    <button class="model-item${isRecent ? " recent" : ""}" data-model-id="${model.id}" type="button" tabindex="0">
      <span class="model-item-name">${escapeHtml(model.name)}</span>
      <span class="model-item-provider">${escapeHtml(getProviderLabel(model.providerId))}</span>
      ${freeBadge}
    </button>
  `;
}

/**
 * Render recent models as HTML string.
 */
export function renderRecentModels(models: ModelItem[], escapeHtml: (str: string) => string): string {
  return models.map((m) => renderModelItem(m, true, escapeHtml)).join("");
}