/**
 * Provider Table Component — Renders the LLM provider configuration table.
 * 6 columns: Name, Status, API Key (masked), Base URL, Model, Actions.
 * Data sourced from `sdlcAgents.llm.profiles` via ProviderConfigService.
 * SA4E-390: Split into ProviderTableRowRenderer and ProviderTableEvents for SRP.
 */

import { renderTable, bindTableEvents } from "./provider-table-events.js";
import { renderRow, renderEmptyRow, type ProviderProfile, type ProviderStatus, type ProviderTableCallbacks } from "./provider-table-row-renderer.js";

/**
 * ProviderTable — renders and manages the provider configuration table.
 * Delegates rendering to ProviderTableRowRenderer and events to ProviderTableEvents.
 */
export class ProviderTable {
  private container: HTMLElement;
  private callbacks: ProviderTableCallbacks;
  private profiles: ProviderProfile[] = [];

  constructor(container: HTMLElement, callbacks: ProviderTableCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.render();
  }

  /** Update the table with new provider profiles. */
  setProfiles(profiles: ProviderProfile[]): void {
    this.profiles = profiles;
    this.render();
  }

  /** Render the complete table HTML. */
  private render(): void {
    renderTable(
      this.container,
      this.profiles,
      renderRow,
      renderEmptyRow
    );
    bindTableEvents(this.container, this.callbacks);
  }
}

export { type ProviderProfile, type ProviderStatus, type ProviderTableCallbacks } from "./provider-table-row-renderer.js";