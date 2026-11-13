/**
 * SA4E-393 mục 8 — characterization test for utils/runtime-settings.ts.
 * Baseline of CURRENT behavior (no behavior change): expected to be green on
 * existing code. Not a red→green fix test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  getRuntimeSettingsPath, readRuntimeSettings, writeRuntimeSettings, clearRuntimeSettings,
} from "../utils/runtime-settings";

let ws: string;
beforeEach(() => { ws = fs.mkdtempSync(path.join(os.tmpdir(), "rt-settings-")); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(ws, { recursive: true, force: true }); });

describe("runtime-settings (characterization)", () => {
  it("path is <ws>/.code-intel/settings.json", () => {
    expect(getRuntimeSettingsPath(ws)).toBe(path.join(ws, ".code-intel", "settings.json"));
  });

  it("write stores mcpUrl/host/port/pid/workspace/startedAt (+version when given)", () => {
    writeRuntimeSettings(ws, { port: 9181, version: "1.2.3" });
    const s = JSON.parse(fs.readFileSync(getRuntimeSettingsPath(ws), "utf-8"));
    expect(s).toMatchObject({
      mcpUrl: "http://127.0.0.1:9181/mcp", host: "127.0.0.1", port: 9181,
      pid: process.pid, workspace: ws, version: "1.2.3",
    });
    expect(Number.isNaN(Date.parse(s.startedAt))).toBe(false);
    expect(readRuntimeSettings(ws)?.port).toBe(9181);
  });

  it("omits version when not given; keeps a concrete host; maps 0.0.0.0 and :: to 127.0.0.1", () => {
    writeRuntimeSettings(ws, { port: 1, host: "localhost" });
    expect(readRuntimeSettings(ws)).not.toHaveProperty("version");
    expect(readRuntimeSettings(ws)?.mcpUrl).toBe("http://localhost:1/mcp");
    for (const h of ["0.0.0.0", "::"]) {
      writeRuntimeSettings(ws, { port: 2, host: h });
      expect(readRuntimeSettings(ws)?.host).toBe("127.0.0.1");
    }
  });

  it("clear removes the file; clear on missing file is a no-op; read of missing → null", () => {
    writeRuntimeSettings(ws, { port: 3 });
    clearRuntimeSettings(ws);
    expect(fs.existsSync(getRuntimeSettingsPath(ws))).toBe(false);
    expect(() => clearRuntimeSettings(ws)).not.toThrow();
    expect(readRuntimeSettings(ws)).toBeNull();
  });

  it("known gap (documented in ANALYSIS): clear deletes the file regardless of owner pid", () => {
    fs.mkdirSync(path.join(ws, ".code-intel"));
    fs.writeFileSync(getRuntimeSettingsPath(ws), JSON.stringify({ pid: 999999, port: 1 }));
    clearRuntimeSettings(ws);
    expect(fs.existsSync(getRuntimeSettingsPath(ws))).toBe(false);
  });

  it("corrupt JSON → read returns null and warns (does not throw)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fs.mkdirSync(path.join(ws, ".code-intel"));
    fs.writeFileSync(getRuntimeSettingsPath(ws), "{not json");
    expect(readRuntimeSettings(ws)).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});
