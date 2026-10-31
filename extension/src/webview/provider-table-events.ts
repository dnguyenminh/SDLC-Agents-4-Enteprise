/**
 * ProviderTableEvents — Event binding for ProviderTable.
 * Separated from ProviderTable for SRP (SA4E-390).
 */

import type { ProviderProfile, ProviderStatus } from "./provider-table-row-renderer.js";

export interface ProviderTableCallbacks {
  onEdit: (providerId: string) => void;
  onTest: (providerId: string) => void;
  onDelete: (providerId: string) => void;
  onAdd: () => void;
}

/** Bind event listeners for action buttons and add provider button. */
export function bindTableEvents(
  container: HTMLElement,
  callbacks: ProviderTableCallbacks
): void {
  // Add provider button
  const addBtn = container.querySelector("#add-provider-btn");
  addBtn?.addEventListener("click", () => callbacks.onAdd());

  // Action buttons in rows
  container.querySelectorAll(".provider-actions .icon-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const target = e.currentTarget as HTMLElement;
      const action = target.dataset.action;
      const row = target.closest("tr") as HTMLElement;
      const providerId = row.dataset.providerId;

      if (!providerId) { return; }

      switch (action) {
        case "edit":
          callbacks.onEdit(providerId);
          break;
        case "test":
          callbacks.onTest(providerId);
          break;
        case "delete":
          callbacks.onDelete(providerId);
          break;
      }
    });
  });
}

/** Render the complete table HTML. */
export function renderTable(
  container: HTMLElement,
  profiles: ProviderProfile[],
  renderRowFn: (profile: ProviderProfile, index: number) => string,
  renderEmptyRowFn: () => string
): void {
  const rowsHtml = profiles
    .map((profile, index) => renderRowFn(profile, index))
    .join("");

  container.innerHTML = `
    <div class="provider-table-wrapper">
      <div class="table-toolbar">
        <h3>LLM Providers</h3>
        <button class="btn primary" id="add-provider-btn">+ Add Provider</button>
      </div>
      <div class="table-container">
        <table class="provider-table" role="grid">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Status</th>
              <th scope="col">API Key</th>
              <th scope="col">Base URL</th>
              <th scope="col">Model</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || renderEmptyRowFn()}
          </tbody>
        </table>
      </div>
    </div>
  `;
}