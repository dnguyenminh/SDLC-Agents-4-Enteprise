/**
 * chat-model-picker.ts — Grouped model picker for the Chat window.
 * SA4E-389: Replaces the simple dropdown with a provider-grouped picker
 * showing only connected profiles' models. Selecting a model switches
 * both the active profile AND the model in one operation.
 */

export interface ModelPickerGroup {
  provider: string;
  items: ModelPickerItem[];
}

export interface ModelPickerItem {
  profileId: string;
  modelId: string;
  modelName: string;
  isFree: boolean;
}

/** Provider display labels. */
const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  lmstudio: "LM Studio",
  openrouter: "OpenRouter",
  ollama: "Ollama",
  onnx: "ONNX (Local)",
};

/** Create the grouped model picker HTML. */
export function createModelPickerHtml(groups: ModelPickerGroup[], currentModel: string, currentProfileId: string): string {
  if (groups.length === 0) {
    return '<div class="model-picker-empty">No models available. Add and test a profile first.</div>';
  }

  let html = '<div class="model-picker">';
  for (const group of groups) {
    const providerLabel = PROVIDER_LABELS[group.provider] || group.provider;
    html += '<div class="provider-group" data-provider="' + escapeHtml(group.provider) + '">';
    html += '<div class="provider-group-header">' + escapeHtml(providerLabel) + '</div>';
    html += '<div class="provider-group-items">';
    for (const item of group.items) {
      const isSelected = item.modelId === currentModel && item.profileId === currentProfileId;
      const freeBadge = item.isFree ? '<span class="free-badge">Free</span>' : '';
      html +=
        '<button class="model-item' + (isSelected ? ' active' : '') + '" ' +
        'data-profile-id="' + escapeHtml(item.profileId) + '" ' +
        'data-model-id="' + escapeHtml(item.modelId) + '" ' +
        'title="' + escapeHtml(item.modelName) + '">' +
        '<span class="model-item-name">' + escapeHtml(item.modelName) + '</span>' +
        freeBadge +
        '</button>';
    }
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

/** Escape HTML. */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/** Initialize the model picker in the chat webview. */
export function initModelPicker(
  modelBtn: HTMLButtonElement,
  modelLabel: HTMLElement,
  modelDropdown: HTMLElement,
  vscode: any,
  getGroups: () => Promise<ModelPickerGroup[]>,
  getCurrentState: () => Promise<{ currentModel: string; currentProfileId: string }>
): void {
  let isOpen = false;

  // Toggle dropdown
  modelBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (isOpen) {
      closePicker();
      return;
    }

    // Fetch fresh groups and current state
    const groups = await getGroups();
    const state = await getCurrentState();

    modelDropdown.innerHTML = createModelPickerHtml(groups, state.currentModel, state.currentProfileId);
    modelDropdown.classList.remove("hidden");
    isOpen = true;

    // Delegate click on model items
    modelDropdown.addEventListener("click", onModelClick);
  });

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (isOpen && !modelDropdown.contains(e.target as Node) && e.target !== modelBtn) {
      closePicker();
    }
  });

  function closePicker(): void {
    modelDropdown.classList.add("hidden");
    modelDropdown.removeEventListener("click", onModelClick);
    isOpen = false;
  }

  function onModelClick(e: Event): void {
    const btn = (e.target as HTMLElement).closest("button.model-item");
    if (!btn) return;

    const profileId = btn.dataset.profileId!;
    const modelId = btn.dataset.modelId!;

    // Send message to extension: switch profile + model in ONE operation
    vscode.postMessage({
      type: "chat:setModelAndProfile",
      profileId,
      model: modelId,
    });

    closePicker();
  }

  /** Update the model button label from extension state. */
  export function updateModelLabel(model: string, profileId: string, groups: ModelPickerGroup[]): void {
    let label = "Auto";
    if (model === "auto") {
      label = "Auto";
    } else {
      for (const group of groups) {
        const item = group.items.find((i) => i.modelId === model && i.profileId === profileId);
        if (item) {
          label = item.modelName + (item.isFree ? " (Free)" : "");
          break;
        }
      }
      // Fallback: use model ID
      if (label === "Auto" && model !== "auto") {
        label = model;
      }
    }
    modelLabel.textContent = label;
    modelBtn.title = model + " (" + profileId + ")";
  }
}