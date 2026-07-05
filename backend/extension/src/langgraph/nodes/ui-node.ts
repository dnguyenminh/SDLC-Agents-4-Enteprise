/**
 * UiNode — KSA-210, KSA-242
 * UI Designer agent node. Creates wireframes and UI specifications
 * based on FSD UI sections (Phase 2.5).
 * KSA-242: Added template ref, steering injection, diagram requirements.
 */

import { BaseNode } from "./base-node";
import { PipelineState, AgentOutput } from "../state";
import { loadSteeringRules, injectSteering } from "../steering-loader";

/** Template path for UI Spec */
const UI_SPEC_TEMPLATE = "documents/templates/UI-SPEC-TEMPLATE.md";

const UI_SYSTEM_PROMPT_FALLBACK = `You are a UI Designer agent for an SDLC pipeline.
Your role is to create wireframes and detailed UI specifications based on the FSD.

Responsibilities:
- Create wireframe layouts for each screen/page
- Define component hierarchy and interactions
- Specify responsive breakpoints
- Define color schemes, typography, spacing
- Create UI flow diagrams (navigation paths)
- Annotate accessibility requirements (ARIA labels, keyboard nav)
- Follow the provided UI-SPEC template structure EXACTLY

DIAGRAM RULES (MANDATORY):
- Output wireframes in draw.io format
- All diagrams stored at documents/{TICKET}/diagrams/
- Each diagram has both .drawio (source) and .png (rendered)
- XML must start with <mxGraphModel>, NOT <mxfile>
- Include Diagram Index table in appendix

Output wireframes in draw.io format and UI specs in Markdown.`;

export class UiNode extends BaseNode {
  async execute(state: PipelineState): Promise<Partial<PipelineState>> {
    this.streamHandler.emitToken(
      this.nodeId,
      `[UI] Creating wireframes for ${state.ticketKey}...`,
      state.currentStreamId
    );

    const llmAvailable = await this.isLlmAvailable();
    let result: string;

    if (llmAvailable) {
      const userPrompt = `Create UI wireframes and specifications for ${state.ticketKey}.

TEMPLATE: Read and follow ${UI_SPEC_TEMPLATE}

FSD: ${state.documents.fsd?.path || "documents/" + state.ticketKey + "/FSD.md"}

Based on the FSD UI Specifications section, create:
1. Wireframe layouts for each screen (describe in detail)
2. Component hierarchy
3. Interaction patterns (hover, click, transitions)
4. Responsive behavior
5. Accessibility annotations
6. Navigation flow

DIAGRAMS (MANDATORY):
- Create wireframe .drawio files for each screen
- Create documents/${state.ticketKey}/diagrams/ui-flow.drawio + .png
- Include Diagram Index table in appendix`;

      // KSA-242: Inject steering rules
      const workspaceRoot = require("vscode").workspace.workspaceFolders?.[0]?.uri.fsPath;
      let systemPrompt = await this.loadAgentPrompt("ui-agent", UI_SYSTEM_PROMPT_FALLBACK);
      if (workspaceRoot) {
        const rules = await loadSteeringRules(workspaceRoot, "langgraph");
        systemPrompt = injectSteering(systemPrompt, rules);
      }
      result = await this.callLlmStreamFull(systemPrompt, userPrompt, state);
    } else {
      result = await this.callMcp("invoke_sub_agent", {
        name: "ui-agent",
        prompt: `Tao wireframes cho ${state.ticketKey}. Doc FSD de hieu UI specs. Template: ${UI_SPEC_TEMPLATE}. PHAI tao draw.io wireframes va export PNG.`,
      });
    }

    const output: AgentOutput = {
      nodeId: this.nodeId,
      content: result,
      timestamp: new Date().toISOString(),
      metadata: { phase: "specification", action: "create_wireframes", usedLlm: llmAvailable },
    };

    return {
      agentOutputs: [output],
    };
  }
}
