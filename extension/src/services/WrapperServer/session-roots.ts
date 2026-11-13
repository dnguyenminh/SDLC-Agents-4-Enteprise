/**
 * session-roots — SA4E-406 A6: MCP session workspace binding.
 *
 * On `initialize` the caller MAY declare its workspace root via
 * `params.clientInfo.workspaceRoot` (also accepted top-level as
 * `params.workspaceRoot`). The root is validated with the A7 parents rule
 * (./root-trust) and stored for the session lifetime; every tools/call on
 * that session resolves RELATIVE file_path against the SESSION ROOT first
 * (rootSource "session"), before the workspace-folder candidates (A8).
 *
 * Keying uses what the transport already provides — NO new session framework:
 *   1. the standard `Mcp-Session-Id` header (assigned by this server at
 *      initialize when a root binds; compliant clients echo it back), and
 *   2. a per-connection map keyed by the TCP socket (stateless clients on a
 *      keep-alive connection).
 * An UNSET root ⇒ behaviour byte-identical to before (no header, no binding).
 */
import * as vscode from "vscode";
import { sanitizeLogText } from "../PathResolver";
import { admitDeclaredRoot, type RootTrustSource } from "../root-trust";

/** What the transport gives us per request (no new framework). */
export interface McpSessionKey {
  /** Echoed `Mcp-Session-Id` header (server-assigned at initialize). */
  sessionId?: string;
  /** The TCP socket — stable per keep-alive connection. */
  socket?: object;
}

/** Result of handling a declared root at initialize time. */
export interface BindOutcome {
  /** Assigned when a root was declared (bound OR rejected) — echoed in the response. */
  sessionId?: string;
  /** True when the declared root was admitted and bound. */
  bound?: boolean;
  /** Actionable A7 rejection message when binding failed. */
  error?: string;
}

const MAX_SESSIONS = 128; // bound the header-keyed map (evict oldest)

export class McpSessionRoots {
  private readonly byId = new Map<string, string>();
  private readonly bySocket = new WeakMap<object, string>();
  private nextId = 1;

  /** Server-assigned MCP session id (issued ONLY when a root binds). */
  newSessionId(): string {
    return `sa4e-${Date.now().toString(36)}-${this.nextId++}`;
  }

  /** Bind an ALREADY-ADMITTED root for this session/connection lifetime. */
  bind(key: McpSessionKey, root: string): void {
    if (key.sessionId) {
      if (this.byId.size >= MAX_SESSIONS) {
        const oldest = this.byId.keys().next().value;
        if (oldest !== undefined) this.byId.delete(oldest);
      }
      this.byId.set(key.sessionId, root);
    }
    if (key.socket) this.bySocket.set(key.socket, root);
  }

  /** Bound root for this request: header id first, then the connection. */
  lookup(key: McpSessionKey): string | undefined {
    if (key.sessionId && this.byId.has(key.sessionId)) return this.byId.get(key.sessionId);
    if (key.socket) return this.bySocket.get(key.socket);
    return undefined;
  }
}

/**
 * Read the caller-declared root from an initialize params object
 * (clientInfo.workspaceRoot, else top-level workspaceRoot).
 */
export function extractDeclaredSessionRoot(params: any): string | undefined {
  const candidates = [params?.clientInfo?.workspaceRoot, params?.workspaceRoot];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() !== "") return c;
  }
  return undefined;
}

/**
 * Bind-time handler (A6/A7): validate the declared root, store it, emit the
 * bind audit line (sanitized root + the trust source that admitted it).
 * A rejected root leaves the session UNBOUND — tools/call falls back to the
 * existing behaviour.
 */
export function bindSessionRoot(
  registry: McpSessionRoots,
  key: McpSessionKey,
  params: any,
  outputChannel: vscode.OutputChannel,
): BindOutcome {
  const declared = extractDeclaredSessionRoot(params);
  if (declared === undefined) return {}; // unset root ⇒ behaviour unchanged
  const outcome = admitDeclaredRoot(declared);
  if (!outcome.ok) {
    outputChannel.appendLine(`[WrapperServer] Session root REJECTED: ${outcome.message}`);
    return { error: outcome.message };
  }
  const sessionId = registry.newSessionId();
  registry.bind({ ...key, sessionId }, outcome.normalized);
  const trust: RootTrustSource = outcome.trustSource;
  outputChannel.appendLine(
    `[WrapperServer] Session root bound: ${sanitizeLogText(outcome.normalized)} (trust=${trust})`,
  );
  return { sessionId, bound: true };
}

/** Response annotation for the initialize result (only when a root was declared). */
export function sessionRootResultAnnotation(outcome: BindOutcome): Record<string, unknown> {
  if (outcome.sessionId === undefined && outcome.bound === undefined && outcome.error === undefined) {
    return {}; // nothing declared — keep the response byte-identical
  }
  return {
    workspaceRoot: outcome.bound
      ? { bound: true, sessionId: outcome.sessionId }
      : { bound: false, error: outcome.error ?? "declared root was not bound" },
  };
}
