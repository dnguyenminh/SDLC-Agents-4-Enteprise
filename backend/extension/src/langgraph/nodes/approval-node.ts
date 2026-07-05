/**
 * ApprovalNode — KSA-210
 * Parameterized quality gate node. Creates phase-specific approval checkpoints
 * with detailed criteria from shared-quality-gates.md.
 * Each phase has its own instance: quality_gate_requirements, quality_gate_design, etc.
 */

import { BaseNode } from "./base-node";
import { McpBridge } from "../mcp-bridge";
import { StreamHandler } from "../stream-handler";
import { PipelineState, QualityGateCheckpoint, QualityGateResult, SDLCPhase } from "../state";
import type { LlmProvider } from "../llm-provider";

/** Quality gate criteria per phase (from shared-quality-gates.md) */
const PHASE_CRITERIA: Record<string, { gateId: string; criteria: string[] }> = {
  requirements: {
    gateId: "QG-01",
    criteria: [
      "BRD.md exists",
      ">=3 User Stories with Acceptance Criteria",
      "Business Flow Diagram (.drawio + .png)",
      "Use Case Diagram (.drawio + .png)",
      "Dependencies section present",
      "Non-Functional Requirements defined",
    ],
  },
  specification: {
    gateId: "QG-02",
    criteria: [
      "FSD.md exists",
      "Use Cases with Main/Alternative/Exception flows",
      "Business Rules table (BR- IDs)",
      "System Context Diagram (.drawio + .png)",
      "Sequence Diagram(s) (.drawio + .png)",
      "State Diagram (.drawio + .png)",
      "API Specifications present",
      "Error Handling section",
    ],
  },
  design: {
    gateId: "QG-03",
    criteria: [
      "TDD.md exists",
      "Architecture Overview section",
      "Class/Module Design section",
      "Architecture Diagram (.drawio + .png)",
      "Component Diagram (.drawio + .png)",
      "Implementation Checklist",
      "Error Handling section",
      "Security Design section",
    ],
  },
  test_planning: {
    gateId: "QG-04",
    criteria: [
      "STP.md exists",
      "STC.md exists",
      "6 test levels (PBT, UT, IT, E2E-API, E2E-UI, SIT)",
      "RTM (Requirements Traceability Matrix)",
      "Test Coverage Diagram (.drawio + .png)",
      "Test Execution Flow Diagram",
      "CSV test data files",
    ],
  },
  implementation: {
    gateId: "QG-05",
    criteria: [
      "Code files exist",
      "Code compiles without errors",
      "Unit tests pass",
      "Integration tests pass",
      "Coverage >= 80% for new code",
    ],
  },
  user_guide: {
    gateId: "QG-05.5",
    criteria: [
      "UG.md exists",
      "Installation/Quick Start section",
      "Configuration Reference with tables",
      "Usage section with examples",
      "Troubleshooting section",
      "Error Codes table",
      "BA review completed",
      "QA verification PASS",
    ],
  },
  testing: {
    gateId: "QG-06",
    criteria: [
      "All automated tests pass",
      "No critical bugs open",
      "Performance acceptable",
      "TEST-REPORT.md exists",
      "IT tests use real integrations (not all-mock)",
    ],
  },
  deployment: {
    gateId: "QG-07",
    criteria: [
      "DPG.md exists",
      "Deployment Steps section",
      "Rollback Plan section",
      "Pre-Deployment Checklist",
      "Post-Deployment Verification steps",
      "Deployment Flow Diagram",
      "Rollback Flow Diagram",
    ],
  },
};

/**
 * Phase-specific approval node with targeted quality gate criteria.
 */
export class ApprovalNode extends BaseNode {
  private readonly phase: SDLCPhase;

  constructor(
    nodeId: string,
    phase: SDLCPhase,
    mcpBridge: McpBridge,
    streamHandler: StreamHandler,
    llmProvider?: LlmProvider
  ) {
    super(nodeId, mcpBridge, streamHandler, llmProvider);
    this.phase = phase;
  }

  async execute(state: PipelineState): Promise<Partial<PipelineState>> {
    const config = PHASE_CRITERIA[this.phase] || {
      gateId: "QG-00",
      criteria: ["Review and approve"],
    };

    const checkpoint: QualityGateCheckpoint = {
      gateId: config.gateId,
      phase: this.phase,
      nodeId: this.nodeId,
      summary: `Quality gate for ${this.phase} phase — ${state.ticketKey}`,
      criteria: config.criteria,
      timestamp: new Date().toISOString(),
    };

    this.streamHandler.emitToken(
      this.nodeId,
      `[${config.gateId}] Quality gate: ${this.phase} — ${config.criteria.length} criteria to verify`,
      state.currentStreamId
    );

    // Record quality gate result placeholder (will be filled by approval decision)
    const qgResult: QualityGateResult = {
      passed: false, // Will be true when approved
      issues: [],
    };

    return {
      approvalRequired: true,
      approvalDecision: null,
      userFeedback: null,
      pendingApprovals: [...(state.pendingApprovals || []), checkpoint],
      pipelineStatus: "paused",
      qualityGateResults: { [this.phase]: qgResult },
    };
  }
}
