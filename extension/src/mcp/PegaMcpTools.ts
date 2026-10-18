import * as vscode from "vscode";
import { PegaHttpClient } from "../services/PegaHttpClient";
import { PegaRuleSetResolverService } from "../services/PegaRuleSetResolverService";
import { crawlProjectHandler } from "./pega-mcp-tools/project-crawler";
import {
  getSessionContextHandler,
  getRuleHandler,
  detectProjectHandler,
  getRuleByInsKeyHandler,
  queryRuleHandler,
  listRulesHandler,
  runTestsHandler,
} from "./pega-mcp-tools/query-handlers";
import {
  saveRuleHandler,
  checkoutRuleHandler,
  createBranchHandler,
} from "./pega-mcp-tools/write-handlers";

/**
 * MCP tool handlers for Pega rule operations. Thin public façade — handler
 * bodies live in ./pega-mcp-tools/* (BR-18 file-size limit); each public
 * method delegates with the same arguments and return shapes.
 */
export class PegaMcpTools {
  private client: PegaHttpClient;
  private ruleSetResolver: PegaRuleSetResolverService;

  constructor(secrets: vscode.SecretStorage) {
    this.client = new PegaHttpClient(secrets);
    this.ruleSetResolver = new PegaRuleSetResolverService(this.client);
  }

  public async getSessionContext(): Promise<any> {
    return getSessionContextHandler(this.client);
  }

  public async getRule(args: Record<string, unknown>): Promise<any> {
    return getRuleHandler(this.client, args);
  }

  public async crawlProject(args: Record<string, unknown>): Promise<any> {
    return crawlProjectHandler(this.client, args);
  }

  public async detectProject(args: Record<string, unknown>): Promise<any> {
    return detectProjectHandler(this.client, args);
  }

  /**
   * Service 1 MCP Handler: pega_get_rule
   */
  public async getRuleByInsKey(args: Record<string, unknown>): Promise<any> {
    return getRuleByInsKeyHandler(this.client, args);
  }

  /**
   * Service 2 MCP Handler: pega_query_rule
   */
  public async queryRule(args: Record<string, unknown>): Promise<any> {
    return queryRuleHandler(this.client, args);
  }

  /**
   * Service 3 MCP Handler: pega_list_rules
   */
  public async listRules(args: Record<string, unknown>): Promise<any> {
    return listRulesHandler(this.client, args);
  }

  /**
   * Service 4 MCP Handler: pega_save_rule
   */
  public async saveRule(args: Record<string, unknown>): Promise<any> {
    return saveRuleHandler(this.client, this.ruleSetResolver, args);
  }

  /**
   * Service 5 MCP Handler: pega_checkout_rule
   */
  public async checkoutRule(args: Record<string, unknown>): Promise<any> {
    return checkoutRuleHandler(this.client, this.ruleSetResolver, args);
  }

  /**
   * Service 6 MCP Handler: pega_run_tests
   */
  public async runTests(args: Record<string, unknown>): Promise<any> {
    return runTestsHandler(this.client, args);
  }

  /**
   * Service 7 MCP Handler: pega_create_branch
   */
  public async createBranch(args: Record<string, unknown>): Promise<any> {
    return createBranchHandler(this.client, this.ruleSetResolver, args);
  }
}
