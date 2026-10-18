// Unit tests for ide-launch-helpers validation and polling
// SA4E-373
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  IdeLaunchError,
  validateUserDataDir,
  validatePort,
  validateTimeoutSeconds,
  waitForDevtoolsPort,
  resolveBinary,
} from "../ide-launch-helpers";

describe("ide-launch-helpers validation (SA4E-373)", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sa4e-test-"));

  afterAll(() => {
    // cleanup files created during tests
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("validateUserDataDir passes for writable dir", () => {
    expect(() => validateUserDataDir(tmpDir)).not.toThrow();
  });

  it("validateUserDataDir throws for inaccessible path", () => {
    expect(() => validateUserDataDir("/root/no-access-123")).toThrow(IdeLaunchError);
  });

  it("validateUserDataDir rejects path outside sandbox", () => {
    const outside = path.join(os.homedir(), "outside-sandbox-test");
    expect(() => validateUserDataDir(outside, os.tmpdir())).toThrow(IdeLaunchError);
  });

  it("validateUserDataDir rejects path with null byte", () => {
    const badPath = tmpDir + "\0evil";
    expect(() => validateUserDataDir(badPath)).toThrow(IdeLaunchError);
  });

  it("validateUserDataDir accepts path within sandbox", () => {
    const inside = path.join(tmpDir, "subdir");
    fs.mkdirSync(inside);
    expect(() => validateUserDataDir(inside, tmpDir)).not.toThrow();
  });

  it("validatePort accepts valid range", () => {
    expect(() => validatePort(1024)).not.toThrow();
    expect(() => validatePort(65535)).not.toThrow();
  });

  it("validatePort rejects out of range", () => {
    expect(() => validatePort(1023)).toThrow(IdeLaunchError);
    expect(() => validatePort(65536)).toThrow(IdeLaunchError);
    expect(() => validatePort(-1)).toThrow(IdeLaunchError);
  });

  it("validateTimeoutSeconds defaults to 60", () => {
    expect(validateTimeoutSeconds(undefined)).toBe(60);
  });

  it("validateTimeoutSeconds rejects >300", () => {
    expect(() => validateTimeoutSeconds(301)).toThrow(IdeLaunchError);
  });

  it("validateTimeoutSeconds rejects <=0", () => {
    expect(() => validateTimeoutSeconds(0)).toThrow(IdeLaunchError);
  });

  it("resolveBinary rejects non-whitelisted override path", () => {
    const fakePath = path.join(os.tmpdir(), "fake-ide-binary");
    fs.writeFileSync(fakePath, "binary");
    expect(() => resolveBinary("kiro", fakePath)).toThrow(IdeLaunchError);
    fs.rmSync(fakePath);
  });

  it("resolveBinary rejects path with null byte", () => {
    expect(() => resolveBinary("kiro", "/usr/bin/kiro\0")).toThrow(IdeLaunchError);
  });
});

describe("waitForDevtoolsPort polling (SA4E-373)", () => {
  it("returns explicit port immediately without polling", async () => {
    const port = await waitForDevtoolsPort("/tmp", { explicitPort: 9222, timeoutMs: 1000 });
    expect(port).toBe("9222");
  });

  it("detects port file within timeout", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sa4e-wait-"));
    // create file after short delay
    setTimeout(() => {
      fs.writeFileSync(path.join(dir, "DevToolsActivePort"), "9223\n");
    }, 20);

    const port = await waitForDevtoolsPort(dir, { timeoutMs: 2000 });
    expect(port).toBe("9223");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("times out if port never appears", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sa4e-timeout-"));
    await expect(waitForDevtoolsPort(dir, { timeoutMs: 100 })).rejects.toThrow(IdeLaunchError);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
