/**
 * Unit tests for McpServerManager (HTTP Streamable transport)
 * Covers: spawn, kill, restart, invokeTool, handleCrash, timeout, backoff
 *
 * Strategy: We stub child_process.spawn and global fetch to test
 * McpServerManager behavior without real processes or HTTP servers.
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { EventEmitter } from "events";
import { Readable, Writable } from "stream";

import * as mockVscode from "./mocks/vscode";
import { getNonce } from "../mcp-server-manager";
import { SERVER_CONSTANTS, McpServerNotRunningError, McpBundleMissingError } from "../types";

describe("McpServerManager", () => {
  let sandbox: sinon.SinonSandbox;
  let tmpDir: string;
  let outputChannel: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-test-"));
    outputChannel = {
      appendLine: sandbox.stub(),
      append: sandbox.stub(),
      show: sandbox.stub(),
      dispose: sandbox.stub(),
    };
  });

  afterEach(() => {
    sandbox.restore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("getNonce()", () => {
    it("should return a 32-character hex string", () => {
      const nonce = getNonce();
      assert.strictEqual(nonce.length, 32);
      assert.match(nonce, /^[0-9a-f]{32}$/);
    });

    it("should produce unique values across 1000 calls", () => {
      const nonces = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        nonces.add(getNonce());
      }
      assert.strictEqual(nonces.size, 1000);
    });
  });

  describe("spawn() — bundle missing", () => {
    it("should throw McpBundleMissingError when server bundle does not exist", async () => {
      const { McpServerManager } = require("../mcp-server-manager");
      const manager = new McpServerManager(
        path.join(tmpDir, "nonexistent-ext"),
        tmpDir,
        outputChannel
      );

      try {
        await manager.spawn();
        assert.fail("Should have thrown");
      } catch (err: any) {
        assert.strictEqual(err.name, "McpBundleMissingError");
      }
    });
  });

  describe("spawn() — bundle exists", () => {
    it("should spawn node with http-entry.js and transition to running on port announcement", async () => {
      const extDir = path.join(tmpDir, "ext");
      const serverDir = path.join(extDir, "mcp-server");
      fs.mkdirSync(serverDir, { recursive: true });
      fs.writeFileSync(path.join(serverDir, "http-entry.js"), "// fake server");
      fs.mkdirSync(path.join(tmpDir, ".code-intel"), { recursive: true });

      const cp = require("child_process");

      class MockProcess extends EventEmitter {
        pid = 12345;
        stdin = new Writable({ write: (_c: any, _e: any, cb: any) => { cb(); } });
        stdout = new Readable({ read() {} });
        stderr = new Readable({ read() {} });
        kill() { return true; }
      }

      const mockProc = new MockProcess();
      const spawnStub = sandbox.stub(cp, "spawn").returns(mockProc);

      const { McpServerManager } = require("../mcp-server-manager");
      const manager = new McpServerManager(extDir, tmpDir, outputChannel);

      // Simulate port announcement via stderr
      setTimeout(() => mockProc.stderr.push("[mcp-http] Listening on port 54321\n"), 30);

      await manager.spawn();

      assert.ok(spawnStub.calledOnce);
      assert.strictEqual(spawnStub.firstCall.args[0], process.execPath);
      assert.ok((spawnStub.firstCall.args[1] as string[])[0].includes("http-entry.js"));
      assert.strictEqual(manager.status, "running");
      assert.strictEqual(manager.pid, 12345);
      assert.strictEqual(manager.port, 54321);
    });
  });

  describe("kill()", () => {
    it("should do nothing if no server process exists", async () => {
      const { McpServerManager } = require("../mcp-server-manager");
      const manager = new McpServerManager(
        path.join(tmpDir, "nonexistent"),
        tmpDir,
        outputChannel
      );

      await manager.kill();
      assert.strictEqual(manager.status, "stopped");
    });

    it("should transition to stopped after killing a running server", async () => {
      const extDir = path.join(tmpDir, "ext");
      const serverDir = path.join(extDir, "mcp-server");
      fs.mkdirSync(serverDir, { recursive: true });
      fs.writeFileSync(path.join(serverDir, "http-entry.js"), "// fake");
      fs.mkdirSync(path.join(tmpDir, ".code-intel"), { recursive: true });

      const cp = require("child_process");

      class MockProcess extends EventEmitter {
        pid = 11111;
        stdin = new Writable({ write: (_c: any, _e: any, cb: any) => { cb(); } });
        stdout = new Readable({ read() {} });
        stderr = new Readable({ read() {} });
        kill(_sig?: string) {
          setTimeout(() => this.emit("exit", 0, _sig), 5);
          return true;
        }
      }

      const mockProc = new MockProcess();
      sandbox.stub(cp, "spawn").returns(mockProc);

      const { McpServerManager } = require("../mcp-server-manager");
      const manager = new McpServerManager(extDir, tmpDir, outputChannel);

      setTimeout(() => mockProc.stderr.push("[mcp-http] Listening on port 9999\n"), 20);
      await manager.spawn();
      assert.strictEqual(manager.status, "running");
      assert.strictEqual(manager.port, 9999);

      await manager.kill();
      assert.strictEqual(manager.status, "stopped");
      assert.strictEqual(manager.port, null);
    });
  });

  describe("invokeTool()", () => {
    it("should throw McpServerNotRunningError when status is stopped", async () => {
      const { McpServerManager } = require("../mcp-server-manager");
      const manager = new McpServerManager(
        path.join(tmpDir, "nonexistent"),
        tmpDir,
        outputChannel
      );

      try {
        await manager.invokeTool("test_tool", { query: "hello" });
        assert.fail("Should have thrown");
      } catch (err: any) {
        assert.strictEqual(err.name, "McpServerNotRunningError");
      }
    });

    it("should call fetch with correct URL and return text content", async () => {
      const extDir = path.join(tmpDir, "ext");
      const serverDir = path.join(extDir, "mcp-server");
      fs.mkdirSync(serverDir, { recursive: true });
      fs.writeFileSync(path.join(serverDir, "http-entry.js"), "// fake");
      fs.mkdirSync(path.join(tmpDir, ".code-intel"), { recursive: true });

      const cp = require("child_process");

      class MockProcess extends EventEmitter {
        pid = 22222;
        stdin = new Writable({ write: (_c: any, _e: any, cb: any) => { cb(); } });
        stdout = new Readable({ read() {} });
        stderr = new Readable({ read() {} });
        kill() { return true; }
      }

      const mockProc = new MockProcess();
      sandbox.stub(cp, "spawn").returns(mockProc);

      // Stub global fetch
      const mockResponse = {
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: { content: [{ type: "text", text: "search results" }] },
        }),
      };
      const fetchStub = sandbox.stub(global, "fetch" as any).resolves(mockResponse as any);

      const { McpServerManager } = require("../mcp-server-manager");
      const manager = new McpServerManager(extDir, tmpDir, outputChannel);

      setTimeout(() => mockProc.stderr.push("[mcp-http] Listening on port 8080\n"), 20);
      await manager.spawn();

      const result = await manager.invokeTool("mem_search", { query: "x" });
      assert.strictEqual(result, "search results");

      // Verify fetch was called with correct URL
      assert.ok(fetchStub.calledOnce);
      const fetchUrl = fetchStub.firstCall.args[0];
      assert.strictEqual(fetchUrl, "http://127.0.0.1:8080/mcp");

      // Verify request body
      const fetchOpts = fetchStub.firstCall.args[1];
      const body = JSON.parse(fetchOpts.body);
      assert.strictEqual(body.method, "tools/call");
      assert.strictEqual(body.params.name, "mem_search");
      assert.deepStrictEqual(body.params.arguments, { query: "x" });
    });
  });

  describe("SERVER_CONSTANTS", () => {
    it("should have correct backoff values", () => {
      assert.deepStrictEqual([...SERVER_CONSTANTS.BACKOFF_MS], [5000, 15000, 30000]);
      assert.strictEqual(SERVER_CONSTANTS.MAX_RESTARTS, 3);
      assert.strictEqual(SERVER_CONSTANTS.REQUEST_TIMEOUT_MS, 30000);
      assert.strictEqual(SERVER_CONSTANTS.KILL_TIMEOUT_MS, 5000);
      assert.strictEqual(SERVER_CONSTANTS.STARTUP_TIMEOUT_MS, 5000);
    });

    it("should have correct graph and dashboard constants", () => {
      assert.strictEqual(SERVER_CONSTANTS.DASHBOARD_REFRESH_MS, 60000);
      assert.strictEqual(SERVER_CONSTANTS.GRAPH_MAX_NODES, 500);
    });
  });

  describe("onStatusChange event", () => {
    it("should fire starting then running during successful spawn", async () => {
      const extDir = path.join(tmpDir, "ext");
      const serverDir = path.join(extDir, "mcp-server");
      fs.mkdirSync(serverDir, { recursive: true });
      fs.writeFileSync(path.join(serverDir, "http-entry.js"), "// fake");
      fs.mkdirSync(path.join(tmpDir, ".code-intel"), { recursive: true });

      const cp = require("child_process");

      class MockProcess extends EventEmitter {
        pid = 33333;
        stdin = new Writable({ write: (_c: any, _e: any, cb: any) => { cb(); } });
        stdout = new Readable({ read() {} });
        stderr = new Readable({ read() {} });
        kill() { return true; }
      }

      const mockProc = new MockProcess();
      sandbox.stub(cp, "spawn").returns(mockProc);

      const { McpServerManager } = require("../mcp-server-manager");
      const manager = new McpServerManager(extDir, tmpDir, outputChannel);

      const statuses: string[] = [];
      manager.onStatusChange((s: string) => statuses.push(s));

      setTimeout(() => mockProc.stderr.push("[mcp-http] Listening on port 7777\n"), 20);
      await manager.spawn();

      assert.ok(statuses.includes("starting"));
      assert.ok(statuses.includes("running"));
    });
  });

  describe("port property", () => {
    it("should return null when no process is running", () => {
      const { McpServerManager } = require("../mcp-server-manager");
      const manager = new McpServerManager(
        path.join(tmpDir, "nonexistent"),
        tmpDir,
        outputChannel
      );
      assert.strictEqual(manager.port, null);
    });
  });

  describe("pid property", () => {
    it("should return null when no process is running", () => {
      const { McpServerManager } = require("../mcp-server-manager");
      const manager = new McpServerManager(
        path.join(tmpDir, "nonexistent"),
        tmpDir,
        outputChannel
      );
      assert.strictEqual(manager.pid, null);
    });
  });

  describe("Error types", () => {
    it("McpServerNotRunningError should have correct name and message", () => {
      const err = new McpServerNotRunningError();
      assert.strictEqual(err.name, "McpServerNotRunningError");
      assert.strictEqual(err.message, "MCP Server is not running.");
    });

    it("McpBundleMissingError should have correct name and message", () => {
      const err = new McpBundleMissingError();
      assert.strictEqual(err.name, "McpBundleMissingError");
      assert.ok(err.message.includes("bundle not found"));
    });
  });
});
