/**
 * ide_* tool spec types (SA4E-352).
 */
import type { IdeSessionManager } from "../ide-session-manager";

export type IdeHandler = (
  m: IdeSessionManager,
  args: Record<string, unknown>,
) => Promise<unknown>;

export interface IdeToolSpec {
  name: string;
  description: string;
  handler: IdeHandler;
  inputSchema: Record<string, unknown>;
}
