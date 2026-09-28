/**
 * PegaRuleWriteClient — Pega rule mutation operations: save, checkout, test,
 * branch (SA4E-323 refactor, extracted from PegaHttpClient). Free functions
 * taking a PegaHttpCore. Behavior-preserving.
 */

import type { PegaHttpCore } from "./PegaHttpCore";

/** POST a rule-service body to each prefix, returning the first non-error JSON. */
async function postToPrefixes(
  core: PegaHttpCore, path: string, query: string, body: Record<string, unknown>, failMsg: string,
): Promise<Record<string, unknown>> {
  const authHeader = await core.getAuthHeader();
  for (const prefix of core.getCustomRestPrefixes()) {
    try {
      const url = query ? `${prefix}/${path}?${query}` : `${prefix}/${path}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json = (await res.json()) as Record<string, unknown>;
        if (json && !json.error) { return json; }
      }
    } catch (err) { console.debug("[PegaHttpClient] try next prefix :", (err as Error).message); }
  }
  throw new Error(failMsg);
}

/** Service 4: create or update a rule instance (transactional commit). */
export async function savePegaRule(
  core: PegaHttpCore, rulePayload: string | Record<string, unknown>,
  target?: { pyRuleSet?: string; pyRuleSetVersion?: string },
): Promise<Record<string, unknown>> {
  const payloadObj = typeof rulePayload === "object" ? { ...rulePayload } : JSON.parse(rulePayload);
  if (target?.pyRuleSet) { payloadObj.pyRuleSet = target.pyRuleSet; }
  if (target?.pyRuleSetVersion) { payloadObj.pyRuleSetVersion = target.pyRuleSetVersion; }
  return postToPrefixes(core, "rules/save", "", { ruleJson: JSON.stringify(payloadObj) },
    "POST /rules/save failed on all custom REST prefixes");
}

/** Service 5: checkout / checkin / undo-checkout a rule (lock control). */
export async function checkoutPegaRule(
  core: PegaHttpCore, insKey: string, action: "CHECKOUT" | "CHECKIN" | "UNDOCHECKOUT",
  comment?: string, branch?: { branchName: string; branchVersion: string },
): Promise<Record<string, unknown>> {
  const c = comment || "Updated via SDLC AI Multi-Agent Pipeline";
  const branchParams = branch
    ? `&branchName=${encodeURIComponent(branch.branchName)}&branchVersion=${encodeURIComponent(branch.branchVersion)}&RequestBranchName=${encodeURIComponent(branch.branchName)}&RequestBranchVersion=${encodeURIComponent(branch.branchVersion)}`
    : "";
  const query = `insKey=${encodeURIComponent(insKey)}&action=${encodeURIComponent(action)}&comment=${encodeURIComponent(comment || "")}&RequestPZInsKey=${encodeURIComponent(insKey)}&RequestAction=${encodeURIComponent(action)}&RequestComment=${encodeURIComponent(comment || "")}${branchParams}`;
  const body = {
    insKey, action, comment: c, RequestPZInsKey: insKey, RequestAction: action, RequestComment: c,
    ruleJson: JSON.stringify({ insKey, action, comment }),
  };
  return postToPrefixes(core, "rules/checkout", query, body,
    "POST /rules/checkout failed on all custom REST prefixes");
}

/** Service 6: trigger a QA scenario unit-test suite on the Pega server. */
export async function executeScenarioTestSuite(
  core: PegaHttpCore, testSuiteID?: string, insKey?: string,
): Promise<Record<string, unknown>> {
  const query = `testSuiteID=${encodeURIComponent(testSuiteID || "")}&insKey=${encodeURIComponent(insKey || "")}&RequestTestSuiteID=${encodeURIComponent(testSuiteID || "")}&RequestPZInsKey=${encodeURIComponent(insKey || "")}`;
  const body = {
    testSuiteID: testSuiteID || "", insKey: insKey || "",
    RequestTestSuiteID: testSuiteID || "", RequestPZInsKey: insKey || "",
    ruleJson: JSON.stringify({ testSuiteID, insKey }),
  };
  return postToPrefixes(core, "rules/test", query, body,
    "POST /rules/test failed on all custom REST prefixes");
}

/** Service 7: create a new ruleset branch version (idempotent). */
export async function createPegaBranch(
  core: PegaHttpCore, rulesetName: string, baseVersion = "01-01-01", branchName: string,
): Promise<Record<string, unknown>> {
  const branchVersion = `${baseVersion}:${branchName}`;
  const query = `rulesetName=${encodeURIComponent(rulesetName)}&baseVersion=${encodeURIComponent(baseVersion)}&branchName=${encodeURIComponent(branchName)}&branchVersion=${encodeURIComponent(branchVersion)}&RequestRuleSetName=${encodeURIComponent(rulesetName)}&RequestBaseVersion=${encodeURIComponent(baseVersion)}&RequestBranchName=${encodeURIComponent(branchName)}&RequestBranchVersion=${encodeURIComponent(branchVersion)}`;
  const body = {
    rulesetName, baseVersion, branchName, branchVersion,
    RequestRuleSetName: rulesetName, RequestBaseVersion: baseVersion,
    RequestBranchName: branchName, RequestBranchVersion: branchVersion,
    ruleJson: JSON.stringify({ rulesetName, baseVersion, branchName, branchVersion }),
  };
  return postToPrefixes(core, "rules/branch", query, body,
    "POST /rules/branch failed on all custom REST prefixes");
}
