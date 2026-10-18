/**
 * pega-ruleset-write-context — RuleSet write-context resolution used before
 * save/checkout of a Pega rule. Extracted from PegaRuleSetResolverService
 * (BR-18); decision table and warnings unchanged.
 */
import type { PegaHttpClient } from "./PegaHttpClient";
import type { RuleSetVersionInfo, RuleWriteContext } from "./PegaRuleSetResolverService";

/**
 * Kiểm tra RuleSet version có open (mở để edit) không.
 * Query qua endpoint GET /rules/{insKey} với insKey `RULE-RULESET-VERSION <NAME> <VERSION>`.
 */
export async function checkRuleSetOpenStatus(
  client: PegaHttpClient,
  name: string,
  version: string
): Promise<RuleSetVersionInfo> {
  const insKey = `RULE-RULESET-VERSION ${name.toUpperCase()} ${version}`;
  try {
    const obj = await client.getRuleByInsKey(insKey);
    const open =
      obj.pyOpen === true ||
      obj.pyOpen === "true" ||
      obj.pyOpenStatus === true ||
      String(obj.pyOpenStatus || "").toLowerCase() === "true" ||
      String(obj.pyRuleSetVersionStatus || "").toLowerCase().includes("open") ||
      String(obj.pyStatus || "").toLowerCase().includes("open");
    return { name, version, open, exists: true };
  } catch {
    return { name, version, open: false, exists: false };
  }
}

/**
 * Resolve đầy đủ context write cho 1 rule: phân loại existing/new, thu thập
 * các RuleSet version trong stack app, đề xuất target theo bảng quyết định.
 */
export async function resolveRuleWriteContext(
  client: PegaHttpClient,
  rulePayload: Record<string, unknown>
): Promise<RuleWriteContext> {
  const warnings: string[] = [];
  const existingRule = {
    pyRuleSet: (rulePayload.pyRuleSet as string) || undefined,
    pyRuleSetVersion: (rulePayload.pyRuleSetVersion as string) || undefined,
    pzInsKey: (rulePayload.pzInsKey as string) || undefined,
  };
  const ruleType: "existing" | "new" =
    existingRule.pzInsKey || existingRule.pyRuleSet ? "existing" : "new";

  // 1. Thu thập RuleSet candidates từ app hierarchy (operator => access group => app => rulesets)
  let stackRulesets: Array<{ name: string; version: string }> = [];
  try {
    const hierarchy = await client.resolveDeterministicPegaHierarchy();
    stackRulesets = hierarchy.ruleSets.map((rs) => {
      const idx = rs.indexOf(":");
      return idx > 0
        ? { name: rs.slice(0, idx), version: rs.slice(idx + 1) }
        : { name: rs, version: "01-01-01" };
    });
  } catch (err: any) {
    warnings.push(`Không resolve được app hierarchy: ${err.message}`);
  }

  const candidates: RuleSetVersionInfo[] = [];
  const seen = new Set<string>();

  // 2. Candidate từ chính rule (existing)
  if (existingRule.pyRuleSet && existingRule.pyRuleSetVersion) {
    const key = `${existingRule.pyRuleSet}|${existingRule.pyRuleSetVersion}`;
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(await checkRuleSetOpenStatus(client, existingRule.pyRuleSet, existingRule.pyRuleSetVersion));
    }
  }

  // 3. Candidates từ ruleset stack (open check)
  for (const rs of stackRulesets) {
    const key = `${rs.name}|${rs.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(await checkRuleSetOpenStatus(client, rs.name, rs.version));
  }

  // 4. Chọn suggested target
  const openCandidates = candidates.filter((c) => c.open && c.exists);
  let suggestedTarget: RuleWriteContext["suggestedTarget"];

  const ownCandidate = candidates.find(
    (c) => c.name === existingRule.pyRuleSet && c.version === existingRule.pyRuleSetVersion
  );

  if (ruleType === "existing" && ownCandidate && ownCandidate.open) {
    // Existing rule thuộc open version => save trực tiếp vào version đó.
    suggestedTarget = {
      pyRuleSet: ownCandidate.name,
      pyRuleSetVersion: ownCandidate.version,
      source: "direct",
    };
  } else if (openCandidates.length > 0) {
    // New rule hoặc existing rule thuộc closed version => đề xuất open version trong stack.
    const chosen = openCandidates[0];
    suggestedTarget = {
      pyRuleSet: chosen.name,
      pyRuleSetVersion: chosen.version,
      source: "direct",
    };
    if (ruleType === "existing" && ownCandidate && !ownCandidate.open) {
      warnings.push(
        `RuleSet version hiện tại của rule (${ownCandidate.name}:${ownCandidate.version}) không open; đề xuất save vào ${chosen.name}:${chosen.version}.`
      );
    }
  } else {
    // Không có version nào open => chặn với hướng dẫn.
    warnings.push(
      "Không tìm thấy RuleSet version open nào. Cần checkout rule hoặc tạo branch/CR trước khi save."
    );
    suggestedTarget = {
      pyRuleSet: ownCandidate?.name || stackRulesets[0]?.name || "PegaApp",
      pyRuleSetVersion: ownCandidate?.version || stackRulesets[0]?.version || "01-01-01",
      source: "open-stack",
    };
  }

  return { ruleType, existingRule, candidates, suggestedTarget, warnings };
}
