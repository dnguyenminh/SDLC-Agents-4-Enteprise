/**
 * DevOpsNode — KSA-210, KSA-242
 * DevOps agent node. Handles deployment guide creation (DPG/RLN),
 * deployment execution, and release process.
 * KSA-242: Added template refs, steering injection, KB ingest, diagram requirements.
 */

import { BaseNode } from "./base-node";
import { PipelineState, AgentOutput, DocumentState } from "../state";
import { loadSteeringRules, injectSteering } from "../steering-loader";

/** Template paths for DevOps documents */
const DEVOPS_TEMPLATES = {
  DPG: "documents/templates/DPG-TEMPLATE.md",
  RLN: "documents/templates/RLN-TEMPLATE.md",
} as const;

const DEVOPS_SYSTEM_PROMPT_FALLBACK = `You are a DevOps Engineer agent for an SDLC pipeline.
Your responsibilities:

DEPLOYMENT PLANNING:
- Create DPG (Deployment Guide) with step-by-step deployment instructions
- Create RLN (Release Notes) summarizing changes
- Define rollback procedures
- Specify pre/post-deployment checks
- Follow the provided template structures EXACTLY

DEPLOYMENT EXECUTION:
- Execute deployment according to DPG steps
- Run sanity tests after deployment
- Handle rollback if sanity fails

RELEASE PROCESS:
- Merge branch to master (--no-ff)
- Create version tag (semver)
- Update changelog in README

DIAGRAM RULES (MANDATORY):
- MUST create draw.io diagrams: deployment-flow.drawio + rollback-flow.drawio
- All diagrams stored at documents/{TICKET}/diagrams/
- Each diagram has both .drawio (source) and .png (rendered)
- XML must start with <mxGraphModel>, NOT <mxfile>
- Include Diagram Index table in appendix

Always include rollback plans and health check verification.`;

export class DevOpsNode extends BaseNode {
  async execute(state: PipelineState): Promise<Partial<PipelineState>> {
    this.streamHandler.emitToken(
      this.nodeId,
      `[DevOps] Preparing deployment for ${state.ticketKey}...`,
      state.currentStreamId
    );

    const llmAvailable = await this.isLlmAvailable();
    let result: string;

    if (llmAvailable) {
      // Step 0: Scan existing infrastructure (matches Kiro devops-agent Step 1)
      this.streamHandler.emitToken(this.nodeId, `  → Step 0: Scanning existing infrastructure...`, state.currentStreamId);
      const dockerfileContent = await this.readWorkspaceFile("Dockerfile") || "";
      const dockerComposeContent = await this.readWorkspaceFile("docker-compose.yml") || "";
      const ciContent = await this.readWorkspaceFile(".github/workflows/ci.yml")
        || await this.readWorkspaceFile(".gitlab-ci.yml")
        || await this.readWorkspaceFile("Jenkinsfile")
        || "";

      const infraContext = [
        dockerfileContent ? `## Dockerfile\n\n${dockerfileContent.slice(0, 3000)}` : "",
        dockerComposeContent ? `## docker-compose.yml\n\n${dockerComposeContent.slice(0, 3000)}` : "",
        ciContent ? `## CI/CD Config\n\n${ciContent.slice(0, 3000)}` : "",
      ].filter(Boolean).join("\n\n");

      // Step 1: Read templates
      this.streamHandler.emitToken(this.nodeId, `  → Step 1: Reading templates...`, state.currentStreamId);
      const dpgTemplate = await this.readWorkspaceFile(DEVOPS_TEMPLATES.DPG) || "[DPG template not found]";
      const rlnTemplate = await this.readWorkspaceFile(DEVOPS_TEMPLATES.RLN) || "[RLN template not found]";

      // Step 2: Read TDD/FSD from KB
      let kbContext = "";
      try { kbContext = await this.kbSearch(`${state.ticketKey} TDD deployment architecture environment`); } catch { /* */ }

      const userPrompt = `Create Deployment Guide and Release Notes for ${state.ticketKey}.

## DPG TEMPLATE\n\n${dpgTemplate}

## RLN TEMPLATE\n\n${rlnTemplate}

${infraContext ? `## EXISTING INFRASTRUCTURE\n\n${infraContext}` : ""}

TDD: ${state.documents.tdd?.path || "documents/" + state.ticketKey + "/TDD.md"}
FSD: ${state.documents.fsd?.path || "documents/" + state.ticketKey + "/FSD.md"}

${kbContext ? `## KB CONTEXT\n\n${kbContext}` : ""}

Generate:
1. DPG.md — Deployment Guide:
   - Pre-deployment checklist
   - Step-by-step deployment instructions
   - Post-deployment verification
   - Rollback plan with steps
   - Deployment architecture diagram description

2. RLN.md — Release Notes:
   - Version number
   - Changes summary (features, fixes, improvements)
   - Breaking changes (if any)
   - Migration instructions (if any)
   - Known issues

DIAGRAMS (MANDATORY):
- Create documents/${state.ticketKey}/diagrams/deployment-flow.drawio + .png
- Create documents/${state.ticketKey}/diagrams/rollback-flow.drawio + .png
- Include Diagram Index table in appendix`;

      // KSA-242: Inject steering rules
      const workspaceRoot = require("vscode").workspace.workspaceFolders?.[0]?.uri.fsPath;
      let systemPrompt = await this.loadAgentPrompt("devops-agent", DEVOPS_SYSTEM_PROMPT_FALLBACK);
      if (workspaceRoot) {
        const rules = await loadSteeringRules(workspaceRoot, "langgraph");
        systemPrompt = injectSteering(systemPrompt, rules);
      }
      result = await this.callLlmStreamFull(systemPrompt, userPrompt, state);
    } else {
      result = await this.callMcp("invoke_sub_agent", {
        name: "devops-agent",
        prompt: `Tao Deployment Guide va Release Notes cho ${state.ticketKey}. PHAI tao draw.io diagrams (deployment-flow.drawio + rollback-flow.drawio) va export PNG. Templates: ${DEVOPS_TEMPLATES.DPG}, ${DEVOPS_TEMPLATES.RLN}`,
      });
    }

    // KSA-242: Ingest documents into KB
    try {
      await this.callMcp("mem_ingest", {
        content: result,
        type: "DOCUMENT",
        source: "langgraph-devops-dpg-rln",
        tags: [state.ticketKey, "DPG", "RLN", "devops-agent", "langgraph"],
        scope: "USER",
      });
    } catch {
      // KB ingest failure is non-blocking
    }

    const output: AgentOutput = {
      nodeId: this.nodeId,
      content: result,
      timestamp: new Date().toISOString(),
      metadata: { phase: "deployment", action: "create_dpg_rln", usedLlm: llmAvailable, kbIngested: true },
    };

    const documents = { ...state.documents };
    documents.dpg = {
      status: "done",
      version: (documents.dpg?.version || 0) + 1,
      path: `documents/${state.ticketKey}/DPG.md`,
      completedAt: new Date().toISOString(),
    } satisfies DocumentState;
    documents.rln = {
      status: "done",
      version: (documents.rln?.version || 0) + 1,
      path: `documents/${state.ticketKey}/RLN.md`,
      completedAt: new Date().toISOString(),
    } satisfies DocumentState;

    // Auto-promote all ticket-related USER entries to PROJECT on deploy/release
    try {
      await this.callMcp("mem_promote", {
        action: "promote_on_merge",
        ticket_key: state.ticketKey,
      });
    } catch {
      // Non-blocking — promotion failure shouldn't block deployment
    }

    return {
      agentOutputs: [output],
      documents,
    };
  }
}
