/**
 * SA4E-356 — SCAN-01 (schema descriptions, AC-4) + SCAN-02 (N-8 remnants).
 * (STC SCAN-01, SCAN-02; TDD §11.2/§11.5.)
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  getLocalToolDefinitions,
  getVisibleLocalToolDefinitions,
} from "../backend-local-tools";
import { FILE_PATH_SCHEMA_DESCRIPTION } from "../services/PathResolver";
import { Base64ProxyService } from "../services/Base64ProxyService";
import { registerJiraAttachmentTools } from "../mcp/atlassian/jira-attachment-tools";
import { registerConfluenceContentTools } from "../mcp/atlassian/confluence-content-tools";
import { createTestServer, postMcp } from "./wrapper-server.helpers";

const mockAtlassianClient = { request: async () => ({ status: 200, data: {} }) } as any;

function filePathProps(defs: Array<{ name: string; inputSchema: any }>) {
  return defs
    .map((d) => ({ name: d.name, filePath: d.inputSchema?.properties?.file_path }))
    .filter((e) => e.filePath !== undefined);
}

describe("SCAN-01 inputSchema descriptions carry the resolution rule (AC-4)", () => {
  // STC: SCAN-01 step 1 — static surfaces (a) all defs, (b) visible defs.
  it("static tool definitions describe file_path with the workspace rule", () => {
    registerJiraAttachmentTools(mockAtlassianClient);
    registerConfluenceContentTools(mockAtlassianClient);
    for (const defs of [getLocalToolDefinitions(), getVisibleLocalToolDefinitions()]) {
      for (const entry of filePathProps(defs as any)) {
        expect(String(entry.filePath.description).toLowerCase()).toContain("workspace");
      }
    }
    // Audit rows #1–#5 static texts equal the shared constant (M-4, no drift).
    const byName = new Map(getLocalToolDefinitions().map((d: any) => [d.name, d]));
    expect((byName.get("stream_write_file") as any).inputSchema.properties.file_path.description).toBe(
      FILE_PATH_SCHEMA_DESCRIPTION,
    );
    expect((byName.get("embed_image") as any).inputSchema.properties.file_path.description).toBe(
      FILE_PATH_SCHEMA_DESCRIPTION,
    );
    expect((byName.get("jira_attach_file") as any).inputSchema.properties.file_path.description).toBe(
      FILE_PATH_SCHEMA_DESCRIPTION,
    );
    expect((byName.get("confluence_add_attachment") as any).inputSchema.properties.file_path.description).toBe(
      FILE_PATH_SCHEMA_DESCRIPTION,
    );
  });

  // STC: SCAN-01 step 2 — rewrite surface (c): M-1 always overwrites (both
  // verified holes: mem_ingest_file without description, drawio_export_png
  // with the stale "reference only" text); M-3 keeps type/required-shape.
  it("rewriteSchemasForLlm always overwrites file_path (M-1) and keeps shape (M-3)", () => {
    const proxy = new Base64ProxyService("/ws");
    proxy.detectFromToolList([
      {
        name: "mem_ingest_file",
        description: "Ingest a file.",
        inputSchema: {
          type: "object",
          properties: {
            file_path: { type: "string" },
            content_base64: { type: "string" },
          },
          required: ["content_base64"],
        },
      },
      {
        name: "drawio_export_png",
        description: "Export. Returns output_base64. file_path is reference only.",
        inputSchema: {
          type: "object",
          properties: {
            file_path: { type: "string", description: "reference only" },
            content_base64: { type: "string" },
          },
          required: ["content_base64"],
        },
      },
    ]);
    const out = proxy.rewriteSchemasForLlm([
      {
        name: "mem_ingest_file",
        description: "Ingest a file.",
        inputSchema: {
          type: "object",
          properties: {
            file_path: { type: "string" },
            content_base64: { type: "string" },
          },
          required: ["content_base64"],
        },
      },
      {
        name: "drawio_export_png",
        description: "Export. Returns output_base64. file_path is reference only.",
        inputSchema: {
          type: "object",
          properties: {
            file_path: { type: "string", description: "reference only" },
            content_base64: { type: "string" },
          },
          required: ["content_base64"],
        },
      },
    ]);
    for (const tool of out) {
      const props = tool.inputSchema!.properties as Record<string, any>;
      expect(props.file_path.description).toBe(FILE_PATH_SCHEMA_DESCRIPTION);
      expect(props.content_base64).toBeUndefined();
      expect(tool.inputSchema!.required).toContain("file_path");
      expect(tool.inputSchema!.required).not.toContain("content_base64");
      expect(tool.inputSchema!.type).toBe("object");
    }
  });

  // STC: SCAN-01 step 3 — find_tools surface (d) funnels through the rewrite.
  it("find_tools responses carry the rule (via WrapperServer)", async () => {
    const { server, deps } = createTestServer();
    await server.start(0);
    const port = server.listeningPort!;
    try {
      // Seed proxy detection via tools/list (production ordering — the
      // established pattern in wrapper-server.test.ts beforeEach).
      await postMcp(port, { jsonrpc: "2.0", id: 0, method: "tools/list", params: {} });
      deps.restCallToolMock.result = {
        content: [{ type: "text", text: JSON.stringify({ tools: deps.restGetToolsMock.tools }) }],
      };
      const res = await postMcp(port, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "find_tools", arguments: { query: "drawio" } },
      });
      const parsed = JSON.parse(res.body.result.content[0].text);
      const drawio = parsed.tools.find((t: any) => t.name === "drawio_export_png");
      expect(String(drawio.inputSchema.properties.file_path.description).toLowerCase()).toContain(
        "workspace",
      );
      const names = parsed.tools.map((t: any) => t.name);
      expect(names).toContain("stream_write_file");
    } finally {
      await server.stop();
    }
  });

  // STC: SCAN-01 step 4 — output_path params keep rule + derived-info suffix.
  it("output_path descriptions keep the rule plus derived-info suffix (M-2)", () => {
    registerJiraAttachmentTools(mockAtlassianClient);
    const byName = new Map(getLocalToolDefinitions().map((d: any) => [d.name, d]));
    const embedOut = (byName.get("embed_image") as any).inputSchema.properties.output_path
      .description as string;
    expect(embedOut).toContain(FILE_PATH_SCHEMA_DESCRIPTION);
    expect(embedOut).toContain("-embedded");

    const proxy = new Base64ProxyService("/ws");
    proxy.detectFromToolList([
      {
        name: "drawio_export_png",
        description: "Export. Returns output_base64.",
        inputSchema: {
          type: "object",
          properties: {
            file_path: { type: "string" },
            content_base64: { type: "string" },
          },
          required: ["content_base64"],
        },
      },
    ]);
    const [rewritten] = proxy.rewriteSchemasForLlm([
      {
        name: "drawio_export_png",
        description: "Export. Returns output_base64.",
        inputSchema: {
          type: "object",
          properties: {
            file_path: { type: "string" },
            content_base64: { type: "string" },
          },
          required: ["content_base64"],
        },
      },
    ]);
    const drawioOut = (rewritten.inputSchema!.properties as Record<string, any>).output_path
      .description as string;
    expect(drawioOut).toContain(FILE_PATH_SCHEMA_DESCRIPTION);
    expect(drawioOut).toContain(".drawio→.png");
    expect(drawioOut).toContain(".out appended");
  });
});

describe("SCAN-02 no raw-path resolution remnants (N-8, BR-01)", () => {
  const SRC = path.join(__dirname, "..");
  const FILES = [
    "backend-local-tools.ts",
    "proxy/ToolProxy.ts",
    "services/Base64ProxyService.ts",
    "services/WrapperServer.ts",
    "remote-backend-client.ts",
    "mcp/atlassian/jira-attachment-tools.ts",
    "mcp/atlassian/confluence-content-tools.ts",
  ].map((f) => path.join(SRC, f));

  // Mirrors scripts/check-pathresolver-n8.sh patterns P1/P2 (vitest form so the
  // gate also runs on the Windows CI matrix without bash).
  it("has no single-argument resolve(<...file_path...>) (N-8a)", () => {
    const p1 = /(^|[^A-Za-z0-9_$])(path\.resolve|resolve|rs)\s*\([^,()]*file_path[^,()]*\)/;
    for (const file of FILES) {
      const text = fs.readFileSync(file, "utf-8");
      for (const [i, line] of text.split("\n").entries()) {
        expect(`${path.basename(file)}:${i + 1}:${line}`).not.toMatch(p1);
      }
    }
  });

  it("has no raw fs.*(<...file_path...>) (N-8b, C-4)", () => {
    const p2 =
      /(readFileSync|writeFileSync|appendFileSync|createReadStream|createWriteStream|promises\.readFile|promises\.writeFile|promises\.appendFile)\s*\([^,()]*file_path[^,()]*\)/;
    for (const file of FILES) {
      const text = fs.readFileSync(file, "utf-8");
      for (const [i, line] of text.split("\n").entries()) {
        expect(`${path.basename(file)}:${i + 1}:${line}`).not.toMatch(p2);
      }
    }
  });

  // STC: SCAN-02 step 3 — ToolProxy private resolveWorkspacePath is deleted.
  it("ToolProxy delegates to the shared helper (no private resolver)", () => {
    const text = fs.readFileSync(path.join(SRC, "proxy", "ToolProxy.ts"), "utf-8");
    expect(text).not.toContain("private resolveWorkspacePath");
    expect(text).toContain("resolveWorkspacePath");
  });

  // STC: SCAN-02 step 4 — string + provider constructor modes agree.
  it("Base64ProxyService string and provider modes agree (back-compat)", () => {
    const dir = fs.mkdtempSync(path.join(__dirname, ".tmp-scan-modes"));
    try {
      fs.writeFileSync(path.join(dir, "m.txt"), "mode parity", "utf-8");
      const tools = [
        {
          name: "drawio_export_png",
          description: "Export. Returns output_base64.",
          inputSchema: {
            type: "object",
            properties: { file_path: { type: "string" }, content_base64: { type: "string" } },
            required: ["content_base64"],
          },
        },
      ];
      const fromString = new Base64ProxyService(dir);
      fromString.detectFromToolList(tools);
      const fromProvider = new Base64ProxyService(() => dir);
      fromProvider.detectFromToolList(tools);
      const a = fromString.proxyInput("drawio_export_png", { file_path: "m.txt" });
      const b = fromProvider.proxyInput("drawio_export_png", { file_path: "m.txt" });
      expect(a.content_base64).toBe(b.content_base64);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
