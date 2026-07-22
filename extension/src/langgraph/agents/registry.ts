import * as fs from "fs";
import * as path from "path";
import { PipelineExtractor, type PipelineDefinition, type PhaseDefinition, type AgentRelation } from "./pipeline-extractor";
import type { LlmProvider } from "../core/llm-provider";
import { debugError } from "../../debug-logger";

export interface AgentConfig {
  id: string;
  label: string;
  type: "agent" | "verify" | "gate";
  phase: string;
  outputDoc?: string;
  targetNode?: string;
  stepFilePath?: string;
}

class AgentRegistry {
  private agents: Map<string, AgentConfig> = new Map();
  private phaseIndex: Map<string, string[]> = new Map();
  private pipeline: PipelineDefinition | null = null;
  private initialized = false;

  load(workspaceRoot: string): void {
    const agentsDir = path.join(workspaceRoot, ".kiro", "agents");

    if (fs.existsSync(agentsDir)) {
      const mdFiles = fs.readdirSync(agentsDir)
        .filter(f => f.endsWith(".md") && !f.startsWith("prompts"))
        .map(f => path.join(agentsDir, f));

      for (const file of mdFiles) {
        const cfg = this.parseAgentFile(file);
        if (cfg) this.register(cfg);
      }
    }

    this.generateDefaultInfraNodes();
    this.initialized = true;
  }

  private generateDefaultInfraNodes(): void {
    const phaseSet = new Set<string>();
    for (const [id, cfg] of this.agents.entries()) {
      if (cfg.type === "agent" && cfg.phase) phaseSet.add(cfg.phase);
    }

    for (const phase of phaseSet) {
      const verifyId = `verify_${phase}`;
      if (!this.agents.has(verifyId)) {
        const agentForPhase = this.getPhaseNodes(phase).find(id => this.agents.get(id)?.type === "agent");
        this.register({
          id: verifyId, label: `Verify ${phase}`, type: "verify",
          phase, targetNode: agentForPhase || undefined,
        });
      }
      const gateId = `quality_gate_${phase}`;
      if (!this.agents.has(gateId)) {
        this.register({
          id: gateId, label: `Quality Gate - ${phase}`, type: "gate", phase,
        });
      }
    }
  }

  async loadPipeline(workspaceRoot: string, llm: LlmProvider): Promise<void> {
    const agentsDir = path.join(workspaceRoot, ".kiro", "agents");
    if (!fs.existsSync(agentsDir)) {
      this.pipeline = null;
      return;
    }

    const mdFiles = fs.readdirSync(agentsDir)
      .filter(f => f.endsWith(".md") && !f.startsWith("prompts"))
      .map(f => path.join(agentsDir, f));

    const agentContents = mdFiles.map(file => {
      const id = path.basename(file, ".md");
      const content = fs.readFileSync(file, "utf-8");
      return { id, content };
    });

    if (agentContents.length === 0) return;

    this.removeGeneratedInfraNodes();

    // LLM-based pipeline extraction is non-deterministic and can fail
    // (malformed JSON, provider timeout, etc.). On failure, fall back to
    // the statically-parsed phases so the pipeline remains usable.
    const extractor = new PipelineExtractor();
    try {
      this.pipeline = await extractor.extract(agentContents, llm);
    } catch (err) {
      debugError("[AgentRegistry] PipelineExtractor failed, using fallback phases", err as Error);
      this.pipeline = { phases: this.buildFallbackPhases(), relations: [] };
    }

    this.generateInfraNodes();
  }

  private removeGeneratedInfraNodes(): void {
    const toRemove: string[] = [];
    for (const [id, cfg] of this.agents.entries()) {
      if (cfg.type === "verify" || cfg.type === "gate") toRemove.push(id);
    }
    for (const id of toRemove) {
      this.agents.delete(id);
      for (const [, ids] of this.phaseIndex.entries()) {
        const idx = ids.indexOf(id);
        if (idx >= 0) ids.splice(idx, 1);
      }
    }
  }

  private generateInfraNodes(): void {
    if (!this.pipeline) return;

    const generated = new Set<string>();

    for (const phase of this.getPhases()) {
      const verifyId = `verify_${phase.id}`;
      if (!generated.has(verifyId) && phase.agentIds.length > 0) {
        const reviewsThis = this.pipeline!.relations.filter(
          r => r.phaseId === phase.id && r.type === "reviews"
        );
        const targetNode = reviewsThis.length > 0
          ? reviewsThis[0].sourceId
          : phase.agentIds[0];

        this.register({
          id: verifyId,
          label: `Verify ${phase.label}`,
          type: "verify",
          phase: phase.id,
          targetNode,
        });
        generated.add(verifyId);
      }

      const gateId = `quality_gate_${phase.id}`;
      if (!generated.has(gateId)) {
        this.register({
          id: gateId,
          label: `Quality Gate - ${phase.label}`,
          type: "gate",
          phase: phase.id,
        });
        generated.add(gateId);
      }
    }
  }

  getPipeline(): PipelineDefinition | null {
    return this.pipeline;
  }

  getPhases(): PhaseDefinition[] {
    if (this.pipeline && this.pipeline.phases.length > 0) {
      return [...this.pipeline.phases].sort((a, b) => a.order - b.order);
    }
    return this.buildFallbackPhases();
  }

  getPhaseOrder(): string[] {
    return this.getPhases().map(p => p.id);
  }

  getRelations(): AgentRelation[] {
    return this.pipeline?.relations ?? [];
  }

  private buildFallbackPhases(): PhaseDefinition[] {
    const defaultOrder = ["requirements", "specification", "design", "test_planning",
      "implementation", "user_guide", "testing", "deployment"];
    const seen = new Set<string>();
    const result: PhaseDefinition[] = [];

    for (const phase of defaultOrder) {
      if (seen.has(phase)) continue;
      const phaseAgentIds = this.getPhaseNodes(phase).filter(id => this.agents.get(id)?.type === "agent");
      if (phaseAgentIds.length > 0) {
        result.push({
          id: phase, label: phase.charAt(0).toUpperCase() + phase.slice(1).replace("_", " "),
          order: result.length, agentIds: phaseAgentIds,
        });
        seen.add(phase);
      }
    }

    for (const [phase, ids] of this.phaseIndex.entries()) {
      if (seen.has(phase)) continue;
      const phaseAgentIds = ids.filter(id => this.agents.get(id)?.type === "agent");
      if (phaseAgentIds.length > 0) {
        result.push({
          id: phase, label: phase.charAt(0).toUpperCase() + phase.slice(1),
          order: result.length, agentIds: phaseAgentIds,
        });
        seen.add(phase);
      }
    }

    if (result.length === 0) {
      for (const [id, cfg] of this.agents.entries()) {
        if (cfg.type !== "agent") continue;
        result.push({
          id: cfg.phase || id, label: cfg.label, order: result.length, agentIds: [id],
        });
      }
    }

    return result;
  }

  getPhaseVerifyId(phaseId: string): string | undefined {
    return this.agents.has(`verify_${phaseId}`) ? `verify_${phaseId}` : undefined;
  }

  getPhaseGateId(phaseId: string): string | undefined {
    return this.agents.has(`quality_gate_${phaseId}`) ? `quality_gate_${phaseId}` : undefined;
  }

  private parseAgentFile(filePath: string): AgentConfig | null {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const fm = this.parseFrontmatter(content);
      if (!fm || !fm.name) return null;

      return {
        id: fm.name,
        label: fm.label || fm.name,
        type: "agent",
        phase: fm.phase || "requirements",
        outputDoc: fm.outputDoc,
        stepFilePath: filePath,
      };
    } catch (err) {
      debugError("[AgentRegistry] parseAgentFile failed for " + filePath, err as Error);
      return null;
    }
  }

  private parseFrontmatter(content: string): Record<string, any> | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;
    const yaml = match[1];
    const result: Record<string, any> = {};
    let currentKey: string | null = null;
    let currentValue = "";
    let isInMultiline = false;

    for (const line of yaml.split("\n")) {
      if (isInMultiline) {
        if (line.startsWith("  ") || line.trim() === "") {
          currentValue += line.trim() + "\n";
          continue;
        }
        result[currentKey!] = currentValue.trim();
        isInMultiline = false;
      }

      const keyMatch = line.match(/^(\w+):\s*(.*)/);
      if (keyMatch) {
        currentKey = keyMatch[1];
        const rest = keyMatch[2].trim();
        if (rest === ">" || rest === "|") {
          isInMultiline = true;
          currentValue = "";
          continue;
        }
        if (rest.startsWith(">") || rest.startsWith("|")) {
          isInMultiline = true;
          currentValue = rest.replace(/^>\s*/, "").replace(/^\|\s*/, "") + "\n";
          continue;
        }
        if (rest.startsWith("[")) {
          try { result[currentKey] = JSON.parse(rest.replace(/'/g, '"')); } catch (parseErr) { console.debug("[AgentRegistry] parseFrontmatter array value - using raw string"); result[currentKey] = rest; }
          continue;
        }
        result[currentKey] = rest.replace(/^["']|["']$/g, "");
      }
    }
    if (isInMultiline && currentKey) result[currentKey] = currentValue.trim();
    return result;
  }

  private register(cfg: AgentConfig): void {
    this.agents.set(cfg.id, cfg);
    if (!this.phaseIndex.has(cfg.phase)) this.phaseIndex.set(cfg.phase, []);
    this.phaseIndex.get(cfg.phase)!.push(cfg.id);
  }

  resolveStepId(stepId: string): AgentConfig | undefined {
    if (this.agents.has(stepId)) return this.agents.get(stepId);
    const prefix = stepId.split("_")[0];
    const candidate = `${prefix}-agent`;
    if (this.agents.has(candidate)) return this.agents.get(candidate);
    return undefined;
  }

  getAllStepIds(): string[] {
    return Array.from(this.agents.keys());
  }

  isInitialized(): boolean { return this.initialized; }
  getAgentConfig(id: string): AgentConfig | undefined { return this.agents.get(id); }
  getAllAgentIds(): string[] { return Array.from(this.agents.keys()); }
  getPhaseNodes(phase: string): string[] { return this.phaseIndex.get(phase) ?? []; }

  getFirstAgentNode(phase: string): string | undefined {
    const phaseAgents = this.phaseIndex.get(phase);
    if (!phaseAgents) return undefined;
    for (const id of phaseAgents) {
      if (this.agents.get(id)?.type === "agent") return id;
    }
    return phaseAgents[0];
  }

  advancePhase(currentPhase: string): string | undefined {
    const order = this.getPhaseOrder();
    const idx = order.indexOf(currentPhase);
    if (idx < 0 || idx >= order.length - 1) return undefined;
    return order[idx + 1];
  }
}

export const agentRegistry = new AgentRegistry();

