/**
 * Self-correction and feedback loop edge routing --- KSA-233
 */

import { PipelineState } from "./state";

// === Feedback Loop Routing ===

/** After feedback check node: route based on discrepancy status */
export function routeAfterFeedbackCheck(state: PipelineState): string {
  if (!state.discrepancyFound) { return "security_review_tdd"; }
  if (state.feedbackIterations >= state.maxFeedbackIterations) { return "security_review_tdd"; }
  return "ba_fix_fsd";
}

/** After BA fixes FSD: route back to SA for re-review */
export function routeAfterBaFixFsd(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "sa_review";
}

/** After SA re-reviews: go back to feedback check */
export function routeAfterSaReview(state: PipelineState): string {
  if (state.pipelineStatus === "failed") return "__end__";
  return "feedback_check";
}

// === Self-Correction Routing (KSA-233) ===

/**
 * After verify node: route based on verification result.
 * Factory function returning a routing function for the specific verify node.
 */
export function routeAfterVerify(
  targetNodeId: string,
  nextNodeId: string
): (state: PipelineState) => string {
  return (state: PipelineState): string => {
    if (state.pipelineStatus === "failed") return "__end__";
    if (state.verifyPassed) { return nextNodeId; }
    const attempts = state.verifyAttempts?.[targetNodeId] ?? 0;
    const maxAttempts = state.maxVerifyAttempts ?? 2;
    if (attempts >= maxAttempts) { return "strategy_switch"; }
    return targetNodeId;
  };
}

/**
 * After strategy switch node: route to agent with alternate or pause.
 */
export function routeAfterStrategySwitch(state: PipelineState): string {
  if (state.pipelineStatus === "paused") { return "__end__"; }
  const targetNode = findStrategyTarget(state);
  return targetNode || "__end__";
}

function findStrategyTarget(state: PipelineState): string | null {
  const activeStrategies = state.activeStrategy || {};
  for (const [nodeId, strategy] of Object.entries(activeStrategies)) {
    if (strategy === "alternate") { return nodeId; }
  }
  return null;
}
