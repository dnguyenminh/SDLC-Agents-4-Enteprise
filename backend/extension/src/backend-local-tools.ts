/**
 * Local tool execution layer for RemoteBackendClient.
 * Handles tools that execute locally (stream_write_file, embed_image).
 *
 * Base64 proxy logic has been extracted to services/Base64ProxyService.ts
 * following SRP — this file only handles local tool execution + definitions.
 */
import * as fs from "fs";
import * as path from "path";

export async function executeLocalTool(name: string, args: Record<string, unknown>): Promise<any> {
  if (name === "stream_write_file") return handleStreamWriteFile(args);
  if (name === "embed_image") return handleEmbedImage(args);
  return { isError: true, content: [{ type: "text", text: `Local tool '${name}' not implemented.` }] };
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

// --- Local tool implementations ---

function handleStreamWriteFile(args: Record<string, unknown>): any {
  const filePath = (args.file_path ?? args.path) as string;
  const content = args.content as string;
  const mode = (args.mode as string) || "write";
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

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
