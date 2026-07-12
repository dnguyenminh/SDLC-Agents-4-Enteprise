import { PipelineState } from "../core/state";
import type { SDLCPhase } from "../core/state";
import { agentRegistry } from "../agents/registry";

export {
  routeAfterFeedbackCheck, routeAfterBaFixFsd, routeAfterSaReview,
  routeAfterVerify, routeAfterStrategySwitch,
} from "./edges-feedback";

// === SM Routing (data-driven via currentPhaseIndex) ===

export function resolvePhaseIndex(state: PipelineState): number {
  const pd = state.pipelineDefinition;
  if (!pd || pd.phases.length === 0) return -1;
  let idx = state.currentPhaseIndex;
  const phase = pd.phases[idx];
  if (!phase || phase.id !== state.currentPhase) {
    const realigned = pd.phases.findIndex(p => p.id === state.currentPhase);
    if (realigned !== -1) idx = realigned;
    else return -1; // Orphaned phase — deleted from pipeline definition
  }
  return idx;
}

export function routeFromSm(state: PipelineState): string {
  const pd = state.pipelineDefinition;
  if (pd && pd.phases.length > 0) {
    const idx = resolvePhaseIndex(state);
    if (idx >= 0) {
      const phase = pd.phases[idx];
      if (phase && phase.agentIds.length > 0) return phase.agentIds[0];
    }
    // Orphaned phase — route to advance_phase for skip handling
    return "advance_phase";
  }
  const firstNode = agentRegistry.getFirstAgentNode(state.currentPhase);
  return firstNode || "sm";
}

// === Security Scan → Quality Gate Routing ===

export function routeToSpecGate(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "quality_gate_specification";
}

export function routeToImplGate(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "quality_gate_implementation";
}

// === Junction → Quality Gate Routing ===

export function routeToUgGate(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "quality_gate_user_guide";
}

export function routeToTestingGate(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "quality_gate_testing";
}

export function routeToDeployGate(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "quality_gate_deployment";
}

// === UG Review Flow Routing ===

export function routeToQaAgent(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "qa-agent";
}

export function routeToUgJoin(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "ug_join";
}

// === Advance Phase Node Routing ===

export function routeAfterAdvance(state: PipelineState): string {
  if (state.pipelineStatus === "paused" || state.pipelineStatus === "failed" || state.pipelineStatus === "cancelled") return "__end__";
  const pd = state.pipelineDefinition;
  if (pd && pd.phases.length > 0 && state.currentPhaseIndex < pd.phases.length) {
    return "sm";
  }
  return "__end__";
}

// === Quality Gate Routing ===

export function routeAfterQualityGate(state: PipelineState): string {
  if (state.pipelineStatus === "paused") return "__end__";
  if (!state.approvalDecision) {
    if (state.rawHumanInput) return "analyze_input";
    return "__end__";
  }
  switch (state.approvalDecision) {
    case "approve": return "advance_phase";
    case "reject": return "__end__";
    case "revise": return getPhaseNode(state);
    default: return "__end__";
  }
}

// === Analyze Input Routing ===

export function routeAfterAnalyzeInput(state: PipelineState): string {
  if (!state.analyzedIntent) {
    return getPhaseNode(state);
  }
  switch (state.analyzedIntent.intent) {
    case "APPROVE":
      return "advance_phase";
    case "REJECT":
      return "__end__";
    case "NEED_CLARIFICATION":
    default:
      return getPhaseNode(state);
  }
}

// === Helpers ===

function buildQualityGateTargets(): Record<string, string> {
  const targets: Record<string, string> = {
    sm: "sm", advance_phase: "advance_phase", __end__: "__end__",
  };
  for (const id of agentRegistry.getAllAgentIds()) {
    targets[id] = id;
  }
  return targets;
}

function getPhaseNode(state: PipelineState): string {
  const pd = state.pipelineDefinition;
  if (pd && pd.phases.length > 0) {
    const idx = resolvePhaseIndex(state);
    if (idx >= 0) {
      const phase = pd.phases[idx];
      if (phase && phase.agentIds.length > 0) return phase.agentIds[0];
    }
  }
  const firstNode = agentRegistry.getFirstAgentNode(state.currentPhase);
  return firstNode || "sm";
}

export const QUALITY_GATE_TARGETS: Record<string, string> = buildQualityGateTargets();


