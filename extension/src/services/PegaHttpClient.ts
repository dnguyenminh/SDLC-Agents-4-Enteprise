/**
 * PegaHttpClient — facade over the Pega client family (SA4E-323 refactor).
 * Was a 1088-line god-class; now extends PegaHttpCore (shared state + HTTP
 * primitives) and delegates domain operations to focused modules under
 * ./pega. Public API is unchanged so no caller is affected.
 * All fetch() calls route through the global proxy patch (global-fetch-patch).
 */

import { PegaHttpCore, type PegaOperatorContext } from "./pega/PegaHttpCore";
import type { RuleSetRuleSummary } from "../models";
import type { HierarchyResult } from "./PegaHierarchyResolver";
import * as read from "./pega/PegaRuleReadClient";
import * as list from "./pega/PegaRuleListClient";
import * as write from "./pega/PegaRuleWriteClient";
import * as ctx from "./pega/PegaContextClient";
import * as dp from "./pega/PegaDataPageClient";
import * as backend from "./pega/PegaBackendClient";

export type { PegaOperatorContext } from "./pega/PegaHttpCore";

export class PegaHttpClient extends PegaHttpCore {
  /** Public accessor for backend URL — used by PegaStreamIngester (SA4E-92). */
  getBackendUrlPublic(): string { return this.getBackendUrl(); }

  // --- Operator / application context ---
  getOperatorContext(): Promise<PegaOperatorContext> { return ctx.getOperatorContext(this); }
  resolveDeterministicPegaHierarchy(operatorIdHint?: string): Promise<HierarchyResult> {
    return ctx.resolveDeterministicPegaHierarchy(this, this, operatorIdHint);
  }
  fetchAndSavePegaContext(workspaceRoot: string): Promise<{ applicationName: string; accessGroup: string; caseTypesCount: number; filePath: string }> {
    return ctx.fetchAndSavePegaContext(this, this, workspaceRoot);
  }

  // --- Rule read/query ---
  getObject(className: string, key: string, appliesTo?: string): Promise<Record<string, unknown>> {
    return read.getObject(this, className, key, appliesTo);
  }
  getRuleByInsKey(insKey: string): Promise<Record<string, unknown>> { return read.getRuleByInsKey(this, insKey); }
  queryRuleByTriple(pxObjClass: string, appliesTo: string, pyRuleName: string): Promise<Record<string, unknown>> {
    return read.queryRuleByTriple(this, pxObjClass, appliesTo, pyRuleName);
  }

  // --- Rule listing ---
  listApplicationRules(pxObjClass: string, appliesTo = "", pageSize = 50, pageIndex = 1): Promise<Record<string, unknown>> {
    return list.listApplicationRules(this, pxObjClass, appliesTo, pageSize, pageIndex);
  }
  listRulesByFilter(objClass: string, filterPropName: string, filterPropValue: string, pageSize = 50, pageIndex = 1) {
    return list.listRulesByFilter(this, objClass, filterPropName, filterPropValue, pageSize, pageIndex);
  }
  listRulesByRuleSet(ruleSetName: string, ruleSetVersion: string, pageSize = 200, pageIndex = 1): Promise<{ pxResults: RuleSetRuleSummary[]; pxMore: boolean; totalCount?: number }> {
    return list.listRulesByRuleSet(this, ruleSetName, ruleSetVersion, pageSize, pageIndex);
  }
  getClassRules(className: string, ruleType: string, pageSize = 200): Promise<Record<string, unknown>[]> {
    return list.getClassRules(this, className, ruleType, pageSize);
  }
  getClassProperties(className: string, pageSize = 200): Promise<Record<string, unknown>[]> {
    return list.getClassRules(this, className, "Rule-Obj-Property", pageSize);
  }

  // --- Rule write ---
  savePegaRule(rulePayload: string | Record<string, unknown>, target?: { pyRuleSet?: string; pyRuleSetVersion?: string }): Promise<Record<string, unknown>> {
    return write.savePegaRule(this, rulePayload, target);
  }
  checkoutPegaRule(insKey: string, action: "CHECKOUT" | "CHECKIN" | "UNDOCHECKOUT", comment?: string, branch?: { branchName: string; branchVersion: string }): Promise<Record<string, unknown>> {
    return write.checkoutPegaRule(this, insKey, action, comment, branch);
  }
  executeScenarioTestSuite(testSuiteID?: string, insKey?: string): Promise<Record<string, unknown>> {
    return write.executeScenarioTestSuite(this, testSuiteID, insKey);
  }
  createPegaBranch(rulesetName: string, baseVersion = "01-01-01", branchName: string): Promise<Record<string, unknown>> {
    return write.createPegaBranch(this, rulesetName, baseVersion, branchName);
  }

  // --- DataPage / hierarchy ---
  callDataPage(appName: string): Promise<Record<string, unknown>> { return dp.callDataPage(this, appName); }
  fetchClassHierarchy(className: string): Promise<string[]> { return dp.fetchClassHierarchy(this, className); }
  fetchDataTypesOfApp(appName: string, appVersion: string): Promise<string[]> { return dp.fetchDataTypesOfApp(this, appName, appVersion); }
  fetchDirectChildren(className: string, categoryLevel1?: string, categoryLevel2?: string): Promise<Array<Record<string, unknown>>> {
    return dp.fetchDirectChildren(this, className, categoryLevel1, categoryLevel2);
  }
  queryRuleInsKeys(pxObjClass: string, appliesTo: string, pyRuleName: string): Promise<string[]> {
    return dp.queryRuleInsKeys(this, pxObjClass, appliesTo, pyRuleName);
  }

  // --- Backend cache / crawl ---
  checkBackendCache(body: Record<string, unknown>): Promise<any> { return backend.checkBackendCache(this, body); }
  ingestBackendRule(body: Record<string, unknown>): Promise<any> { return backend.ingestBackendRule(this, body); }
  crawlPlan(body: { projectId: string; ruleKeys: string[]; visitedKeys: string[]; ruleChecksums?: Record<string, string> }) {
    return backend.crawlPlan(this, body);
  }
  crawlBatch(body: { projectId: string; rules: Record<string, unknown>[]; visitedKeys: string[]; rulesChecksums?: Record<string, string>; rulesVersions?: Record<string, string> }) {
    return backend.crawlBatch(this, body);
  }
  detectProject(workspaceRoot: string) { return backend.detectProject(this, workspaceRoot); }
}
