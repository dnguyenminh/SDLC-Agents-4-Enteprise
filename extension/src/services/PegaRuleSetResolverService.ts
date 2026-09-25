/**
 * PegaRuleSetResolverService — Xác định context RuleSet trước khi save/checkout rule.
 *
 * Trước khi ghi rule (mới hoặc cập nhật) vào Pega, cần trả lời:
 *   1. RuleSet version mục tiêu có open để edit không?
 *   2. Save vào RuleSet version nào cho rule mới?
 *   3. Khi làm CR mới, branch name là gì?
 *
 * Branch naming convention: `{developerShortName}_{ticketId}` (vd: ssa_SA4E-58).
 * Branch version trên Pega: `{baseVersion}:{branchName}` (vd: 01-01-01:ssa_SA4E-58).
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { PegaHttpClient } from "./PegaHttpClient";

export interface RuleSetVersionInfo {
  name: string;
  version: string;
  open: boolean;
  exists: boolean;
}

export interface RuleWriteContext {
  ruleType: "existing" | "new";
  existingRule: { pyRuleSet?: string; pyRuleSetVersion?: string; pzInsKey?: string } | null;
  candidates: RuleSetVersionInfo[];
  suggestedTarget: { pyRuleSet: string; pyRuleSetVersion: string; source: "direct" | "open-stack" | "branch" };
  warnings: string[];
}

export interface SaveRuleOptions {
  ticketId?: string;
  crId?: string;
  developerShortName?: string;
  preferBranch?: boolean;
}

export interface CheckoutRuleOptions extends SaveRuleOptions {
  action: "CHECKOUT" | "CHECKIN" | "UNDOCHECKOUT";
  comment?: string;
}

export class PegaRuleSetResolverService {
  constructor(private readonly client: PegaHttpClient) {}

  /**
   * Developer short name: setting `kiroSdlc.pegaDeveloperShortName`,
   * fallback phần trước `@` của `pegaUsername` (vd user@org => user).
   */
  public getDeveloperShortName(): string {
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const fromSetting = config.get<string>("pegaDeveloperShortName", "").trim();
    if (fromSetting) return fromSetting;
    const username = config.get<string>("pegaUsername", "").trim();
    if (username.includes("@")) return username.split("@")[0].trim();
    return username.replace(/[^a-zA-Z0-9_.-]/g, "").toLowerCase();
  }

  /**
   * Ticket/CR ID: ưu tiên args.ticketId / args.crId, fallback ticket active trong pipeline.
   */
  public async resolveTicketId(options: SaveRuleOptions): Promise<string | undefined> {
    const explicit = (options.ticketId || options.crId || "").trim();
    if (explicit) return explicit;
    return this.resolveActivePipelineTicket();
  }

  /**
   * Branch name theo convention `{shortName}_{ticketId}`.
   */
  public buildBranchName(shortName: string, ticketId: string): string {
    const cleanShort = shortName.replace(/[^a-zA-Z0-9_.-]/g, "") || "dev";
    const cleanTicket = ticketId.replace(/[^a-zA-Z0-9_.-]/g, "") || "CR";
    return `${cleanShort}_${cleanTicket}`;
  }

  /**
   * Branch version trên Pega: `{baseVersion}:{branchName}`.
   */
  public buildBranchVersion(baseVersion: string, branchName: string): string {
    const base = baseVersion || "01-01-01";
    return `${base}:${branchName}`;
  }

  /**
   * Kiểm tra RuleSet version có open (mở để edit) không.
   * Query qua endpoint GET /rules/{insKey} với insKey `RULE-RULESET-VERSION <NAME> <VERSION>`.
   */
  public async checkRuleSetOpenStatus(name: string, version: string): Promise<RuleSetVersionInfo> {
    const insKey = `RULE-RULESET-VERSION ${name.toUpperCase()} ${version}`;
    try {
      const obj = await this.client.getRuleByInsKey(insKey);
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
   * Trích xuất RuleSet hiện tại từ rule payload (existing rule).
   */
  public extractRuleSetFromRule(rulePayload: Record<string, unknown>): {
    pyRuleSet?: string;
    pyRuleSetVersion?: string;
    pzInsKey?: string;
  } {
    return {
      pyRuleSet: (rulePayload.pyRuleSet as string) || undefined,
      pyRuleSetVersion: (rulePayload.pyRuleSetVersion as string) || undefined,
      pzInsKey: (rulePayload.pzInsKey as string) || undefined,
    };
  }

  /**
   * Resolve đầy đủ context write cho 1 rule: phân loại existing/new, thu thập
   * các RuleSet version trong stack app, đề xuất target theo bảng quyết định.
   */
  public async resolveRuleWriteContext(rulePayload: Record<string, unknown>): Promise<RuleWriteContext> {
    const warnings: string[] = [];
    const existingRule = this.extractRuleSetFromRule(rulePayload);
    const ruleType: "existing" | "new" =
      existingRule.pzInsKey || existingRule.pyRuleSet ? "existing" : "new";

    // 1. Thu thập RuleSet candidates từ app hierarchy (operator => access group => app => rulesets)
    let stackRulesets: Array<{ name: string; version: string }> = [];
    try {
      const hierarchy = await this.client.resolveDeterministicPegaHierarchy();
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
        candidates.push(await this.checkRuleSetOpenStatus(existingRule.pyRuleSet, existingRule.pyRuleSetVersion));
      }
    }

    // 3. Candidates từ ruleset stack (open check)
    for (const rs of stackRulesets) {
      const key = `${rs.name}|${rs.version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(await this.checkRuleSetOpenStatus(rs.name, rs.version));
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

  /**
   * Resolve branch context nếu có CR/ticket. Trả về { branchName, branchVersion }.
   */
  public async resolveBranchContext(
    options: SaveRuleOptions,
    baseVersion = "01-01-01"
  ): Promise<{ branchName: string; branchVersion: string } | null> {
    const ticketId = await this.resolveTicketId(options);
    if (!ticketId) return null;
    const shortName = options.developerShortName?.trim() || this.getDeveloperShortName();
    const branchName = this.buildBranchName(shortName, ticketId);
    return { branchName, branchVersion: this.buildBranchVersion(baseVersion, branchName) };
  }

  /**
   * Ticket active trong pipeline: đọc thư mục `.vscode/kiro-pipeline-state`,
   * chọn pipeline mới nhất có status không phải completed.
   */
  private resolveActivePipelineTicket(): string | undefined {
    try {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) return undefined;
      const stateDir = path.join(folder.uri.fsPath, ".vscode", "kiro-pipeline-state");
      if (!fs.existsSync(stateDir)) return undefined;
      const files = fs.readdirSync(stateDir).filter((f) => f.endsWith(".json") && !f.endsWith(".tmp"));
      if (files.length === 0) return undefined;

      const candidates = files
        .map((f) => {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(stateDir, f), "utf-8"));
            return {
              ticketKey: data.state?.ticketKey || "",
              status: data.state?.pipelineStatus || "idle",
              lastModified: data.lastModified || "",
            };
          } catch {
            return null;
          }
        })
        .filter((x): x is { ticketKey: string; status: string; lastModified: string } => x !== null && !!x.ticketKey)
        .sort((a, b) => b.lastModified.localeCompare(a.lastModified));

      const active = candidates.find((c) => c.status !== "completed");
      return active?.ticketKey || candidates[0]?.ticketKey;
    } catch {
      return undefined;
    }
  }
}
