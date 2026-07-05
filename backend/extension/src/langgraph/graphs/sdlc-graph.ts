/**
 * SDLC Subgraph — Full SDLC Pipeline graph wiring.
 * Node creation extracted to sdlc-node-factory.ts.
 */
import { StateGraph, END } from "@langchain/langgraph";
import { PipelineAnnotation, PipelineState } from "../state";
import { McpBridge } from "../mcp-bridge";
import { StreamHandler } from "../stream-handler";
import { WorkspaceCheckpointer } from "../checkpointer";
import type { LlmProvider } from "../llm-provider";
import { getAlternateStrategy } from "../config/alternate-strategies";
import { createSdlcNodes } from "./sdlc-node-factory";
import {
  routeFromSm, routeAfterTaEnrich, routeAfterDevCode, routeAfterUgJoin, routeAfterQaTest,
  routeAfterDevOpsDeploy, routeAfterFeedbackCheck, routeAfterBaFixFsd,
  routeAfterSaReview, routeAfterQualityGate, routeAfterBaReviewUg,
  routeAfterQaVerifyUg, routeAfterVerify, routeAfterStrategySwitch,
} from "../edges";

export async function buildSdlcSubgraph(
  mcpBridge: McpBridge, streamHandler: StreamHandler,
  checkpointer: WorkspaceCheckpointer, llmProvider?: LlmProvider
) {
  const n = createSdlcNodes(mcpBridge, streamHandler, llmProvider);

  async function strategySwitchNode(state: PipelineState): Promise<Partial<PipelineState>> {
    const failedNodeId = getLastFailedVerifyTarget(state);
    if (!failedNodeId) {
      return { pipelineStatus: "paused", approvalRequired: true, lastUpdatedAt: new Date().toISOString() };
    }
    const currentStrategy = state.activeStrategy?.[failedNodeId] ?? "primary";
    const alternateConfig = getAlternateStrategy(failedNodeId);
    if (currentStrategy === "alternate" || !alternateConfig) {
      streamHandler.emitHumanIntervention(failedNodeId, [currentStrategy], getVerifyHistory(state, failedNodeId), state.currentStreamId);
      return { pipelineStatus: "paused", approvalRequired: true,
        strategyHistory: [{ nodeId: failedNodeId, strategy: "human_intervention", timestamp: new Date().toISOString(), reason: alternateConfig ? "Alternate also failed" : "No alternate configured" }],
        lastUpdatedAt: new Date().toISOString() };
    }
    streamHandler.emitStrategySwitch(failedNodeId, "primary", "alternate", "Primary failed verification", state.currentStreamId);
    return {
      activeStrategy: { ...state.activeStrategy, [failedNodeId]: "alternate" },
      verifyAttempts: { ...state.verifyAttempts, [failedNodeId]: 0 },
      strategyHistory: [{ nodeId: failedNodeId, strategy: "alternate", timestamp: new Date().toISOString(), reason: "Primary failed " + (state.maxVerifyAttempts ?? 2) + " times" }],
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  function getLastFailedVerifyTarget(state: PipelineState): string | null {
    if (!state.verifyAttempts) return null;
    for (const [nodeId, attempts] of Object.entries(state.verifyAttempts)) {
      if (attempts >= (state.maxVerifyAttempts ?? 2)) return nodeId;
    }
    return null;
  }

  function getVerifyHistory(state: PipelineState, nodeId: string): Array<{ attempt: number; feedback: string }> {
    return [{ attempt: state.verifyAttempts?.[nodeId] ?? 0, feedback: state.verifyFeedback ?? "" }];
  }

  const graph = new StateGraph(PipelineAnnotation)
    .addNode("sm", (s: PipelineState) => n.smNode.run(s))
    .addNode("ba_brd", (s: PipelineState) => n.baBrdNode.run(s))
    .addNode("quality_gate_requirements", (s: PipelineState) => n.qgRequirements.run(s))
    .addNode("ba_fsd", (s: PipelineState) => n.baFsdNode.run(s))
    .addNode("ta_enrich", (s: PipelineState) => n.taEnrichNode.run(s))
    .addNode("security_review_fsd", (s: PipelineState) => n.securityFsdNode.run(s))
    .addNode("quality_gate_specification", (s: PipelineState) => n.qgSpecification.run(s))
    .addNode("sa_tdd", (s: PipelineState) => n.saTddNode.run(s))
    .addNode("feedback_check", (s: PipelineState) => n.feedbackNode.run(s))
    .addNode("ba_fix_fsd", (s: PipelineState) => n.baFixFsdNode.run(s))
    .addNode("sa_review", (s: PipelineState) => n.saReviewNode.run(s))
    .addNode("security_review_tdd", (s: PipelineState) => n.securityTddNode.run(s))
    .addNode("quality_gate_design", (s: PipelineState) => n.qgDesign.run(s))
    .addNode("qa_plan", (s: PipelineState) => n.qaPlanNode.run(s))
    .addNode("quality_gate_test_planning", (s: PipelineState) => n.qgTestPlanning.run(s))
    .addNode("dev_code", (s: PipelineState) => n.devCodeNode.run(s))
    .addNode("security_review_code", (s: PipelineState) => n.securityCodeNode.run(s))
    .addNode("quality_gate_implementation", (s: PipelineState) => n.qgImplementation.run(s))
    .addNode("dev_ug", (s: PipelineState) => n.devUgNode.run(s))
    .addNode("ba_review_ug", (s: PipelineState) => n.baReviewUgNode.run(s))
    .addNode("qa_verify_ug", (s: PipelineState) => n.qaVerifyUgNode.run(s))
    .addNode("ug_join", async (s: PipelineState) => ({ agentOutputs: [{ nodeId: "ug_join", content: "UG pipeline complete.", timestamp: new Date().toISOString(), metadata: { action: "ug_join", parallelResults: s.parallelResults } }], lastUpdatedAt: new Date().toISOString() }))
    .addNode("quality_gate_user_guide", (s: PipelineState) => n.qgUserGuide.run(s))
    .addNode("qa_test", (s: PipelineState) => n.qaTestNode.run(s))
    .addNode("quality_gate_testing", (s: PipelineState) => n.qgTesting.run(s))
    .addNode("devops_deploy", (s: PipelineState) => n.devopsDeployNode.run(s))
    .addNode("quality_gate_deployment", (s: PipelineState) => n.qgDeployment.run(s))
    .addNode("verify_ba_brd", (s: PipelineState) => n.verifyBaBrd.run(s))
    .addNode("verify_ba_fsd", (s: PipelineState) => n.verifyBaFsd.run(s))
    .addNode("verify_sa_tdd", (s: PipelineState) => n.verifySaTdd.run(s))
    .addNode("verify_qa_plan", (s: PipelineState) => n.verifyQaPlan.run(s))
    .addNode("verify_dev_code", (s: PipelineState) => n.verifyDevCode.run(s))
    .addNode("verify_dev_ug", (s: PipelineState) => n.verifyDevUg.run(s))
    .addNode("strategy_switch", (s: PipelineState) => strategySwitchNode(s))
    .addEdge("__start__", "sm")
    .addConditionalEdges("sm", routeFromSm, { ba_brd: "ba_brd", ba_fsd: "ba_fsd", sa_tdd: "sa_tdd", qa_plan: "qa_plan", dev_code: "dev_code", dev_ug: "dev_ug", qa_test: "qa_test", devops_deploy: "devops_deploy" })
    .addEdge("ba_brd", "verify_ba_brd")
    .addConditionalEdges("verify_ba_brd", routeAfterVerify("ba_brd", "quality_gate_requirements"), { quality_gate_requirements: "quality_gate_requirements", ba_brd: "ba_brd", strategy_switch: "strategy_switch", __end__: END })
    .addConditionalEdges("quality_gate_requirements", routeAfterQualityGate, { sm: "sm", ba_brd: "ba_brd", __end__: END })
    .addEdge("ba_fsd", "verify_ba_fsd")
    .addConditionalEdges("verify_ba_fsd", routeAfterVerify("ba_fsd", "ta_enrich"), { ta_enrich: "ta_enrich", ba_fsd: "ba_fsd", strategy_switch: "strategy_switch", __end__: END })
    .addEdge("ta_enrich", "security_review_fsd")
    .addConditionalEdges("security_review_fsd", routeAfterTaEnrich, { quality_gate_specification: "quality_gate_specification", __end__: END })
    .addConditionalEdges("quality_gate_specification", routeAfterQualityGate, { sm: "sm", ba_fsd: "ba_fsd", __end__: END })
    .addEdge("sa_tdd", "verify_sa_tdd")
    .addConditionalEdges("verify_sa_tdd", routeAfterVerify("sa_tdd", "feedback_check"), { feedback_check: "feedback_check", sa_tdd: "sa_tdd", strategy_switch: "strategy_switch", __end__: END })
    .addConditionalEdges("feedback_check", routeAfterFeedbackCheck, { security_review_tdd: "security_review_tdd", ba_fix_fsd: "ba_fix_fsd" })
    .addEdge("security_review_tdd", "quality_gate_design")
    .addConditionalEdges("ba_fix_fsd", routeAfterBaFixFsd, { sa_review: "sa_review", __end__: END })
    .addConditionalEdges("sa_review", routeAfterSaReview, { feedback_check: "feedback_check", __end__: END })
    .addConditionalEdges("quality_gate_design", routeAfterQualityGate, { sm: "sm", sa_tdd: "sa_tdd", __end__: END })
    .addEdge("qa_plan", "verify_qa_plan")
    .addConditionalEdges("verify_qa_plan", routeAfterVerify("qa_plan", "quality_gate_test_planning"), { quality_gate_test_planning: "quality_gate_test_planning", qa_plan: "qa_plan", strategy_switch: "strategy_switch", __end__: END })
    .addConditionalEdges("quality_gate_test_planning", routeAfterQualityGate, { sm: "sm", qa_plan: "qa_plan", __end__: END })
    .addEdge("dev_code", "verify_dev_code")
    .addConditionalEdges("verify_dev_code", routeAfterVerify("dev_code", "security_review_code"), { security_review_code: "security_review_code", dev_code: "dev_code", strategy_switch: "strategy_switch", __end__: END })
    .addConditionalEdges("security_review_code", routeAfterDevCode, { quality_gate_implementation: "quality_gate_implementation", __end__: END })
    .addConditionalEdges("quality_gate_implementation", routeAfterQualityGate, { sm: "sm", dev_code: "dev_code", __end__: END })
    .addEdge("dev_ug", "verify_dev_ug")
    .addConditionalEdges("verify_dev_ug", routeAfterVerify("dev_ug", "ba_review_ug"), { ba_review_ug: "ba_review_ug", dev_ug: "dev_ug", strategy_switch: "strategy_switch", __end__: END })
    .addConditionalEdges("ba_review_ug", routeAfterBaReviewUg, { qa_verify_ug: "qa_verify_ug", __end__: END })
    .addConditionalEdges("qa_verify_ug", routeAfterQaVerifyUg, { ug_join: "ug_join", __end__: END })
    .addConditionalEdges("ug_join", routeAfterUgJoin, { quality_gate_user_guide: "quality_gate_user_guide", __end__: END })
    .addConditionalEdges("quality_gate_user_guide", routeAfterQualityGate, { sm: "sm", dev_ug: "dev_ug", __end__: END })
    .addConditionalEdges("qa_test", routeAfterQaTest, { quality_gate_testing: "quality_gate_testing", __end__: END })
    .addConditionalEdges("quality_gate_testing", routeAfterQualityGate, { sm: "sm", qa_test: "qa_test", __end__: END })
    .addConditionalEdges("devops_deploy", routeAfterDevOpsDeploy, { quality_gate_deployment: "quality_gate_deployment", __end__: END })
    .addConditionalEdges("quality_gate_deployment", routeAfterQualityGate, { sm: "sm", devops_deploy: "devops_deploy", __end__: END })
    .addConditionalEdges("strategy_switch", routeAfterStrategySwitch, { ba_brd: "ba_brd", ba_fsd: "ba_fsd", sa_tdd: "sa_tdd", qa_plan: "qa_plan", dev_code: "dev_code", dev_ug: "dev_ug", __end__: END });

  return graph.compile({ checkpointer });
}
