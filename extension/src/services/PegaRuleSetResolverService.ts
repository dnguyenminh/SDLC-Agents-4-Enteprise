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
import { getSetting } from "../config/settings-migration";
import {
  checkRuleSetOpenStatus as checkRuleSetOpenStatusImpl,
  resolveRuleWriteContext as resolveRuleWriteContextImpl,
} from "./pega-ruleset-write-context";

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
   * Developer short name: setting `sdlcAgents.pega.developerShortName`
   * (SA4E-370; legacy `pegaDeveloperShortName` still honored), fallback phần
   * trước `@` của `pega.username` (vd user@org => user).
   */
  public getDeveloperShortName(): string {
    const fromSetting = getSetting<string>("pega.developerShortName","pega.developerShortName", "").trim();
    if (fromSetting) return fromSetting;
    const username = getSetting<string>("pega.username","pega.username", "").trim();
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
    return checkRuleSetOpenStatusImpl(this.client, name, version);
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
    return resolveRuleWriteContextImpl(this.client, rulePayload);
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
