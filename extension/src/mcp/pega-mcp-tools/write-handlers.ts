/**
 * Write-side MCP handler bodies for PegaMcpTools (save/checkout/create-branch).
 * RuleSet/branch resolution via PegaRuleSetResolverService happens BEFORE the
 * write call. Extracted from PegaMcpTools.ts (BR-18 file-size limit).
 */
import { PegaHttpClient } from "../../services/PegaHttpClient";
import { PegaRuleSetResolverService, RuleWriteContext, SaveRuleOptions } from "../../services/PegaRuleSetResolverService";

function parseBaseOptions(args: Record<string, unknown>) {
  return {
    ticketId: (args.ticketId as string) || (args.crId as string) || "",
    crId: args.crId as string,
    developerShortName: args.developerShortName as string,
  };
}

/**
 * Service 4 MCP handler body: pega_save_rule
 * Before save: resolve the RuleSet context (open version / branch) to pick the target.
 */
export async function saveRuleHandler(
  client: PegaHttpClient,
  ruleSetResolver: PegaRuleSetResolverService,
  args: Record<string, unknown>,
): Promise<any> {
  const ruleJson = args.ruleJson || args.payload;
  if (!ruleJson) return { success: false, error: "ruleJson payload required" };
  const options: SaveRuleOptions = { ...parseBaseOptions(args), preferBranch: !!args.preferBranch };

  try {
    return await executeSave(client, ruleSetResolver, ruleJson, options);
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function executeSave(
  client: PegaHttpClient,
  ruleSetResolver: PegaRuleSetResolverService,
  ruleJson: unknown,
  options: SaveRuleOptions,
): Promise<any> {
  const payloadObj: Record<string, unknown> =
    typeof ruleJson === "object" ? (ruleJson as Record<string, unknown>) : JSON.parse(String(ruleJson));
  const context = await ruleSetResolver.resolveRuleWriteContext(payloadObj);
  const { target, branch } = await resolveSaveTarget(ruleSetResolver, context, options);
  const data = await client.savePegaRule(payloadObj, target);
  return buildSaveResponse(data, context, branch);
}

interface SaveTargetResolution {
  target: { pyRuleSet: string; pyRuleSetVersion: string };
  branch: { branchName: string; branchVersion: string } | null;
}

async function resolveSaveTarget(
  ruleSetResolver: PegaRuleSetResolverService,
  context: RuleWriteContext,
  options: SaveRuleOptions,
): Promise<SaveTargetResolution> {
  let target: { pyRuleSet: string; pyRuleSetVersion: string } = {
    pyRuleSet: context.suggestedTarget.pyRuleSet,
    pyRuleSetVersion: context.suggestedTarget.pyRuleSetVersion,
  };

  // Use the branch version as target when: the user asked for it (preferBranch), or
  // there is no open ruleset version (the suggestion is not a valid direct/open-stack).
  const branch = await ruleSetResolver.resolveBranchContext(options, target.pyRuleSetVersion);
  if (branch && (options.preferBranch || context.suggestedTarget.source !== "direct")) {
    target = { pyRuleSet: target.pyRuleSet, pyRuleSetVersion: branch.branchVersion };
  }
  return { target, branch };
}

function buildSaveResponse(
  data: Record<string, unknown>,
  context: RuleWriteContext,
  branch: { branchName: string; branchVersion: string } | null,
): any {
  return {
    success: true,
    data,
    context: {
      ruleType: context.ruleType,
      suggestedTarget: context.suggestedTarget,
      branch,
      warnings: context.warnings,
    },
  };
}

/**
 * Service 5 MCP handler body: pega_checkout_rule
 * Resolve the branch before checkout (checkout lands on the matching branch version).
 */
export async function checkoutRuleHandler(
  client: PegaHttpClient,
  ruleSetResolver: PegaRuleSetResolverService,
  args: Record<string, unknown>,
): Promise<any> {
  const insKey = (args.insKey as string) || "";
  const action = ((args.action as string) || "CHECKOUT").toUpperCase() as "CHECKOUT" | "CHECKIN" | "UNDOCHECKOUT";
  const comment = args.comment as string;
  if (!insKey) return { success: false, error: "insKey parameter required" };
  const options: SaveRuleOptions = { ...parseBaseOptions(args) };

  try {
    // Resolve the branch before checkout (from CR/ticket when available).
    const branch = await ruleSetResolver.resolveBranchContext(options);
    const data = await client.checkoutPegaRule(insKey, action, comment, branch || undefined);
    return { success: true, data, branch: branch || null };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Service 7 MCP handler body: pega_create_branch
 * Create a Pega branch version when no RuleSet version is open (closed rule base).
 * branchName left empty is derived from ticketId/crId + developerShortName.
 */
export async function createBranchHandler(
  client: PegaHttpClient,
  ruleSetResolver: PegaRuleSetResolverService,
  args: Record<string, unknown>,
): Promise<any> {
  const rulesetName = (args.rulesetName as string) || "";
  const baseVersion = (args.baseVersion as string) || "01-01-01";
  if (!rulesetName) return { success: false, error: "rulesetName parameter required" };
  const options: SaveRuleOptions = { ...parseBaseOptions(args) };

  try {
    const derived = await deriveBranchName(ruleSetResolver, options, baseVersion, args);
    if ("error" in derived) return { success: false, error: derived.error };
    const data = await client.createPegaBranch(rulesetName, baseVersion, derived.branchName);
    const branchVersion = `${baseVersion}:${derived.branchName}`;
    return { success: true, data, context: { rulesetName, baseVersion, branchName: derived.branchName, branchVersion } };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Use the explicit branchName when given; otherwise resolve it from the
 * ticket/CR context. Returns an error string when it cannot be derived.
 */
async function deriveBranchName(
  ruleSetResolver: PegaRuleSetResolverService,
  options: SaveRuleOptions,
  baseVersion: string,
  args: Record<string, unknown>,
): Promise<{ branchName: string } | { error: string }> {
  let branchName = (args.branchName as string) || "";
  if (!branchName) {
    const branch = await ruleSetResolver.resolveBranchContext(options, baseVersion);
    if (!branch) {
      return { error: "branchName required (or provide ticketId/crId to auto-derive)" };
    }
    branchName = branch.branchName;
  }
  return { branchName };
}
