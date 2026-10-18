/**
 * Singleton IdeSessionManager for the ide_* tools (SA4E-352).
 * Module-level mutable state lives here and only here.
 */
import { IdeSessionManager } from "../ide-session-manager";

let manager: IdeSessionManager | null = null;

export function getManager(): IdeSessionManager {
  if (!manager) {
    manager = new IdeSessionManager();
  }
  return manager;
}
