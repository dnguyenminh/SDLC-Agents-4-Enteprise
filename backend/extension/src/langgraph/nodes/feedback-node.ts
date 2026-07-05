/**
 * FeedbackNode — KSA-210
 * BA <-> SA feedback loop controller.
 * Checks for discrepancies between FSD and TDD, triggers BA fix if needed.
 * Max 5 iterations before escalating to user.
 */

import { BaseNode } from "./base-node";
import { PipelineState, AgentOutput } from "../state";

export class FeedbackNode extends BaseNode {
  async execute(state: PipelineState): Promise<Partial<PipelineState>> {
    const iteration = state.feedbackIterations;
    const maxIterations = state.maxFeedbackIterations;

    this.streamHandler.emitToken(
      this.nodeId,
      `[Feedback] Checking discrepancy — iteration ${iteration + 1}/${maxIterations}`,
      state.currentStreamId
    );

    // Check if discrepancy was found by SA
    if (!state.discrepancyFound) {
      // No discrepancy — proceed to quality gate
      const output: AgentOutput = {
        nodeId: this.nodeId,
        content: `No discrepancy found. FSD and TDD are consistent.`,
        timestamp: new Date().toISOString(),
        metadata: { action: "feedback_check", discrepancy: false, iteration },
      };

      return {
        agentOutputs: [output],
        feedbackIterations: iteration,
      };
    }

    // Discrepancy found — check iteration limit
    if (iteration >= maxIterations) {
      const output: AgentOutput = {
        nodeId: this.nodeId,
        content: `Max feedback iterations (${maxIterations}) reached. Escalating to user.`,
        timestamp: new Date().toISOString(),
        metadata: { action: "feedback_escalate", iteration },
      };

      return {
        agentOutputs: [output],
        pipelineStatus: "paused",
        discrepancyFound: false, // Reset to break loop
        feedbackIterations: iteration,
      };
    }

    // Discrepancy exists and within limit — trigger BA fix
    const output: AgentOutput = {
      nodeId: this.nodeId,
      content: `Discrepancy detected (iteration ${iteration + 1}). Routing to BA for FSD fix.`,
      timestamp: new Date().toISOString(),
      metadata: { action: "feedback_loop", iteration: iteration + 1 },
    };

    return {
      agentOutputs: [output],
      feedbackIterations: iteration + 1,
    };
  }
}
