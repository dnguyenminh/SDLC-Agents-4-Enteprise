/**
 * Unit tests for McpServerManager — SERVER_CONSTANTS, onStatusChange events,
 * port/pid properties, error types.
 *
 * Strategy: We stub child_process.spawn to test McpServerManager behavior
 * without real processes. (Split from mcp-server-manager.test.ts —
 * constants/events/properties concern.)
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import * as mockVscode from "./mocks/vscode";
import { SERVER_CONSTANTS, McpServerNotRunningError, McpBundleMissingError } from "../types";
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
      const extDir = makeExtDir(tmpDir);

      const cp = require("child_process");

      const mockProc = new MockProcess(33333);
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
