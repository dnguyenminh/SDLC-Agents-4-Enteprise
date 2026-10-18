/**
 * Unit tests for McpServerManager (HTTP Streamable transport)
 * Covers: spawn, kill, invokeTool
 *
 * Strategy: We stub child_process.spawn and global fetch to test
 * McpServerManager behavior without real processes or HTTP servers.
 * (Split from mcp-server-manager.test.ts — spawn/kill/invoke concern.)
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import * as mockVscode from "./mocks/vscode";
import { getNonce } from "../mcp-server-manager";
import { makeExtDir, MockProcess } from "./mcp-server-manager.fixtures";

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
      const extDir = makeExtDir(tmpDir);

      const cp = require("child_process");

      const mockProc = new MockProcess(12345);
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
      const extDir = makeExtDir(tmpDir);

      const cp = require("child_process");

      const mockProc = new MockProcess(11111, "emit-exit");
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
      const extDir = makeExtDir(tmpDir);

      const cp = require("child_process");

      const mockProc = new MockProcess(22222);
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
});
