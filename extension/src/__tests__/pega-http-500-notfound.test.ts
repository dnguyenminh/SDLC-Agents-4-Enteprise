/**
 * PegaHttpClient — HTTP 500 "does not exist" body reclassification.
 *
 * Pega Platform occasionally returns HTTP 500 with a body like
 * `{"error":"Class RULE-... does not exist"}` when a rule/class cannot be
 * resolved, instead of the correct 404. Without special handling, this
 * aborts the entire indexing crawl in `PegaCrawlHelper.fetchRulesInParallel`.
 *
 * These tests lock in the "reclassify 500-with-not-found-body as
 * `Rule not found`" behavior in both `getRuleByInsKey` and
 * `queryRuleByTriple`, and confirm real 500s (with non-not-found bodies)
 * still surface as `HTTP 500 ... Server Error`.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";
import { PegaHttpClient } from "../services/PegaHttpClient";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue: unknown) => {
        if (key === "pegaEndpoint") return "http://localhost:8080/prweb";
        if (key === "pegaUsername") return "SSA@TGB";
        return defaultValue;
      }),
    })),
    workspaceFolders: [{ uri: { fsPath: "C:\\work\\pega-project" } }],
  },
}));

vi.mock("../extension", () => ({ setProjectId: vi.fn(), _projectId: "" }));

function mockSecrets(): vscode.SecretStorage {
  return {
    get: vi.fn(async () => "secret"),
    store: vi.fn(),
    delete: vi.fn(),
  } as unknown as vscode.SecretStorage;
}

/** Build a minimal Response-like object for the global fetch stub. */
function makeResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 500 ? "Internal Server Error" : "",
    headers: { get: () => null },
    text: vi.fn(async () => body),
    json: vi.fn(async () => JSON.parse(body)),
  } as unknown as Response;
}

describe("PegaHttpClient HTTP 500 reclassification", () => {
  let client: PegaHttpClient;
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    client = new PegaHttpClient(mockSecrets());
  });

  describe("getRuleByInsKey", () => {
    it("reclassifies HTTP 500 with 'does not exist' body as Rule not found", async () => {
      const insKey = "RULE-OBJ-REPORT-DEFINITION FECREDIT-BASE-CA-DATA-TEMP_REPORT TEMPREPORT #20241202T023115.247 GMT";
      const errorBody = JSON.stringify({
        error: `Class RULE-OBJ-REPORT-DEFINITION FECREDIT-BASE-CA-DATA-TEMP_REPORT#20241202T023115.247GMT does not exist`,
      });
      fetchMock.mockResolvedValue(makeResponse(500, errorBody));

      await expect(client.getRuleByInsKey(insKey)).rejects.toThrow(/Rule not found/);
      // Original Pega reason is surfaced so the crawler log still shows why.
      await expect(client.getRuleByInsKey(insKey)).rejects.toThrow(/does not exist/);
    });

    it("keeps HTTP 500 with generic error body as a real Server Error", async () => {
      const insKey = "RULE-OBJ-ACTIVITY MYAPP-DATA-CASE MYACTIVITY";
      // Real server outage — body is HTML or an opaque message, no not-found keywords.
      fetchMock.mockResolvedValue(
        makeResponse(500, "<html><body>Internal server error — request timed out</body></html>"),
      );

      await expect(client.getRuleByInsKey(insKey)).rejects.toThrow(/HTTP 500/);
      await expect(client.getRuleByInsKey(insKey)).rejects.not.toThrow(/Rule not found/);
    });

    it("includes the request URL in real 500 error messages for easier debugging", async () => {
      const insKey = "RULE-OBJ-ACTIVITY MYAPP-DATA-CASE MYACTIVITY";
      fetchMock.mockResolvedValue(makeResponse(500, "server exploded"));

      await expect(client.getRuleByInsKey(insKey)).rejects.toThrow(/\/rules\/instance/);
    });
  });

  describe("queryRuleByTriple", () => {
    it("reclassifies HTTP 500 with 'does not exist' body as Rule not found for triple", async () => {
      const errorBody = JSON.stringify({
        error: "Class MYAPP-DATA-BROKEN does not exist",
      });
      fetchMock.mockResolvedValue(makeResponse(500, errorBody));

      await expect(
        client.queryRuleByTriple("Rule-Obj-Activity", "MyApp-Data-Broken", "SomeActivity"),
      ).rejects.toThrow(/Rule not found for triple/);
    });

    it("keeps HTTP 500 with generic error body as a real Server Error", async () => {
      fetchMock.mockResolvedValue(makeResponse(500, "gateway timeout"));

      await expect(
        client.queryRuleByTriple("Rule-Obj-Activity", "MyApp-Data-Case", "MyActivity"),
      ).rejects.toThrow(/HTTP 500/);
    });
  });
});
