/**
 * ProviderConfigCache — In-memory cache for ProviderConfigService.
 * Separated for SRP (SA4E-390).
 */

import type { ProfileTableRow } from "../shared/types/llm-profile.js";

export interface CachedState {
  profiles: ProfileTableRow[];
  activeProfileId: string | undefined;
  activeProfile: ProfileTableRow | undefined;
}

export class ProviderConfigCache {
  private cachedState: CachedState | null = null;
  private cacheVersion = 0;

  /** Get cached state or return null if stale. */
  get(): CachedState | null {
    return this.cachedState;
  }

  /** Set cached state and increment version. */
  set(state: CachedState): void {
    this.cachedState = state;
    this.cacheVersion++;
  }

  /** Invalidate cache. */
  invalidate(): void {
    this.cachedState = null;
    this.cacheVersion++;
  }

  /** Get cache version for change detection. */
  getVersion(): number {
    return this.cacheVersion;
  }
}