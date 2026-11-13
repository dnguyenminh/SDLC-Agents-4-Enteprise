/**
 * SA4E-393 Addendum 5 (E2.4) — drift guard: the generated extension copy of the
 * worktree-trust library must equal what scripts/sync-worktree-trust.mjs produces
 * from the backend source of truth.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SCRIPT = path.join(ROOT, "scripts", "sync-worktree-trust.mjs");
const BACKEND_LIB = path.join(ROOT, "backend", "src", "shared", "worktree-trust");

async function loadGenerator(): Promise<{ buildOutputs(root: string): Map<string, string> }> {
  return import(pathToFileURL(SCRIPT).href);
}

describe("worktree-trust sync (drift guard)", () => {
  it("every generated file matches the committed copy", async () => {
    const outputs = (await loadGenerator()).buildOutputs(ROOT);
    expect(outputs.size).toBeGreaterThan(0);
    for (const [rel, content] of outputs) {
      const abs = path.join(ROOT, rel);
      expect(fs.existsSync(abs), `missing generated file ${rel}`).toBe(true);
      expect(fs.readFileSync(abs, "utf8"), `drift in ${rel}`).toBe(content);
    }
  });

  it("covers every backend library file incl. admin-steps and trust-steps", async () => {
    const outputs = [...(await loadGenerator()).buildOutputs(ROOT).keys()].map((p) => p.replace(/\\/g, "/"));
    const libFiles = fs.readdirSync(BACKEND_LIB).filter((f) => f.endsWith(".ts"));
    expect(libFiles).toEqual(expect.arrayContaining(["admin-steps.ts", "trust-steps.ts"]));
    for (const f of libFiles) {
      expect(outputs).toContain(`extension/src/services/worktree-trust/${f}`);
    }
  });

  it("generated files carry the header and no .js import specifiers", async () => {
    for (const [rel, content] of (await loadGenerator()).buildOutputs(ROOT)) {
      expect(content.startsWith("/* GENERATED from "), rel).toBe(true);
      expect(content, rel).toContain("DO NOT EDIT");
      expect(content, rel).not.toMatch(/from '\.{1,2}\/[^']*\.js'/);
      expect(content, rel).not.toContain("\r");
    }
  });
});
