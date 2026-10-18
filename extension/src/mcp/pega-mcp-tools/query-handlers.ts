/**
 * Read-side MCP handler bodies for PegaMcpTools (get/query/list/detect/run).
 * Extracted from PegaMcpTools.ts (BR-18 file-size limit). Pure refactor —
 * client injected instead of `this.client`.
 */
import { PegaHttpClient } from "../../services/PegaHttpClient";
import { crawlRules } from "./crawlers";

export async function getSessionContextHandler(client: PegaHttpClient): Promise<any> {
  try {
    const ctx = await client.getOperatorContext();
    return { success: true, context: ctx };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getRuleHandler(client: PegaHttpClient, args: Record<string, unknown>): Promise<any> {
  const className = (args.className as string) || "@baseclass";
  const ruleName = (args.ruleName as string) || (args.key as string) || "";
  const projectId = (args.projectId as string) || "DEFAULT_PROJECT";
  const cacheCheck = await client.checkBackendCache({
    projectId,
    ruleType: args.ruleType || "Rule-Obj-Activity",
    className,
    ruleName,
  });

  if (cacheCheck.cached) {
    return { success: true, source: "cache", data: cacheCheck.content };
  }
  try {
    return await fetchAndIngestRule(client, projectId, className, ruleName);
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function fetchAndIngestRule(
  client: PegaHttpClient,
  projectId: string,
  className: string,
  ruleName: string,
): Promise<any> {
  const ruleJson = await client.getObject(className, ruleName);
  const ingestRes = await client.ingestBackendRule({ projectId, ruleJson });

  if (ingestRes.unresolvedDependencies && ingestRes.unresolvedDependencies.length > 0) {
    crawlRules(client, projectId, ingestRes.unresolvedDependencies, new Set<string>());
  }

  return { success: true, source: "pega_studio", data: ruleJson };
}

export async function detectProjectHandler(client: PegaHttpClient, args: Record<string, unknown>): Promise<any> {
  const workspaceRoot = (args.workspaceRoot as string) || "";
  if (!workspaceRoot) {
    return { success: false, error: "workspaceRoot required" };
  }
  try {
    const info = await client.detectProject(workspaceRoot);
    return { success: true, ...info };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Service 1 MCP handler body: pega_get_rule
 */
export async function getRuleByInsKeyHandler(client: PegaHttpClient, args: Record<string, unknown>): Promise<any> {
  const insKey = (args.insKey as string) || (args.key as string) || "";
  if (!insKey) return { success: false, error: "insKey parameter required" };
  try {
    const data = await client.getRuleByInsKey(insKey);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Service 2 MCP handler body: pega_query_rule
 */
export async function queryRuleHandler(client: PegaHttpClient, args: Record<string, unknown>): Promise<any> {
  const pxObjClass = (args.pxObjClass as string) || (args.className as string) || "";
  const appliesTo = (args.appliesTo as string) || (args.pyClassName as string) || "";
  const pyRuleName = (args.pyRuleName as string) || (args.ruleName as string) || "";
  if (!pxObjClass || !pyRuleName) {
    return { success: false, error: "pxObjClass and pyRuleName required" };
  }
  try {
    const data = await client.queryRuleByTriple(pxObjClass, appliesTo, pyRuleName);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Service 3 MCP handler body: pega_list_rules
 */
export async function listRulesHandler(client: PegaHttpClient, args: Record<string, unknown>): Promise<any> {
  const pxObjClass = (args.pxObjClass as string) || (args.className as string) || "Rule-Obj-Activity";
  const pageSize = (args.pageSize as number) || 50;
  const pageIndex = (args.pageIndex as number) || 1;
  try {
    const data = await client.listApplicationRules(pxObjClass, "", pageSize, pageIndex);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Service 6 MCP handler body: pega_run_tests
 */
export async function runTestsHandler(client: PegaHttpClient, args: Record<string, unknown>): Promise<any> {
  const testSuiteID = (args.testSuiteID as string) || (args.suiteId as string) || "";
  const insKey = (args.insKey as string) || "";
  if (!testSuiteID && !insKey) return { success: false, error: "testSuiteID or insKey required" };
  try {
    const data = await client.executeScenarioTestSuite(testSuiteID, insKey);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
