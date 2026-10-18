/**
 * SA4E-356 — SCAN-02 (N-8 raw-path resolution remnants).
 * (STC SCAN-02; TDD §11.2/§11.5. Split from schema-description-scan.test.ts.)
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { Base64ProxyService } from "../services/Base64ProxyService";

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
