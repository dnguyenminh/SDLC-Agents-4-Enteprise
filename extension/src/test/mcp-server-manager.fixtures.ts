/**
 * Shared fixtures for McpServerManager unit tests (src/test — mocha-style).
 * Extracted from mcp-server-manager.test.ts so each test file stays ≤200 lines.
 */
import * as fs from "fs";
import * as path from "path";
import { EventEmitter } from "events";
import { Readable, Writable } from "stream";

/** Create the fake extension dir: mcp-server/http-entry.js + .code-intel. */
export function makeExtDir(tmpDir: string, name = "ext"): string {
  const extDir = path.join(tmpDir, name);
  const serverDir = path.join(extDir, "mcp-server");
  fs.mkdirSync(serverDir, { recursive: true });
  fs.writeFileSync(path.join(serverDir, "http-entry.js"), "// fake server");
  fs.mkdirSync(path.join(tmpDir, ".code-intel"), { recursive: true });
  return extDir;
}

/** Mock child process with configurable pid + kill behavior. */
export class MockProcess extends EventEmitter {
  pid: number;
  stdin = new Writable({ write: (_c: any, _e: any, cb: any) => { cb(); } });
  stdout = new Readable({ read() {} });
  stderr = new Readable({ read() {} });
  killBehavior: "silent" | "emit-exit";

  constructor(pid: number, killBehavior: "silent" | "emit-exit" = "silent") {
    super();
    this.pid = pid;
    this.killBehavior = killBehavior;
  }

  kill(_sig?: string): boolean {
    if (this.killBehavior === "emit-exit") {
      setTimeout(() => this.emit("exit", 0, _sig), 5);
    }
    return true;
  }
}
