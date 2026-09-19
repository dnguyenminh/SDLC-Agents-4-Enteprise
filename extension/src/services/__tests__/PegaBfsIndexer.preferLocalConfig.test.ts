/**
 * SA4E-301 — Config unit tests: package.json declaration parse (TC-UT-01) +
 * readPipelineConfig config reads (TC-UT-02..05: default-true when absent,
 * false when false, true when explicit, per-workspace scoping).
 * The vscode module is aliased to src/test/mocks/vscode.ts (vitest.config.ts);
 * workspace.getConfiguration is monkeypatched per test (existing mock style).
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { readPipelineConfig } from "../PegaBfsIndexer";

const CONFIG_KEY = "pega.preferLocalOnChecksumMatch";

describe("kiroSdlc.pega.preferLocalOnChecksumMatch — package.json declaration (TC-UT-01)", () => {
  it("declares the setting: type boolean, default true, non-empty English description", () => {
    const pkgPath = path.resolve(__dirname, "..", "..", "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const decl = pkg.contributes?.configuration?.properties?.[`kiroSdlc.${CONFIG_KEY}`];
    expect(decl).toBeDefined();
    expect(decl.type).toBe("boolean");
    expect(decl.default).toBe(true);
    expect(typeof decl.description).toBe("string");
    expect(decl.description.length).toBeGreaterThan(0);
  });
});

describe("readPipelineConfig — config reads (TC-UT-02..05)", () => {
  const originalGetConfiguration = (vscode.workspace as any).getConfiguration;
  afterEach(() => {
    (vscode.workspace as any).getConfiguration = originalGetConfiguration;
  });

  /** Monkeypatch the aliased vscode mock's getConfiguration (existing test style). */
  function setConfig(values: Record<string, unknown>): void {
    (vscode.workspace as any).getConfiguration = (section?: string) => ({
      get: (key: string, def?: unknown) => (section === "kiroSdlc" && key in values ? values[key] : def),
    });
  }

  it("TC-UT-02: default true when the key is absent", () => {
    setConfig({});
    expect(readPipelineConfig().preferLocalOnChecksumMatch).toBe(true);
  });

  it("TC-UT-03: false when explicitly false", () => {
    setConfig({ [CONFIG_KEY]: false });
    expect(readPipelineConfig().preferLocalOnChecksumMatch).toBe(false);
  });

  it("TC-UT-04: true when explicitly true", () => {
    setConfig({ [CONFIG_KEY]: true });
    expect(readPipelineConfig().preferLocalOnChecksumMatch).toBe(true);
  });

  it("TC-UT-05: per-workspace scoping — kiroSdlc section consulted; different workspace configs differ", () => {
    const sections: string[] = [];
    (vscode.workspace as any).getConfiguration = (section?: string) => {
      sections.push(section ?? "");
      return {
        get: (key: string, def?: unknown) => (section === "kiroSdlc" && key === CONFIG_KEY ? false : def),
      };
    };
    // Workspace A: setting OFF
    expect(readPipelineConfig().preferLocalOnChecksumMatch).toBe(false);
    // Workspace B (different config store): back to default
    setConfig({});
    expect(readPipelineConfig().preferLocalOnChecksumMatch).toBe(true);
    // The config service is always consulted with the kiroSdlc section.
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.every((s) => s === "kiroSdlc")).toBe(true);
  });
});
