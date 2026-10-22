/**
 * Unit tests for PegaRuleSetResolverService — ruleset open/closed detection,
 * target resolution for new/existing rules, and branch naming conventions.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";
import { PegaRuleSetResolverService, SaveRuleOptions } from "../services/PegaRuleSetResolverService";
import { PegaHttpClient } from "../services/PegaHttpClient";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue: unknown) => {
        if (key === "pega.developerShortName") return "";
        if (key === "pega.username") return "SSA@TGB";
        return defaultValue;
      }),
    })),
    workspaceFolders: [{ uri: { fsPath: "C:\\work\\pega-project" } }],
  },
}));

class StubPegaClient {
  private rulesetStatus: Record<string, { open: boolean; exists: boolean }> = {};
  private hierarchy: { ruleSets: string[] } = { ruleSets: ["HRAppsV2:01-01-01"] };

  mockRuleSet(name: string, version: string, open: boolean) {
    this.rulesetStatus[`${name.toUpperCase()} ${version}`] = { open, exists: true };
  }

  mockHierarchy(ruleSets: string[]) {
    this.hierarchy = { ruleSets };
  }

  async getRuleByInsKey(insKey: string): Promise<Record<string, unknown>> {
    const parts = insKey.split(" ");
    const name = parts[1];
    const version = parts.slice(2).join(" ");
    const status = this.rulesetStatus[`${name} ${version}`];
    if (!status || !status.exists) throw new Error(`Rule not found: ${insKey}`);
    return { pxObjClass: "Rule-RuleSet-Version", pyRuleSetName: name, pyVersion: version, pyOpen: status.open };
  }

  async resolveDeterministicPegaHierarchy() {
    return { seeds: [], operatorId: "SSA", accessGroup: "HRApps:Administrators", appName: "HRAppsV2", appVersion: "01.01", ruleSets: this.hierarchy.ruleSets, dependedApps: [] };
  }
}

describe("PegaRuleSetResolverService", () => {
  let client: StubPegaClient;
  let resolver: PegaRuleSetResolverService;

  beforeEach(() => {
    client = new StubPegaClient();
    resolver = new PegaRuleSetResolverService(client as unknown as PegaHttpClient);
  });

  describe("developer short name", () => {
    it("falls back to pegaUsername before @", () => {
      expect(resolver.getDeveloperShortName()).toBe("SSA");
    });

    it("uses explicit setting when configured", () => {
      const m = vi.mocked(vscode.workspace.getConfiguration);
      m.mockReturnValueOnce({
        get: vi.fn((key: string) => {
          if (key === "pega.developerShortName") return "dnguyen";
          return "";
        }),
      } as any);
      expect(resolver.getDeveloperShortName()).toBe("dnguyen");
    });
  });

  describe("branch naming", () => {
    it("builds branch name from short name + ticket id", () => {
      expect(resolver.buildBranchName("SSA", "SA4E-58")).toBe("SSA_SA4E-58");
    });

    it("sanitizes unsafe characters", () => {
      expect(resolver.buildBranchName("ss a", "SA4E:58/1")).toBe("ssa_SA4E581");
    });

    it("builds branch version as baseVersion:branchName", () => {
      expect(resolver.buildBranchVersion("01-01-01", "SSA_SA4E-58")).toBe("01-01-01:SSA_SA4E-58");
    });
  });

  describe("ruleset open status", () => {
    it("detects open ruleset version", async () => {
      client.mockRuleSet("HRAppsV2", "01-01-01", true);
      const info = await resolver.checkRuleSetOpenStatus("HRAppsV2", "01-01-01");
      expect(info.open).toBe(true);
      expect(info.exists).toBe(true);
    });

    it("detects closed ruleset version", async () => {
      client.mockRuleSet("HRAppsV2", "01-01-01", false);
      const info = await resolver.checkRuleSetOpenStatus("HRAppsV2", "01-01-01");
      expect(info.open).toBe(false);
    });

    it("returns exists=false when ruleset version not found", async () => {
      const info = await resolver.checkRuleSetOpenStatus("Unknown", "99-99-99");
      expect(info.open).toBe(false);
      expect(info.exists).toBe(false);
    });
  });

  describe("rule write context resolution", () => {
    it("saves existing rule directly into its open ruleset version", async () => {
      client.mockRuleSet("HRAppsV2", "01-01-01", true);
      const context = await resolver.resolveRuleWriteContext({
        pxObjClass: "Rule-Obj-Activity",
        pyRuleName: "MyActivity",
        pyRuleSet: "HRAppsV2",
        pyRuleSetVersion: "01-01-01",
        pzInsKey: "RULE-OBJ-ACTIVITY ...",
      });
      expect(context.ruleType).toBe("existing");
      expect(context.suggestedTarget.source).toBe("direct");
      expect(context.suggestedTarget.pyRuleSetVersion).toBe("01-01-01");
      expect(context.warnings).toHaveLength(0);
    });

    it("suggests open stack version for new rule", async () => {
      client.mockRuleSet("HRAppsV2", "01-01-01", true);
      client.mockHierarchy(["HRAppsV2:01-01-01"]);
      const context = await resolver.resolveRuleWriteContext({
        pxObjClass: "Rule-Obj-Activity",
        pyRuleName: "BrandNewActivity",
      });
      expect(context.ruleType).toBe("new");
      expect(context.suggestedTarget.source).toBe("direct");
      expect(context.suggestedTarget.pyRuleSet).toBe("HRAppsV2");
      expect(context.suggestedTarget.pyRuleSetVersion).toBe("01-01-01");
    });

    it("warns and suggests open version when existing rule is in closed version", async () => {
      client.mockRuleSet("HRAppsV2", "01-01-01", false);
      client.mockRuleSet("HRAppsV2", "02-02-02", true);
      client.mockHierarchy(["HRAppsV2:02-02-02"]);
      const context = await resolver.resolveRuleWriteContext({
        pxObjClass: "Rule-Obj-Activity",
        pyRuleName: "OldActivity",
        pyRuleSet: "HRAppsV2",
        pyRuleSetVersion: "01-01-01",
      });
      expect(context.ruleType).toBe("existing");
      expect(context.suggestedTarget.pyRuleSetVersion).toBe("02-02-02");
      expect(context.warnings.some((w) => w.includes("không open"))).toBe(true);
    });

    it("returns blocking warning when no ruleset version is open", async () => {
      client.mockRuleSet("HRAppsV2", "01-01-01", false);
      const context = await resolver.resolveRuleWriteContext({
        pxObjClass: "Rule-Obj-Activity",
        pyRuleName: "BlockedActivity",
      });
      expect(context.candidates.every((c) => !c.open)).toBe(true);
      expect(context.warnings.some((w) => w.includes("checkout") || w.includes("branch"))).toBe(true);
    });
  });

  describe("branch context resolution", () => {
    it("returns null when no ticket/cr id", async () => {
      const options: SaveRuleOptions = {};
      const branch = await resolver.resolveBranchContext(options);
      expect(branch).toBeNull();
    });

    it("builds branch context from ticket id", async () => {
      const branch = await resolver.resolveBranchContext({ ticketId: "SA4E-58" });
      expect(branch).not.toBeNull();
      expect(branch!.branchName).toBe("SSA_SA4E-58");
      expect(branch!.branchVersion).toBe("01-01-01:SSA_SA4E-58");
    });

    it("prefers explicit developer short name", async () => {
      const branch = await resolver.resolveBranchContext({ ticketId: "SA4E-58", developerShortName: "dnguyen" });
      expect(branch!.branchName).toBe("dnguyen_SA4E-58");
    });

    it("uses crId as fallback to ticketId", async () => {
      const branch = await resolver.resolveBranchContext({ crId: "CR-1234" });
      expect(branch!.branchName).toBe("SSA_CR-1234");
    });
  });
});

