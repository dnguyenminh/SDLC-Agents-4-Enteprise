/**
 * Local tool execution + base64 proxy layer for RemoteBackendClient.
 * Handles tools that execute locally AND transparent base64 file I/O proxy.
 *
 * Architecture: LLM → Extension(9181) → Backend(48721)
 * - LLM sends file_path in args
 * - Extension reads file → base64, forwards content_base64 to backend
 * - Backend processes content_base64, returns output_base64
 * - Extension writes output_base64 to local file (output_path)
 */
import * as fs from "fs";
import * as path from "path";

/** Tools requiring file_path → content_base64 proxy (read local file, send base64). */
const BASE64_INPUT_TOOLS = new Set([
  "mem_ingest_file", "drawio_export_png", "drawio_auto_layout",
]);

/** Tools that may return output_base64 in response (write to output_path). */
const BASE64_OUTPUT_TOOLS = new Set([
  "drawio_export_png",
]);

export async function executeLocalTool(name: string, args: Record<string, unknown>): Promise<any> {
  if (name === "stream_write_file") { return handleStreamWriteFile(args); }
  if (name === "embed_image") { return handleEmbedImage(args); }
  return { isError: true, content: [{ type: "text", text: `Local tool '${name}' not implemented in wrapper.` }] };
}

/**
 * Proxy layer: intercept file_path args → read file → base64 for backend.
 * LLM sends file_path; extension transparently converts to content_base64.
 */
export function wrapToolArguments(name: string, args: Record<string, unknown>): Record<string, unknown> {
  if (!BASE64_INPUT_TOOLS.has(name)) return args;
  const filePath = args.file_path as string | undefined;
  if (!filePath || args.content_base64) return args;
  const newArgs = { ...args };
  try {
    const buf = fs.readFileSync(filePath);
    newArgs.content_base64 = buf.toString("base64");
  } catch (err: any) {
    throw new Error(`Failed to read local file ${filePath}: ${err.message}`);
  }
  return newArgs;
}

/**
 * Proxy layer: intercept output_base64 from backend response → write local file.
 * Returns modified result with file_path instead of output_base64.
 */
export function handleBase64Response(
  name: string, args: Record<string, unknown>, result: any
): any {
  if (!BASE64_OUTPUT_TOOLS.has(name)) return result;
  if (!result || result.isError) return result;
  const text = extractTextContent(result);
  if (!text) return result;
  try {
    const parsed = JSON.parse(text);
    if (!parsed.output_base64) return result;
    const outputPath = resolveOutputPath(args);
    if (!outputPath) return result;
    const buf = Buffer.from(parsed.output_base64, "base64");
    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(outputPath, buf);
    const updated = { ...parsed, file_path: outputPath, size_bytes: buf.length };
    delete updated.output_base64;
    return replaceTextContent(result, JSON.stringify(updated));
  } catch { return result; }
}

/** MIME types by image extension for data-URI embedding. */
const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
};

/** Matches markdown image references: ![alt](path "optional title"). */
const MD_IMAGE_RE = /!\[([^\]]*)\]\(\s*([^)\s]+)(\s+"[^"]*")?\s*\)/g;

function handleEmbedImage(args: Record<string, unknown>): any {
  const filePath = (args.file_path ?? args.path) as string;
  if (!filePath || typeof filePath !== "string") {
    return { isError: true, content: [{ type: "text", text: "Invalid arguments: 'file_path' required." }] };
  }
  const outputPath = (args.output_path as string) || defaultEmbeddedPath(filePath);
  try {
    const { output, embedded, skipped } = embedMarkdownImages(
      fs.readFileSync(filePath, "utf-8"), path.dirname(filePath)
    );
    fs.writeFileSync(outputPath, output, "utf-8");
    return { isError: false, content: [{ type: "text", text: `Embedded ${embedded} image(s), skipped ${skipped} → ${outputPath}` }] };
  } catch (err: any) {
    return { isError: true, content: [{ type: "text", text: `Failed: ${err.message}` }] };
  }
}

function defaultEmbeddedPath(filePath: string): string {
  const ext = path.extname(filePath);
  return filePath.slice(0, filePath.length - ext.length) + "-embedded" + (ext || ".md");
}

function embedMarkdownImages(markdown: string, baseDir: string): { output: string; embedded: number; skipped: number } {
  let embedded = 0, skipped = 0;
  const output = markdown.replace(MD_IMAGE_RE, (match, alt, src, title) => {
    if (/^(https?:|data:)/i.test(src)) { skipped++; return match; }
    const dataUri = imageToDataUri(path.resolve(baseDir, decodeURI(src)));
    if (!dataUri) { skipped++; return match; }
    embedded++;
    return `![${alt}](${dataUri}${title || ""})`;
  });
  return { output, embedded, skipped };
}

function imageToDataUri(imagePath: string): string | null {
  try {
    const mime = IMAGE_MIME[path.extname(imagePath).toLowerCase()] || "application/octet-stream";
    return `data:${mime};base64,${fs.readFileSync(imagePath).toString("base64")}`;
  } catch { return null; }
}

/** Tool definitions for local tools, injected into tools/list responses. */
export function getLocalToolDefinitions(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
  return [
    {
      name: "stream_write_file",
      description: "Write or append content to a local workspace file (creates parent dirs).",
      inputSchema: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Target file path" },
          content: { type: "string", description: "Content to write" },
          mode: { type: "string", enum: ["write", "append"], default: "write" },
        },
        required: ["file_path", "content"],
      },
    },
    {
      name: "embed_image",
      description: "Replace local image refs in markdown with base64 data URIs.",
      inputSchema: {
        type: "object",
        properties: {
          file_path: { type: "string", description: "Path to source markdown file" },
          output_path: { type: "string", description: "Output path (default: <name>-embedded.md)" },
        },
        required: ["file_path"],
      },
    },
  ];
}

function handleStreamWriteFile(args: Record<string, unknown>): any {
  const filePath = (args.file_path ?? args.path) as string;
  const content = args.content as string;
  const mode = args.mode as string || "write";
  if (!filePath || typeof content !== "string") {
    return { isError: true, content: [{ type: "text", text: "'file_path' and 'content' required." }] };
  }
  try {
    ensureDir(path.dirname(filePath));
    if (mode === "append") {
      fs.appendFileSync(filePath, content, "utf-8");
      return { isError: false, content: [{ type: "text", text: `Appended to: ${filePath}` }] };
    }
    fs.writeFileSync(filePath, content, "utf-8");
    return { isError: false, content: [{ type: "text", text: `Wrote file: ${filePath}` }] };
  } catch (err: any) {
    return { isError: true, content: [{ type: "text", text: `Failed to write ${filePath}: ${err.message}` }] };
  }
}

// --- Helper functions ---

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
}

function resolveOutputPath(args: Record<string, unknown>): string | null {
  if (args.output_path) return args.output_path as string;
  const fp = args.file_path as string | undefined;
  if (!fp) return null;
  return fp.replace(/\.drawio$/, ".png");
}

function extractTextContent(result: any): string | null {
  if (typeof result === "string") return result;
  if (result?.content?.[0]?.text) return result.content[0].text;
  return null;
}

function replaceTextContent(result: any, newText: string): any {
  if (typeof result === "string") return newText;
  if (result?.content?.[0]?.text) {
    return { ...result, content: [{ type: "text", text: newText }] };
  }
  return result;
}
