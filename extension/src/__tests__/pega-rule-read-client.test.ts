/**
 * Unit tests for PegaRuleReadClient.getObject (SA4E-350).
 * Locks in: the CodeIntelligence rules/query service matches appliesTo exactly —
 * '@baseclass' must be sent verbatim (not stripped), with an empty-appliesTo
 * compat retry only when the exact query misses. Handle-only rows are followed
 * up with a full instance fetch. Auth/5xx errors rethrow (fail-loud, SA4E-349).
 */

import { describe, it, expect } from "vitest";
import { getObject } from "../services/pega/PegaRuleReadClient";
import type { PegaHttpCore } from "../services/pega/PegaHttpCore";

const BASE = "https://pega.test/prweb";
const PREFIX = `${BASE}/api/CodeIntelligence/v1`;

interface Responder {
  (url: string): { status: number; text: string };
}

/** Minimal core stub: canned fetchWithRetry keyed by URL predicates. */
function makeCore(responder: Responder): PegaHttpCore {
  return {
    activePrefix: null,
    log: () => {},
    getAuthHeader: async () => "Basic dGVzdDp0ZXN0",
    getCustomRestPrefixes: () => [PREFIX],
    fetchWithRetry: async (url: string) => {
      const { status, text } = responder(url);
      return {
        status,
        statusText: "",
        ok: status >= 200 && status < 300,
        text: async () => text,
      } as Response;
    },
  } as unknown as PegaHttpCore;
}

/** Handle-only row shape returned by the rules/query service (no content). */
function handleRow(insKey: string): string {
  return JSON.stringify({
    pxResults: [{
      pxObjClass: "Rule-HTML-Section", pxUpdateDateTime: "20260101T000000.000 GMT", pxUpdateOperator: "SSA@TGB",
      pyClass: "Rule-HTML-Section", pyClassName: "@baseclass", pyRuleAvailable: "Yes",
      pyRuleName: "pzBulkActions", pyRuleSet: "Pega-RULES", pyRuleSetVersion: "08-07-01", pzInsKey: insKey,
    }],
  });
}

/** Full rule JSON as returned by /rules/instance (has content beyond handle fields). */
function fullRule(insKey: string): string {
  return JSON.stringify({
    pxObjClass: "Rule-HTML-Section", pyRuleName: "pzBulkActions", pzInsKey: insKey,
    pyHTMLContent: "<div>bulk actions</div>", pyLabel: "pzBulkActions", pyStreamName: "UI-Kit",
  });
}

const EMPTY = JSON.stringify({ pxResults: [] });
const FULL_INSKAY = "RULE-HTML-SECTION @BASECLASS PZBULKACTIONS #20180713T134741.673 GMT";

describe("PegaRuleReadClient.getObject (SA4E-350)", () => {
  it("sends '@baseclass' verbatim and follows up the handle row with a full instance fetch", async () => {
    const seen: string[] = [];
    const core = makeCore((url) => {
      seen.push(url);
      if (url.includes("/rules/query") && url.includes("appliesTo=%40baseclass")) { return { status: 200, text: handleRow(FULL_INSKAY) }; }
      if (url.includes("/rules/instance") && url.includes(encodeURIComponent(FULL_INSKAY))) { return { status: 200, text: fullRule(FULL_INSKAY) }; }
      return { status: 200, text: EMPTY };
    });
    const result = await getObject(core, "Rule-HTML-Section", "pzBulkActions", "@baseclass");
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain("/rules/query?pxObjClass=Rule-HTML-Section&appliesTo=%40baseclass");
    expect(seen[1]).toContain("/rules/instance");
    expect(String((result as Record<string, unknown>).pyHTMLContent)).toContain("bulk actions");
  });

  it("retries with empty appliesTo when the '@baseclass' query misses (server compat)", async () => {
    const seen: string[] = [];
    const core = makeCore((url) => {
      seen.push(url);
      if (url.includes("appliesTo=%40baseclass")) { return { status: 200, text: EMPTY }; }
      if (url.includes("/rules/query") && url.includes("appliesTo=&pyRuleName=pzBulkActions")) { return { status: 200, text: handleRow("RULE-HTML-SECTION PZBULKACTIONS #2 GMT") }; }
      if (url.includes("/rules/instance")) { return { status: 200, text: fullRule("RULE-HTML-SECTION PZBULKACTIONS #2 GMT") }; }
      return { status: 200, text: EMPTY };
    });
    const result = await getObject(core, "Rule-HTML-Section", "pzBulkActions", "@baseclass");
    expect(seen[0]).toContain("appliesTo=%40baseclass");
    expect(seen[1]).toContain("appliesTo=&pyRuleName");
    expect(String((result as Record<string, unknown>).pyHTMLContent)).toContain("bulk actions");
  });

  it("falls back to the handle row when the instance follow-up fails (soft)", async () => {
    const core = makeCore((url) => {
      if (url.includes("/rules/query") && url.includes("appliesTo=%40baseclass")) { return { status: 200, text: handleRow(FULL_INSKAY) }; }
      return { status: 404, text: JSON.stringify({ error: "Rule not found: x" }) };
    });
    const result = await getObject(core, "Rule-HTML-Section", "pzBulkActions", "@baseclass");
    expect(String((result as Record<string, unknown>).pzInsKey)).toContain("#20180713");
  });

  it("does NOT follow up when the triple query returns a full rule body", async () => {
    const seen: string[] = [];
    const core = makeCore((url) => {
      seen.push(url);
      return { status: 200, text: JSON.stringify({ pxResults: [JSON.parse(fullRule(FULL_INSKAY))] }) };
    });
    await getObject(core, "Rule-HTML-Section", "pzBulkActions", "@baseclass");
    expect(seen).toHaveLength(1);
  });

  it("does NOT compat-retry for non-@baseclass appliesTo", async () => {
    const seen: string[] = [];
    const core = makeCore((url) => {
      seen.push(url);
      return { status: 200, text: EMPTY };
    });
    await expect(getObject(core, "Rule-Obj-When", "pxIsMobileDevice", "Pega-Notification")).rejects.toThrow(/Rule not found for triple/);
    expect(seen).toHaveLength(1);
  });

  it("rethrows auth errors without compat retry (fail-loud, SA4E-349 pattern)", async () => {
    const seen: string[] = [];
    const core = makeCore((url) => {
      seen.push(url);
      return { status: 401, text: JSON.stringify({ error: { code: "TOKEN_INVALID" } }) };
    });
    await expect(getObject(core, "Rule-HTML-Section", "pzBulkActions", "@baseclass")).rejects.toThrow(/HTTP 401/);
    expect(seen).toHaveLength(1);
  });
});
