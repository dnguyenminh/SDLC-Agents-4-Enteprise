/**
 * Conditional Edge Routing --- KSA-210
 * Full SDLC pipeline routing logic with quality gates and parallel fanout.
 */

import { PipelineState } from "./state";

export {
  routeAfterFeedbackCheck, routeAfterBaFixFsd, routeAfterSaReview,
  routeAfterVerify, routeAfterStrategySwitch,
} from "./edges-feedback";

// === Phase Ordering ===

const PHASE_ORDER: string[] = [
  "requirements", "specification", "design", "test_planning",
  "implementation", "user_guide", "testing", "deployment",
];

// === SM Routing ===

export function routeFromSm(state: PipelineState): string {
  switch (state.currentPhase) {
    case "requirements": return "ba_brd";
    case "specification": return "ba_fsd";
    case "design": return "sa_tdd";
    case "test_planning": return "qa_plan";
    case "implementation": return "dev_code";
    case "user_guide": return "dev_ug";
    case "testing": return "qa_test";
    case "deployment": return "devops_deploy";
    case "all": return "ba_brd";
    default: return "ba_brd";
  }
}

// === Post-Node Routing ===

export function routeAfterBaBrd(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "quality_gate_requirements";
}

export function routeAfterTaEnrich(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "quality_gate_specification";
}

export function routeAfterSaTdd(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "feedback_check";
}

export function routeAfterQaPlan(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "quality_gate_test_planning";
}

export function routeAfterDevCode(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "quality_gate_implementation";
}

export function routeAfterUgJoin(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "quality_gate_user_guide";
}

export function routeAfterQaTest(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "quality_gate_testing";
}

export function routeAfterDevOpsDeploy(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "quality_gate_deployment";
}

// === Quality Gate Routing ===

export function routeAfterQualityGate(state: PipelineState): string {
  if (state.pipelineStatus === "paused") return "__end__";
  if (!state.approvalDecision) return "__end__";
  switch (state.approvalDecision) {
    case "approve": return advanceToNextPhase(state.currentPhase);
    case "reject": return "__end__";
    case "revise": return getPhaseNode(state.currentPhase);
    default: return "__end__";
  }
}

// === Parallel UG Routing ===

export function routeAfterDevUg(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "ba_review_ug";
}

export function routeAfterBaReviewUg(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "qa_verify_ug";
}

export function routeAfterQaVerifyUg(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "ug_join";
}

// === Helper Functions ===

function getPhaseNode(phase: string): string {
  const phaseNodes: Record<string, string> = {
    requirements: "ba_brd", specification: "ba_fsd", design: "sa_tdd",
    test_planning: "qa_plan", implementation: "dev_code",
    user_guide: "dev_ug", testing: "qa_test", deployment: "devops_deploy",
  };
  return phaseNodes[phase] || "__end__";
}

function advanceToNextPhase(currentPhase: string): string {
  const idx = PHASE_ORDER.indexOf(currentPhase);
  if (idx === -1 || idx >= PHASE_ORDER.length - 1) return "__end__";
  return "sm";
}

// === Legacy Compatibility ===

/** @deprecated Use phase-specific route functions instead */
export function routeAfterNode(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "approval";
}

/** @deprecated Use routeAfterQualityGate instead */
export function routeAfterApproval(state: PipelineState): string {
  return routeAfterQualityGate(state);
}
