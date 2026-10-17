/**
 * ConversationExport renderers — SA4E-369
 * Markdown + JSON rendering of the export object built by
 * conversation-exporter.ts. PURE module — no vscode imports.
 */
import type { ConversationExport, ExportEntry } from "./conversation-exporter";

/**
 * The safest fence for wrapping `text`: one backtick run LONGER than any
 * run inside the content (a tool result containing ``` must never break
 * the export's structure — the whole point is feeding verbatim output
 * to an external AI).
 */
export function fenceFor(text: string): string {
  let max = 2;
  const re = /`{3,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length > max) max = m[0].length;
  }
  return "`".repeat(max + 1);
}

/** Local HH:MM:SS of an ISO timestamp; empty string when absent/invalid. */
export function clockOf(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Pretty-print tool args for the Request block (stable key order). */
function prettyArgs(args: unknown): string {
  if (args == null) return "{}";
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Render ONE entry as Markdown (used for the full export and per-message copy). */
export function renderEntryMarkdown(entry: ExportEntry): string {
  const ts = clockOf(entry.timestamp);
  const tsTag = ts ? `[${ts}] ` : "";

  if (entry.kind === "tool") {
    const duration = typeof entry.duration === "number" ? ` (${formatDuration(entry.duration)})` : "";
    const status = entry.status ? entry.status : "unknown";
    const head = `### \ud83d\udd27 Tool: ${entry.name} \u2014 ${status}${duration}${ts ? ` [${ts}]` : ""}`;

    const argsFence = fenceFor(prettyArgs(entry.args));
    const request = `**Request**\n\n${argsFence}json\n${prettyArgs(entry.args)}\n${argsFence}`;

    const body = entry.error ?? entry.result ?? "(no output)";
    const resFence = fenceFor(body);
    const label = entry.error ? "**Response (error)**" : "**Response**";
    const response = `${label}\n\n${resFence}\n${body}\n${resFence}`;
    return `${head}\n\n${request}\n\n${response}`;
  }

  if (entry.kind === "user") {
    return `## ${tsTag}\ud83d\udc64 User\n\n${entry.content}`;
  }

  if (entry.kind === "error") {
    return `## ${tsTag}\u26a0\ufe0f Error\n\n${entry.content}`;
  }

  // assistant
  const node = entry.nodeId ? ` \u2014 ${entry.nodeId}` : "";
  const head = `## ${tsTag}\ud83e\udd16 Assistant${node}`;
  const parts: string[] = [];
  if (entry.thinking) {
    const f = fenceFor(entry.thinking);
    parts.push(`**Thinking**\n\n${f}\n${entry.thinking}\n${f}`);
  }
  parts.push(entry.content);
  return `${head}\n\n${parts.join("\n\n")}`;
}

/** Render the whole conversation as a single Markdown document. */
export function renderConversationMarkdown(cx: ConversationExport): string {
  const header = [
    `# Chat export \u2014 ${cx.tab.name || "(unnamed tab)"}`,
    "",
    `- **Exported:** ${cx.exportedAt}`,
    `- **Model:** ${cx.model} \u00b7 **Mode:** ${cx.mode}`,
    `- **Messages:** ${cx.messageCount} (${cx.toolCallCount} tool calls)`,
    "",
    "---",
    "",
  ].join("\n");
  if (cx.entries.length === 0) {
    return header + "_(no messages)_\n";
  }
  return header + cx.entries.map(renderEntryMarkdown).join("\n\n---\n\n") + "\n";
}

/** Render the whole conversation as lossless pretty-printed JSON. */
export function renderConversationJson(cx: ConversationExport): string {
  return JSON.stringify(cx, null, 2) + "\n";
}
