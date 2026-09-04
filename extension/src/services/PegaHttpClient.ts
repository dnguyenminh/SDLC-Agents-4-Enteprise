/**
 * PegaHttpClient — Client HTTP giao tiếp giữa Extension, Pega Platform và Backend.
 * All fetch() calls are transparently routed through the global proxy patch
 * (global-fetch-patch.ts) which handles curl/powershell/undici modes.
 */

import * as vscode from "vscode";
import { createHash } from "crypto";
import { SECRET_KEYS } from "../models";
import type { RuleSetRuleSummary } from "../models";
import { setProjectId } from "../extension";
import { resolvePegaHierarchy, type HierarchyResult } from "./PegaHierarchyResolver";

export interface PegaOperatorContext {
  operatorId: string;
  activeAccessGroup: string;
  currentApplication: {
    name: string;
    version: string;
    pzInsKey: string;
  };
  rulesetStack: Array<{ name: string; version: string }>;
}

export class PegaHttpClient {
  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly outputChannel?: vscode.OutputChannel
  ) {}

  private log(msg: string): void {
    if (this.outputChannel) {
      this.outputChannel.appendLine(msg);
    } else {
      console.log(msg);
    }
  }

  public async getAuthHeader(): Promise<string> {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const username = config.get<string>("pegaUsername", "").trim();
    const password = (await this.secrets.get(SECRET_KEYS.pega)) || "";
    const credentials = Buffer.from(`${username}:${password}`).toString("base64");
    return `Basic ${credentials}`;
  }

  public getPegaEndpoint(): string {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    return config.get<string>("pegaEndpoint", "http://localhost:8080/prweb").replace(/\/$/, "");
  }

  /** SA4E-241 SEC-03: configured Pega operator id (no hardcoded default). */
  public getConfiguredUsername(): string {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    return config.get<string>("pegaUsername", "").trim();
  }

  private getBackendUrl(): string {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    return config.get<string>("backendUrl", "http://localhost:48721").replace(/\/$/, "");
  }

  /** Public accessor for backend URL — used by PegaStreamIngester (SA4E-92) */
  public getBackendUrlPublic(): string {
    return this.getBackendUrl();
  }

  public async getOperatorContext(): Promise<PegaOperatorContext> {
    const base = this.getPegaEndpoint();
    const authHeader = await this.getAuthHeader();
    const headers = { Authorization: authHeader };
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const username = config.get<string>("pegaUsername", "").trim();

    for (const url of [`${base}/api/v1/data/D_OperatorID`, `${base}/PRRestService/api/v1/data/D_OperatorID`]) {
      try {
        const res = await fetch(url, { headers });
        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as any;
          const operatorId = data.pyUserIdentifier || username;
          const activeAccessGroup = data.pyAccessGroup || "";
          const appName = activeAccessGroup ? activeAccessGroup.split(":")[0] : "PegaApp";
          const appInsKey = `RULE-APPLICATION ${appName.toUpperCase()}`;
          // Derive activePrefix from successful URL pattern (api vs PRRestService)
          if (url.includes("/PRRestService/")) {
            this.activePrefix = `${base}/PRRestService/CodeIntelligence/v1`;
          } else {
            this.activePrefix = `${base}/api/CodeIntelligence/v1`;
          }
          this.log(`[PegaHttpClient] ✅ getOperatorContext success — activePrefix set to ${this.activePrefix}`);
          return {
            operatorId,
            activeAccessGroup,
            currentApplication: { name: appName, version: "v1", pzInsKey: appInsKey },
            rulesetStack: [],
          };
        }
        if (res.status === 401) { throw new Error("HTTP 401 Unauthorized (Invalid Operator ID or Password)"); }
        if (res.status === 403) { throw new Error("HTTP 403 Forbidden (Operator does not have access)"); }
      } catch (err: any) {
        if (err.message.includes("401") || err.message.includes("403")) { throw err; }
      }
    }

    for (const url of [`${base}/api/v1/casetypes`, `${base}/PRRestService/api/v1/casetypes`]) {
      try {
        const res = await fetch(url, { headers });
        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as any;
          const appName = data.caseTypes?.[0]?.name || "Pega App";
          return {
            operatorId: username,
            activeAccessGroup: "",
            currentApplication: { name: appName, version: "v1", pzInsKey: `RULE-APPLICATION ${appName.toUpperCase()}` },
            rulesetStack: [],
          };
        }
      } catch (err) { console.debug('[PegaHttpClient] skip :', (err as Error).message); }
    }

    throw new Error("Failed to connect to Pega Server");
  }

  /**
   * Deterministic 5-Step Hierarchy Resolution:
   * Operator → Access Group → Application → Dependencies → Merged RuleSets.
   * Delegates to PegaHierarchyResolver for the full logic.
   */
  public async resolveDeterministicPegaHierarchy(operatorIdHint?: string): Promise<HierarchyResult> {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    // SA4E-241 SEC-03: no hardcoded operator-id fallback. Operator id must come
    // from the caller hint or the configured `pegaUsername` (fail-closed).
    const opId = (operatorIdHint || config.get<string>("pegaUsername", "")).trim();
    if (!opId) {
      throw new Error("Pega Operator ID is not configured (kiroSdlc.pegaUsername). Set it before indexing.");
    }
    const root = this.getWorkspaceRoot();
    return resolvePegaHierarchy(this, opId, root, this.log.bind(this));
  }

  /** Resolve workspace root path for saving rules to disk */
  private getWorkspaceRoot(): string {
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder ? folder.uri.fsPath : process.cwd();
  }

  private activePrefix: string | null = null;

  public async getObject(className: string, key: string, appliesTo?: string): Promise<Record<string, unknown>> {
    let insKey = key;
    if (!key.includes(" ")) {
      const cleanAppliesTo = (appliesTo && appliesTo !== "@baseclass") ? appliesTo : "";
      if (cleanAppliesTo) {
        insKey = `${className.toUpperCase()} ${cleanAppliesTo} ${key}`;
      } else {
        insKey = `${className.toUpperCase()} ${key}`;
      }
    }

    try {
      return await this.getRuleByInsKey(insKey);
    } catch (err: any) {
      if (err.message.includes("HTTP 504") || err.message.includes("HTTP 503") || err.message.includes("HTTP 502") || err.message.includes("HTTP 500") || err.message.includes("HTTP 401")) {
        throw err;
      }
      // Fallback: try queryRuleByTriple
      return await this.queryRuleByTriple(className, appliesTo || "", key);
    }
  }

  private getCustomRestPrefixes(): string[] {
    const base = this.getPegaEndpoint();
    const prefixes = [
      `${base}/api/CodeIntelligence/v1`,
      `${base}/PRRestService/CodeIntelligence/v1`,
      `${base}/api/HRAppsV2Service/V1`,
      `${base}/PRRestService/HRAppsV2Service/V1`,
      `${base}/api/HRAppsV2/V1`,
      `${base}/PRRestService/HRAppsV2/V1`,
      `${base}/api/v1`,
      `${base}/PRRestService/v1`,
    ];
    if (this.activePrefix) {
      return [this.activePrefix, ...prefixes.filter(p => p !== this.activePrefix)];
    }
    return prefixes;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async fetchWithRetry(url: string, init: RequestInit, maxRetries = 2): Promise<Response> {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        const res = await fetch(url, init);
        if (res.status === 503 || res.status === 504 || res.status === 502) {
          attempt++;
          if (attempt <= maxRetries) {
            const retryAfterHeader = res.headers.get("retry-after");
            let backoffMs = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500);
            if (retryAfterHeader && !isNaN(Number(retryAfterHeader))) {
              backoffMs = Number(retryAfterHeader) * 1000;
            }
            this.log(`[PegaHttpClient] ⏳ HTTP ${res.status} on ${url}. Retrying in ${(backoffMs / 1000).toFixed(1)}s (Attempt ${attempt}/${maxRetries})...`);
            await this.delay(backoffMs);
            continue;
          }
        }
        return res;
      } catch (err: any) {
        attempt++;
        if (attempt <= maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 500);
          this.log(`[PegaHttpClient] ⏳ Network Error: ${err.message}. Retrying in ${(backoffMs / 1000).toFixed(1)}s (Attempt ${attempt}/${maxRetries})...`);
          await this.delay(backoffMs);
          continue;
        }
        throw err;
      }
    }
    return fetch(url, init);
  }

  /**
   * Service 1: GET /rules/{insKey}
   * Tải 100% nội dung Rule XML/JSON gốc theo insKey duy nhất.
   * Iterates all prefixes — only throws immediately on auth errors (401/403)
   * or server errors (5xx). A 404 or body-level error means "try next prefix".
   */
  public async getRuleByInsKey(insKey: string): Promise<Record<string, unknown>> {
    // Encoded-slash workaround: insKeys containing "/" become "%2F" in the path,
    // which Tomcat/Pega reject with HTTP 400 (ALLOW_ENCODED_SLASH is off by default).
    // Route these through the query API, which passes the name via body/query-string
    // instead of the URL path. See getRuleViaQueryFallback().
    if (insKey.includes("/")) {
      return this.getRuleViaQueryFallback(insKey);
    }

    const authHeader = await this.getAuthHeader();
    const logs: string[] = [];

    for (const prefix of this.getCustomRestPrefixes()) {
      const url = `${prefix}/rules/${encodeURIComponent(insKey)}`;
      try {
        const res = await this.fetchWithRetry(url, {
          headers: { Authorization: authHeader, Accept: "application/json" },
        });
        const text = await res.text();
        this.log(`[PegaHttpClient] 📡 GET ${url} => HTTP ${res.status} (${text.length} bytes)`);

        // Auth errors — fatal, throw immediately
        if (res.status === 401 || res.status === 403) {
          throw new Error(`HTTP ${res.status} ${res.statusText || "Auth Error"}`);
        }

        // Server errors — fatal, throw immediately
        if (res.status === 504 || res.status === 503 || res.status === 502 || res.status === 500) {
          throw new Error(`HTTP ${res.status} ${res.statusText || "Server Error"}`);
        }

        if (res.ok) {
          const json = JSON.parse(text) as Record<string, unknown>;
          if (json && !json.error && json.pyHTTPResponseCode !== "404" && json.pyHTTPResponseCode !== 404) {
            // Real success — lock this prefix
            this.activePrefix = prefix;
            return json;
          }
          // Body says "not found" — active prefix means rule genuinely doesn't exist (SA4E-95)
          if (prefix === this.activePrefix) {
            throw new Error(`Rule not found: ${insKey}`);
          }
          logs.push(`GET ${url} => 200 but body error: ${String(json.error || 'pyHTTPResponseCode=404')}`);
          continue; // try next prefix
        }

        if (res.status === 404) {
          // Active prefix 404 → rule genuinely not found, short-circuit (SA4E-95)
          if (prefix === this.activePrefix) {
            throw new Error(`Rule not found: ${insKey}`);
          }
          logs.push(`GET ${url} => HTTP 404`);
          continue; // try next prefix
        }

        logs.push(`GET ${url} => HTTP ${res.status}: ${text.substring(0, 150)}`);
      } catch (err: any) {
        // Re-throw auth/server/rule-not-found errors immediately
        if (err.message.includes("HTTP 401") || err.message.includes("HTTP 403") ||
            err.message.includes("HTTP 504") || err.message.includes("HTTP 503") ||
            err.message.includes("HTTP 502") || err.message.includes("HTTP 500") ||
            err.message.includes("Rule not found")) {
          throw err;
        }
        logs.push(`GET ${url} => Network Error: ${err.message}`);
      }
    }

    // All prefixes exhausted without finding the rule
    throw new Error(`Rule not found: ${insKey}\n  ${logs.join("\n  ")}`);
  }

  /**
   * Fetch a rule whose insKey contains "/" via the query API (Service 2).
   * The path endpoint 400s on encoded slashes, so we split the insKey into its
   * triple (pxObjClass / appliesTo / ruleName) and query by properties instead.
   *
   * pzInsKey format: "<RULE-TYPE> <APPLIESTO?> <RULENAME>". The rule type is the
   * first space-delimited token; the remainder is the name (which may itself
   * contain "/" and "!"). appliesTo is left empty — the query API resolves the
   * rule by type + name, which is sufficient for the DATA-* settings that hit this.
   * @param insKey - Full pzInsKey containing a slash
   * @returns Full rule JSON
   */
  private async getRuleViaQueryFallback(insKey: string): Promise<Record<string, unknown>> {
    const firstSpace = insKey.indexOf(" ");
    if (firstSpace < 0) {
      throw new Error(`Rule not found: ${insKey} (cannot split insKey for query fallback)`);
    }
    const pxObjClass = insKey.substring(0, firstSpace);
    const ruleName = insKey.substring(firstSpace + 1).trim();
    this.log(`[PegaHttpClient] 🔀 insKey contains "/" — using query fallback: class="${pxObjClass}" name="${ruleName}"`);
    return this.queryRuleByTriple(pxObjClass, "", ruleName);
  }

  /**
   * Service 2: POST /rules/query
   * Truy vấn chính xác Rule theo bộ 3 pxObjClass, appliesTo, pyRuleName.
   * Iterates all prefixes — only throws on auth/server errors.
   */
  public async queryRuleByTriple(pxObjClass: string, appliesTo: string, pyRuleName: string): Promise<Record<string, unknown>> {
    const authHeader = await this.getAuthHeader();
    const logs: string[] = [];

    for (const prefix of this.getCustomRestPrefixes()) {
      const queryParams = `pxObjClass=${encodeURIComponent(pxObjClass)}&appliesTo=${encodeURIComponent(appliesTo || "")}&pyRuleName=${encodeURIComponent(pyRuleName)}&RequestClass=${encodeURIComponent(pxObjClass)}&RequestAppliesTo=${encodeURIComponent(appliesTo || "")}&RequestRuleName=${encodeURIComponent(pyRuleName)}`;
      const url = `${prefix}/rules/query?${queryParams}`;
      const payload = {
        ruleJson: JSON.stringify({
          RequestClass: pxObjClass,
          RequestAppliesTo: appliesTo,
          RequestRuleName: pyRuleName,
        }),
      };
      try {
        const res = await this.fetchWithRetry(url, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        });
        const text = await res.text();
        this.log(`[PegaHttpClient] 📡 POST ${url} Payload: ${JSON.stringify(payload.ruleJson)} => HTTP ${res.status} (${text.length} bytes)`);

        // Auth errors — fatal
        if (res.status === 401 || res.status === 403) {
          throw new Error(`HTTP ${res.status} ${res.statusText || "Auth Error"}`);
        }

        // Server errors — fatal
        if (res.status === 504 || res.status === 503 || res.status === 502 || res.status === 500) {
          throw new Error(`HTTP ${res.status} ${res.statusText || "Server Error"}`);
        }

        if (res.ok) {
          if (!text || !text.trim()) {
            // Empty response on active prefix → rule genuinely not found (SA4E-95 short-circuit)
            if (prefix === this.activePrefix) {
              throw new Error(`Rule not found for triple: ${pxObjClass} | ${appliesTo} | ${pyRuleName}`);
            }
            logs.push(`POST ${url} => 200 but empty body`);
            continue;
          }
          let json: Record<string, unknown> = {};
          try {
            json = JSON.parse(text);
          } catch (err) {
            if (prefix === this.activePrefix) {
              throw new Error(`Rule not found for triple: ${pxObjClass} | ${appliesTo} | ${pyRuleName}`);
            }
            logs.push(`POST ${url} => 200 but invalid JSON`);
            continue;
          }
          if (json && !json.error && json.pyHTTPResponseCode !== "404" && json.pyHTTPResponseCode !== 404) {
            // Real success — lock prefix
            this.activePrefix = prefix;
            return json;
          }
          // Body-level 404 on active prefix → rule genuinely doesn't exist, stop immediately
          if (prefix === this.activePrefix) {
            throw new Error(`Rule not found for triple: ${pxObjClass} | ${appliesTo} | ${pyRuleName}`);
          }
          logs.push(`POST ${url} => 200 but body error: ${String(json.error || 'pyHTTPResponseCode=404')}`);
          continue;
        }

        if (res.status === 404) {
          // Active prefix returns HTTP 404 → rule genuinely not found, short-circuit (SA4E-95)
          if (prefix === this.activePrefix) {
            throw new Error(`Rule not found for triple: ${pxObjClass} | ${appliesTo} | ${pyRuleName}`);
          }
          logs.push(`POST ${url} => HTTP 404`);
          continue; // try next prefix
        }

        logs.push(`POST ${url} => HTTP ${res.status}: ${text.substring(0, 150)}`);
      } catch (err: any) {
        if (err.message.includes("HTTP 401") || err.message.includes("HTTP 403") ||
            err.message.includes("HTTP 504") || err.message.includes("HTTP 503") ||
            err.message.includes("HTTP 502") || err.message.includes("HTTP 500") ||
            err.message.includes("Rule not found for triple")) {
          throw err;
        }
        logs.push(`POST ${url} => Network Error: ${err.message}`);
      }
    }

    // All prefixes exhausted without finding the rule
    throw new Error(`Rule not found for triple: ${pxObjClass} | ${appliesTo} | ${pyRuleName}\n  ${logs.join("\n  ")}`);
  }

  /**
   * Service 3: POST /rules/list
   * Quét danh sách tất cả các Rule summaries theo RuleSet / Application.
   */
  public async listApplicationRules(pxObjClass: string, appliesTo = "", pageSize = 50, pageIndex = 1): Promise<Record<string, unknown>> {
    const authHeader = await this.getAuthHeader();
    for (const prefix of this.getCustomRestPrefixes()) {
      try {
        const queryParams = `pxObjClass=${encodeURIComponent(pxObjClass)}&appliesTo=${encodeURIComponent(appliesTo)}&pageSize=${pageSize}&pageIndex=${pageIndex}&RequestClass=${encodeURIComponent(pxObjClass)}&RequestAppliesTo=${encodeURIComponent(appliesTo)}`;
        const url = `${prefix}/rules/list?${queryParams}`;
        const res = await this.fetchWithRetry(url, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            ruleJson: JSON.stringify({
              RequestClass: pxObjClass,
              RequestAppliesTo: appliesTo,
              pageSize,
              pageIndex,
            }),
          }),
        });
        if (res.ok) {
          const json = (await res.json()) as Record<string, unknown>;
          if (json && !json.error) {
            return json;
          }
        }
      } catch (err) { console.debug('[PegaHttpClient] try next prefix :', (err as Error).message); }
    }
    throw new Error(`POST /rules/list failed on all custom REST prefixes`);
  }

  /**
   * Service 10: POST /rules/listRules
   * List rules matching a property filter with pagination (SA4E-93).
   * @param objClass Pega rule class (e.g., "Rule-HTML-Harness")
   * @param filterPropName Property to filter on (e.g., "pyStreamName")
   * @param filterPropValue Value to match (e.g., "RuleForm")
   * @param pageSize Records per page (default 50, BR-05)
   * @param pageIndex 1-based page number (default 1)
   * @returns Paginated response with pxMore flag
   */
  public async listRulesByFilter(
    objClass: string,
    filterPropName: string,
    filterPropValue: string,
    pageSize = 50,
    pageIndex = 1,
  ): Promise<{ pxResults: Record<string, unknown>[]; pxMore: boolean; totalCount?: number }> {
    const authHeader = await this.getAuthHeader();
    const logs: string[] = [];
    for (const prefix of this.getCustomRestPrefixes()) {
      const queryParams = `ObjClass=${encodeURIComponent(objClass)}&FilterPropName=${encodeURIComponent(filterPropName)}&FilterPropValue=${encodeURIComponent(filterPropValue)}&PageSize=${pageSize}&PageIndex=${pageIndex}&RequestClass=${encodeURIComponent(objClass)}`;
      const url = `${prefix}/rules/listRules?${queryParams}`;
      try {
        const res = await this.fetchWithRetry(url, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
          body: "",
        });
        const text = await res.text();
        this.log(`[PegaHttpClient] 📡 POST ${url} => HTTP ${res.status} (${text.length} bytes)`);
        if (res.ok) {
          this.activePrefix = prefix;
          const json = JSON.parse(text) as Record<string, unknown>;
          const pxResults = (json.pxResults || json.results || []) as Record<string, unknown>[];
          // Pega pxMore can be: true, "true", "Yes", "yes", or absent (heuristic: count >= pageSize)
          const rawMore = json.pxMore;
          const pxMore = rawMore === true || rawMore === "true" || rawMore === "Yes" || rawMore === "yes"
            || (rawMore === undefined && Array.isArray(pxResults) && pxResults.length >= pageSize);
          const totalCount = typeof json.totalCount === "number" ? json.totalCount : undefined;
          return { pxResults: Array.isArray(pxResults) ? pxResults : [], pxMore, totalCount };
        }
        if (res.status === 401 || res.status === 403) {
          throw new Error(`HTTP ${res.status} ${res.statusText || "Auth Error"}`);
        }
        logs.push(`POST ${url} => HTTP ${res.status}: ${text.substring(0, 150)}`);
      } catch (err: any) {
        if (err.message.includes("HTTP 401") || err.message.includes("HTTP 403")) { throw err; }
        logs.push(`POST ${url} => Error: ${err.message}`);
      }
    }
    throw new Error(`POST /rules/listRules failed:\n  ${logs.join("\n  ")}`);
  }

  /**
   * Enumerate ALL rules belonging to a specific RuleSet via Service 10.
   * Queries each concrete rule type separately since Pega listRules
   * does not support abstract "Rule-" base class filtering (SA4E-94).
   * @param ruleSetName - RuleSet name (e.g., "HRAppsV2")
   * @param ruleSetVersion - RuleSet version (e.g., "01-02") — used for result enrichment
   * @param pageSize - Records per page (default 200, BR-02)
   * @param pageIndex - 1-based page number (applied per rule type)
   * @returns Aggregated rule summaries from all concrete types and pxMore flag
   */
  public async listRulesByRuleSet(
    ruleSetName: string,
    ruleSetVersion: string,
    pageSize = 200,
    pageIndex = 1,
  ): Promise<{ pxResults: RuleSetRuleSummary[]; pxMore: boolean; totalCount?: number }> {
    // Pega requires concrete rule classes — "Rule-" base returns 0 results
    const CONCRETE_TYPES = [
      "Rule-Obj-Property", "Rule-Obj-Activity", "Rule-Obj-Flow",
      "Rule-Obj-Model", "Rule-HTML-Section", "Rule-Declare-Expressions",
      "Rule-Obj-FieldValue", "Rule-Obj-Report-Definition", "Rule-Obj-Class",
    ];
    const allResults: RuleSetRuleSummary[] = [];
    let anyMore = false;

    // Query each rule type in parallel for this RuleSet
    const typeResults = await Promise.all(
      CONCRETE_TYPES.map(async (objClass) => {
        try {
          return await this.listRulesByFilter(objClass, "pyRuleSet", ruleSetName, pageSize, pageIndex);
        } catch (err) { console.debug('[PegaHttpClient] Rule listing failed for ruleSet (non-fatal):', (err as Error).message); return { pxResults: [] as Record<string, unknown>[], pxMore: false }; }
      }),
    );

    for (const result of typeResults) {
      if (result.pxMore) { anyMore = true; }
      for (const r of result.pxResults) {
        allResults.push({
          pzInsKey: String(r.pzInsKey || ''),
          pxObjClass: String(r.pxObjClass || ''),
          pyClassName: String(r.pyClassName || ''),
          pyRuleName: String(r.pyRuleName || ''),
          pyRuleSet: String(r.pyRuleSet || ruleSetName),
          pyRuleSetVersion: String(r.pyRuleSetVersion || ruleSetVersion),
          pyLabel: r.pyLabel ? String(r.pyLabel) : undefined,
        });
      }
    }

    return { pxResults: allResults, pxMore: anyMore, totalCount: allResults.length };
  }

  /**
   * Truy vấn tất cả các Rule của 1 loại (Rule-Obj-Activity, Rule-Obj-Flow, Rule-Obj-Model...) thuộc về 1 Class cụ thể.
   */
  public async getClassRules(className: string, ruleType: string, pageSize = 200): Promise<Record<string, unknown>[]> {
    // Skip invalid class names that cause 404 on Pega server
    if (!className || className === "@baseclass" || className.length < 3) {
      return [];
    }
    try {
      // Use listRules with filter on pyClassName for reliable class scoping
      const result = await this.listRulesByFilter(ruleType, "pyClassName", className, pageSize, 1);
      const pxResults = result.pxResults || [];
      return Array.isArray(pxResults) ? pxResults : [];
    } catch (err) {
      console.debug('[PegaHttpClient] Failed to parse rule list response:', (err as Error).message);
      return [];
    }
  }

  /**
   * Truy vấn tất cả các Property (Rule-Obj-Property) thuộc về 1 Class cụ thể.
   * Lớp Class => Lấy danh sách Property
   */
  public async getClassProperties(className: string, pageSize = 200): Promise<Record<string, unknown>[]> {
    return this.getClassRules(className, "Rule-Obj-Property", pageSize);
  }

  /**
   * Service 4: POST /rules/save
   * Tạo mới hoặc cập nhật Rule Instance qua Transactional Commit.
   * @param target - RuleSet version đích (inject pyRuleSet/pyRuleSetVersion vào ruleJson).
   */
  public async savePegaRule(
    rulePayload: string | Record<string, unknown>,
    target?: { pyRuleSet?: string; pyRuleSetVersion?: string }
  ): Promise<Record<string, unknown>> {
    const authHeader = await this.getAuthHeader();
    const payloadObj = typeof rulePayload === "object" ? { ...rulePayload } : JSON.parse(rulePayload);
    if (target?.pyRuleSet) {
      payloadObj.pyRuleSet = target.pyRuleSet;
    }
    if (target?.pyRuleSetVersion) {
      payloadObj.pyRuleSetVersion = target.pyRuleSetVersion;
    }
    const payloadStr = JSON.stringify(payloadObj);
    for (const prefix of this.getCustomRestPrefixes()) {
      try {
        const url = `${prefix}/rules/save`;
        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ ruleJson: payloadStr }),
        });
        if (res.ok) {
          const json = (await res.json()) as Record<string, unknown>;
          if (json && !json.error) {
            return json;
          }
        }
      } catch (err) { console.debug('[PegaHttpClient] try next prefix :', (err as Error).message); }
    }
    throw new Error(`POST /rules/save failed on all custom REST prefixes`);
  }

  /**
   * Service 5: POST /rules/checkout
   * Thực thi quy trình Lock Control (Checkout / Checkin / UndoCheckout).
   * @param branch - Branch context (branchName/branchVersion) xác định trước khi checkout.
   */
  public async checkoutPegaRule(
    insKey: string,
    action: "CHECKOUT" | "CHECKIN" | "UNDOCHECKOUT",
    comment?: string,
    branch?: { branchName: string; branchVersion: string }
  ): Promise<Record<string, unknown>> {
    const authHeader = await this.getAuthHeader();
    for (const prefix of this.getCustomRestPrefixes()) {
      try {
        const branchParams = branch
          ? `&branchName=${encodeURIComponent(branch.branchName)}&branchVersion=${encodeURIComponent(branch.branchVersion)}&RequestBranchName=${encodeURIComponent(branch.branchName)}&RequestBranchVersion=${encodeURIComponent(branch.branchVersion)}`
          : "";
        const queryParams = `insKey=${encodeURIComponent(insKey)}&action=${encodeURIComponent(action)}&comment=${encodeURIComponent(comment || "")}&RequestPZInsKey=${encodeURIComponent(insKey)}&RequestAction=${encodeURIComponent(action)}&RequestComment=${encodeURIComponent(comment || "")}${branchParams}`;
        const url = `${prefix}/rules/checkout?${queryParams}`;
        const bodyObj = {
          insKey,
          action,
          comment: comment || "Updated via SDLC AI Multi-Agent Pipeline",
          RequestPZInsKey: insKey,
          RequestAction: action,
          RequestComment: comment || "Updated via SDLC AI Multi-Agent Pipeline",
          ruleJson: JSON.stringify({ insKey, action, comment }),
        };
        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(bodyObj),
        });
        if (res.ok) {
          const json = (await res.json()) as Record<string, unknown>;
          if (json && !json.error) {
            return json;
          }
        }
      } catch (err) { console.debug('[PegaHttpClient] try next prefix :', (err as Error).message); }
    }
    throw new Error(`POST /rules/checkout failed on all custom REST prefixes`);
  }

  /**
   * Service 6: POST /rules/test
   * Kích hoạt QA Scenario Unit Test Suite trên Pega Server.
   */
  public async executeScenarioTestSuite(testSuiteID?: string, insKey?: string): Promise<Record<string, unknown>> {
    const authHeader = await this.getAuthHeader();
    for (const prefix of this.getCustomRestPrefixes()) {
      try {
        const queryParams = `testSuiteID=${encodeURIComponent(testSuiteID || "")}&insKey=${encodeURIComponent(insKey || "")}&RequestTestSuiteID=${encodeURIComponent(testSuiteID || "")}&RequestPZInsKey=${encodeURIComponent(insKey || "")}`;
        const url = `${prefix}/rules/test?${queryParams}`;
        const bodyObj = {
          testSuiteID: testSuiteID || "",
          insKey: insKey || "",
          RequestTestSuiteID: testSuiteID || "",
          RequestPZInsKey: insKey || "",
          ruleJson: JSON.stringify({ testSuiteID, insKey }),
        };
        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(bodyObj),
        });
        if (res.ok) {
          const json = (await res.json()) as Record<string, unknown>;
          if (json && !json.error) {
            return json;
          }
        }
      } catch (err) { console.debug('[PegaHttpClient] try next prefix :', (err as Error).message); }
    }
    throw new Error(`POST /rules/test failed on all custom REST prefixes`);
  }

  /**
   * Service 7: POST /rules/branch
   * Tạo branch version mới trong Pega: clone `{baseVersion}` thành `{baseVersion}:{branchName}`
   * (vd 01-01-01:ssa_SA4E-58) và mở để edit. Idempotent — nếu branch đã tồn tại trả về EXISTS.
   */
  public async createPegaBranch(
    rulesetName: string,
    baseVersion = "01-01-01",
    branchName: string
  ): Promise<Record<string, unknown>> {
    const authHeader = await this.getAuthHeader();
    const branchVersion = `${baseVersion}:${branchName}`;
    for (const prefix of this.getCustomRestPrefixes()) {
      try {
        const queryParams = `rulesetName=${encodeURIComponent(rulesetName)}&baseVersion=${encodeURIComponent(baseVersion)}&branchName=${encodeURIComponent(branchName)}&branchVersion=${encodeURIComponent(branchVersion)}&RequestRuleSetName=${encodeURIComponent(rulesetName)}&RequestBaseVersion=${encodeURIComponent(baseVersion)}&RequestBranchName=${encodeURIComponent(branchName)}&RequestBranchVersion=${encodeURIComponent(branchVersion)}`;
        const url = `${prefix}/rules/branch?${queryParams}`;
        const bodyObj = {
          rulesetName,
          baseVersion,
          branchName,
          branchVersion,
          RequestRuleSetName: rulesetName,
          RequestBaseVersion: baseVersion,
          RequestBranchName: branchName,
          RequestBranchVersion: branchVersion,
          ruleJson: JSON.stringify({ rulesetName, baseVersion, branchName, branchVersion }),
        };
        const res = await fetch(url, {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(bodyObj),
        });
        if (res.ok) {
          const json = (await res.json()) as Record<string, unknown>;
          if (json && !json.error) {
            return json;
          }
        }
      } catch (err) { console.debug('[PegaHttpClient] try next prefix :', (err as Error).message); }
    }
    throw new Error(`POST /rules/branch failed on all custom REST prefixes`);
  }

  public async checkBackendCache(body: Record<string, unknown>): Promise<any> {
    const endpoint = `${this.getBackendUrl()}/api/v1/pega/check-rule`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { return { cached: false }; }
    const json = (await res.json()) as any;
    return json.data || { cached: false };
  }

  public async ingestBackendRule(body: Record<string, unknown>): Promise<any> {
    const endpoint = `${this.getBackendUrl()}/api/v1/pega/ingest-rule`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { throw new Error(`Backend ingest failed: ${res.statusText}`); }
    const json = (await res.json()) as any;
    return json.data || {};
  }

  public async crawlPlan(body: {
    projectId: string;
    ruleKeys: string[];
    visitedKeys: string[];
    ruleChecksums?: Record<string, string>;
  }): Promise<{ missing: Array<{ insKey: string; pxObjClass: string; pyClassName: string; pyRuleName: string }>; cached: string[] }> {
    const endpoint = `${this.getBackendUrl()}/api/v1/pega/crawl-plan`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { throw new Error(`Crawl plan failed: ${res.statusText}`); }
    const json = (await res.json()) as any;
    return json.data || { missing: [], cached: [] };
  }

  public async crawlBatch(body: {
    projectId: string;
    rules: Record<string, unknown>[];
    visitedKeys: string[];
    rulesChecksums?: Record<string, string>;
    rulesVersions?: Record<string, string>;
  }): Promise<{ stored: number; totalRulesInDb?: number; totalKbEntriesInDb?: number; totalGraphNodesInDb?: number; nextBatch: Array<{ insKey: string; pxObjClass: string; pyClassName: string; pyRuleName: string }> }> {
    const endpoint = `${this.getBackendUrl()}/api/v1/pega/crawl-batch`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { throw new Error(`Crawl batch failed: ${res.statusText}`); }
    const json = (await res.json()) as any;
    return json.data || { stored: 0, nextBatch: [] };
  }

  public async detectProject(workspaceRoot: string): Promise<{
    isPegaProject: boolean;
    applicationName?: string;
    rulesetName?: string;
    confidence: number;
    indicators: string[];
  }> {
    const endpoint = `${this.getBackendUrl()}/api/v1/pega/detect-project`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceRoot }),
    });
    if (!res.ok) { throw new Error(`Detect project failed: ${res.statusText}`); }
    const json = (await res.json()) as any;
    return json.data || { isPegaProject: false, confidence: 0, indicators: [] };
  }

  public async fetchAndSavePegaContext(workspaceRoot: string): Promise<{
    applicationName: string;
    accessGroup: string;
    caseTypesCount: number;
    filePath: string;
  }> {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const username = config.get<string>("pegaUsername", "").trim();

    // Delegate to the correct hierarchy resolver
    this.log(`[PegaHttpClient] 🔍 fetchAndSavePegaContext: Starting hierarchy resolution...`);
    const result = await this.resolveDeterministicPegaHierarchy(username);

    // Fetch case types (optional, for display)
    const caseTypes = await this.fetchCaseTypes();

    // Build correct applicationInsKey WITH version
    const appInsKey = result.appVersion
      ? `RULE-APPLICATION ${result.appName.toUpperCase()} ${result.appVersion}`
      : `RULE-APPLICATION ${result.appName.toUpperCase()}`;

    // Save pega-project.json with CORRECT data
    const projectData = {
      isPegaProject: true,
      pegaEndpoint: this.getPegaEndpoint(),
      operatorId: result.operatorId,
      accessGroup: result.accessGroup,
      applicationName: result.appName,
      applicationVersion: result.appVersion,
      applicationInsKey: appInsKey,
      pzInsKey: appInsKey,
      ruleSets: result.ruleSets,
      dependedApps: result.dependedApps,
      accessGroups: result.accessGroups,
      caseTypes,
      fetchedAt: new Date().toISOString(),
    };

    const jsonPath = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), "pega-project.json");
    await vscode.workspace.fs.writeFile(jsonPath, Buffer.from(JSON.stringify(projectData, null, 2), "utf-8"));

    // Derive and persist project ID from Pega application name
    const codeIntelDir = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), ".code-intel");
    await vscode.workspace.fs.createDirectory(codeIntelDir);
    const pjPath = vscode.Uri.joinPath(codeIntelDir, "project.json");
    const projectId = createHash("sha256").update("pega:" + result.appName).digest("hex").slice(0, 12);
    await vscode.workspace.fs.writeFile(pjPath, Buffer.from(JSON.stringify({ projectId }, null, 2), "utf-8"));
    setProjectId(projectId);

    this.log(`[PegaHttpClient] ✅ fetchAndSavePegaContext complete: app="${result.appName}" v${result.appVersion}, ${caseTypes.length} caseTypes`);

    return {
      applicationName: result.appName,
      accessGroup: result.accessGroup,
      caseTypesCount: caseTypes.length,
      filePath: jsonPath.fsPath,
    };
  }

  /** Fetch case types from Pega API (non-fatal) */
  private async fetchCaseTypes(): Promise<Array<{ name: string; caseTypeID: string }>> {
    const base = this.getPegaEndpoint();
    const authHeader = await this.getAuthHeader();
    const endpoints = [`${base}/api/v1/casetypes`, `${base}/PRRestService/api/v1/casetypes`];

    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, { headers: { Authorization: authHeader } });
        if (res.ok) {
          const data = (await res.json()) as any;
          if (Array.isArray(data.caseTypes)) {
            return data.caseTypes.map((c: any) => ({ name: c.name || "", caseTypeID: c.caseTypeID || "" }));
          }
        }
      } catch (err) { console.debug('[PegaHttpClient] non-fatal :', (err as Error).message); }
    }
    return [];
  }

  /**
   * Call Pega DataPage D_LatestRules4ExactedApps to enumerate all rules for an application.
   * SA4E-156: Single DataPage call replaces multi-RuleSet enumeration.
   * @param appName - Application name with version (e.g. "TGB:08-01")
   * @returns DataPage response containing pxResults array
   * @throws Error if DataPage unreachable after retries
   */
  public async callDataPage(appName: string): Promise<Record<string, unknown>> {
    const base = this.getPegaEndpoint();
    const authHeader = await this.getAuthHeader();
    const payload = { ApplicationNames: appName };

    const endpoints = [
      `${base}/api/v1/data/D_LatestRules4ExactedApps`,
      `${base}/PRRestService/api/v1/data/D_LatestRules4ExactedApps`,
    ];

    for (const url of endpoints) {
      try {
        const res = await this.fetchWithRetry(url, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (res.status === 401 || res.status === 403) {
          throw new Error(`HTTP ${res.status} ${res.statusText || 'Auth Error'}`);
        }

        if (res.ok) {
          const json = (await res.json()) as Record<string, unknown>;
          if (json && !json.error) {
            this.log(`[PegaHttpClient] ✅ DataPage success: ${url}`);
            return json;
          }
        }
      } catch (err: any) {
        if (err.message.includes('HTTP 401') || err.message.includes('HTTP 403')) throw err;
        this.log(`[PegaHttpClient] DataPage attempt failed: ${err.message}`);
      }
    }

    throw new Error(`DataPage D_LatestRules4ExactedApps failed on all endpoints for app "${appName}"`);
  }

  /**
   * Fetch full class inheritance hierarchy from Pega via D_pzInheritanceListofClass data page.
   * Returns parent classes (pattern + directed) excluding @baseclass and the class itself.
   * @param className - Class to resolve hierarchy for (e.g. "Common-Work-Activity")
   * @returns Array of parent class names to download
   */
  public async fetchClassHierarchy(className: string): Promise<string[]> {
    if (!className || className === '@baseclass') return [];
    const base = this.getPegaEndpoint();
    const authHeader = await this.getAuthHeader();
    const endpoints = [
      `${base}/api/CodeIntelligence/v1/datapage/list?dataPageName=D_pzInheritanceListofClass`,
      `${base}/PRRestService/CodeIntelligence/v1/datapage/list?dataPageName=D_pzInheritanceListofClass`,
    ];

    for (const url of endpoints) {
      try {
        const res = await this.fetchWithRetry(url, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            Accept: 'application/json',
            'Content-Type': 'text/plain',
          },
          body: JSON.stringify({ classname: className }),
        });
        if (!res.ok) continue;
        const json = (await res.json()) as Record<string, unknown>;
        const results = json.pxResults as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(results)) continue;
        // Return all parent class names except self and @baseclass
        return results
          .map((r) => r.pyClassName as string)
          .filter((name) => name && name !== className && name !== '@baseclass');
      } catch (err: any) {
        this.log(`[PegaHttpClient] fetchClassHierarchy attempt failed: ${err.message}`);
      }
    }
    return [];
  }

  /**
   * SA4E-173: Fetch data class pzInsKeys from D_pyDataTypesOfApp DataPage.
   * @param appName - e.g. "HRAppsV2"
   * @param appVersion - e.g. "01.01" (dot format, NOT dash)
   */
  public async fetchDataTypesOfApp(appName: string, appVersion: string): Promise<string[]> {
    const base = this.getPegaEndpoint();
    const authHeader = await this.getAuthHeader();
    const dotVersion = appVersion.replace(/-/g, '.');
    const url = `${base}/api/CodeIntelligence/v1/datapage/list?dataPageName=D_pyDataTypesOfApp`;
    try {
      const res = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: { Authorization: authHeader, Accept: 'application/json', 'Content-Type': 'text/plain' },
        body: JSON.stringify({ AppVersion: dotVersion, AppName: appName }),
      });
      if (!res.ok) return [];
      const json = await res.json() as Record<string, unknown>;
      const results = json.pxResults as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(results)) return [];
      return results.map(r => r.pzInsKey as string).filter(Boolean);
    } catch (err: any) {
      this.log(`[PegaHttpClient] fetchDataTypesOfApp failed: ${err.message}`);
      return [];
    }
  }

  /**
   * SA4E-173: Fetch direct children (categories or rules) for a class via CodeIntelligence API.
   * Level 0: returns first-level categories (pyLabel)
   * Level 1: returns second-level categories (pyLabel)
   * Level 2: returns rule info (pyClass, pyClassName, pyRuleName)
   */
  public async fetchDirectChildren(
    className: string, categoryLevel1?: string, categoryLevel2?: string,
  ): Promise<Array<Record<string, unknown>>> {
    const base = this.getPegaEndpoint();
    const authHeader = await this.getAuthHeader();
    let params = `.ClassName=${encodeURIComponent(className)}`;
    if (categoryLevel1) params += `&.CategoryLevel1=${encodeURIComponent(categoryLevel1)}`;
    if (categoryLevel2) params += `&.CategoryLevel2=${encodeURIComponent(categoryLevel2)}`;
    const url = `${base}/api/CodeIntelligence/v1/rules/directChildren?${params}`;
    try {
      const res = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: { Authorization: authHeader, Accept: 'application/json' },
        body: '',
      });
      if (!res.ok) return [];
      const json = await res.json() as Record<string, unknown>;
      const results = json.pxResults as Array<Record<string, unknown>> | undefined;
      return Array.isArray(results) ? results : [];
    } catch (err: any) {
      this.log(`[PegaHttpClient] fetchDirectChildren failed: ${err.message}`);
      return [];
    }
  }

  /**
   * SA4E-173: Query rule pzInsKeys by type, appliesTo class, and rule name.
   */
  public async queryRuleInsKeys(
    pxObjClass: string, appliesTo: string, pyRuleName: string,
  ): Promise<string[]> {
    const base = this.getPegaEndpoint();
    const authHeader = await this.getAuthHeader();
    const params = `pxObjClass=${encodeURIComponent(pxObjClass)}&appliesTo=${encodeURIComponent(appliesTo)}&pyRuleName=${encodeURIComponent(pyRuleName)}`;
    const url = `${base}/api/CodeIntelligence/v1/rules/query?${params}`;
    try {
      const res = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: { Authorization: authHeader, Accept: 'application/json' },
        body: '',
      });
      if (!res.ok) return [];
      const json = await res.json() as Record<string, unknown>;
      const results = json.pxResults as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(results)) return [];
      return results.map(r => r.pzInsKey as string).filter(Boolean);
    } catch (err: any) {
      this.log(`[PegaHttpClient] queryRuleInsKeys failed: ${err.message}`);
      return [];
    }
  }
}
