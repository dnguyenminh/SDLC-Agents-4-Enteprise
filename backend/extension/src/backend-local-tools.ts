/**
 * Local tool execution logic for RemoteBackendClient.
 * Handles tools that should NOT be forwarded to the backend.
 */
import * as fs from "fs";
import * as path from "path";

export async function executeLocalTool(name: string, args: Record<string, unknown>): Promise<any> {
  if (name === "stream_write_file") { return handleStreamWriteFile(args); }
  return { isError: true, content: [{ type: "text", text: `Local tool '${name}' not implemented in wrapper.` }] };
}

function handleStreamWriteFile(args: Record<string, unknown>): any {
  const filePath = args.path as string;
  const content = args.content as string;
  const mode = args.mode as string || "write";
  if (!filePath || typeof content !== "string") {
    return { isError: true, content: [{ type: "text", text: "Invalid arguments: 'path' and 'content' required." }] };
  }
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
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

export function wrapToolArguments(name: string, args: Record<string, unknown>): Record<string, unknown> {
  const newArgs = { ...args };
  if (name === "mem_ingest_file") {
    const filePath = args.file_path as string;
    if (filePath) {
      try { newArgs.content = fs.readFileSync(filePath, "utf-8"); }
      catch (err: any) { throw new Error(`Failed to read local file ${filePath}: ${err.message}`); }
    }
  }
  return newArgs;
}
