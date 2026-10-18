/**
 * AuthManager — the collaborator surface the extracted flows need.
 * Built once in the AuthManager constructor with live closures over the
 * manager's private state, so state reads/writes always hit the manager.
 */

import type * as vscode from "vscode";
import type { AuthState } from "./auth-types";

export interface AuthManagerContext {
  readonly secrets: vscode.SecretStorage;
  getBaseUrl(): string;
  getState(): AuthState;
  getTokenExpiresAt(): number | null;
  setTokenExpiresAt(value: number | null): void;
  getTokenAcquiredAt(): number | null;
  setTokenAcquiredAt(value: number | null): void;
  getCachedToken(): string | null;
  setCachedToken(value: string | null): void;
  getRefreshTokenValue(): string | null;
  setRefreshTokenValue(value: string | null): void;
  transitionTo(newState: AuthState): void;
  scheduleAccessRefresh(): void;
  clearAccessRefreshTimer(): void;
  fireTokenRefreshed(token: string): void;
  startRefreshTimer(): void;
  stopRefreshTimer(): void;
  refreshToken(): Promise<void>;
}
