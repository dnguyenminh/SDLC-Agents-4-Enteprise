/**
 * ConversationExporter — SA4E-369 (types + normalization)
 * Normalizes the webview tab model into a lossless export object.
 * Rendering lives in conversation-export-render.ts; IO in
 * conversation-export-io.ts. PURE modules — no vscode imports.
 *
 * WHY: the chatbox must export a whole conversation (or a single message)
 * so the user can hand the EXACT transcript — user prompts, assistant
 * replies, tool calls with FULL args/results, errors, thinking — to an
 * external AI for root-cause analysis. The SA4E-368 review-loop incident
 * (162 re-reads) was only diagnosable from the tool-call sequence, and
 * the user had no way to get that sequence out of the panel.
 *
 * Input contract — the webview tab model (`tab.messages`, chat.js KSA-240):
 *   { role: "user"|"assistant"|"error", content, timestamp?, nodeId?, thinking? }
 *   { role: "tool", content: "", toolData: { id, name, args, status, result,
 *     error?, duration?, timestamp } }
 */

export type ExportFormat = "markdown" | "json";

export interface ExportToolEntry {
  kind: "tool";
  name: string;
  args?: unknown;
  status?: string;
  result?: string;
  error?: string;
  duration?: number;
  timestamp?: string;
}

export interface ExportMessageEntry {
  kind: "user" | "assistant" | "error";
  content: string;
  nodeId?: string;
  thinking?: string;
  timestamp?: string;
}

export type ExportEntry = ExportToolEntry | ExportMessageEntry;

export interface ConversationExport {
  exportedAt: string;
  tab: { id: string; name: string };
  model: string;
  mode: string;
  messageCount: number;
  toolCallCount: number;
  entries: ExportEntry[];
}

/** Loose input shape (webview tab / single message) — normalized by buildConversationExport. */
export interface ExportTabInput {
  id?: string;
  name?: string;
  messages?: ReadonlyArray<Record<string, unknown>>;
}

export interface ExportMeta {
  model?: string;
  mode?: string;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function strOrU(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

/**
 * Normalize one webview tab-message into an export entry.
 * Unknown roles map to assistant (the tab model only stores the four kinds,
 * but a future role must never crash an export).
 */
function normalizeMessage(m: Record<string, unknown>): ExportEntry {
  if (m.role === "tool") {
    const td = (m.toolData ?? {}) as Record<string, unknown>;
    return {
      kind: "tool",
      name: str(td.name || "tool"),
      args: td.args,
      status: strOrU(td.status),
      result: strOrU(td.result),
      error: strOrU(td.error),
      duration: typeof td.duration === "number" ? td.duration : undefined,
      timestamp: strOrU(td.timestamp),
    };
  }
  const role = m.role;
  if (role === "user" || role === "error") {
    return {
      kind: role,
      content: str(m.content),
      timestamp: strOrU(m.timestamp),
    };
  }
  return {
    kind: "assistant",
    content: str(m.content),
    nodeId: strOrU(m.nodeId),
    thinking: strOrU(m.thinking),
    timestamp: strOrU(m.timestamp),
  };
}

/** Build the lossless export object from a webview tab (or a single-message slice). */
export function buildConversationExport(tab: ExportTabInput, meta: ExportMeta = {}): ConversationExport {
  const raw = Array.isArray(tab?.messages) ? (tab.messages as ReadonlyArray<Record<string, unknown>>) : [];
  const entries = raw
    .filter((m) => m && typeof m === "object")
    .map((m) => normalizeMessage(m));
  return {
    exportedAt: (meta.now ?? new Date()).toISOString(),
    tab: { id: str(tab?.id), name: str(tab?.name) },
    model: meta.model || "unknown",
    mode: meta.mode || "unknown",
    messageCount: entries.filter((e) => e.kind !== "tool").length,
    toolCallCount: entries.filter((e) => e.kind === "tool").length,
    entries,
  };
}

/** ASCII-folded, filesystem-safe slug (Vietnamese diacritics collapse to base letters). */
export function slugify(name: string): string {
  const folded = (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0110\u0111]/g, "d")
    .toLowerCase();
  const slug = folded.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "chat";
}

/** Default save name: `chat-{slug}-{YYYYMMDD-HHmmss}.{md|json}`. */
export function defaultExportFileName(tabName: string, format: ExportFormat, now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  const ext = format === "json" ? "json" : "md";
  return `chat-${slugify(tabName)}-${stamp}.${ext}`;
}
