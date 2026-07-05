/**
 * SDLC Node Factory — creates all agent/verify/quality-gate node instances.
 * Extracted from sdlc-graph.ts.
 */
import { McpBridge } from "../mcp-bridge";
import { StreamHandler } from "../stream-handler";
import type { LlmProvider } from "../llm-provider";
import { SmNode } from "../nodes/sm-node";
import { BaNode } from "../nodes/ba-node";
import { TaNode } from "../nodes/ta-node";
import { SaNode } from "../nodes/sa-node";
import { QaNode } from "../nodes/qa-node";
import { DevNode } from "../nodes/dev-node";
import { DevOpsNode } from "../nodes/devops-node";
import { SecurityNode } from "../nodes/security-node";
import { FeedbackNode } from "../nodes/feedback-node";
import { ApprovalNode } from "../nodes/approval-node";
import { VerifyNode } from "../nodes/verify-node";

export interface SdlcNodes {
  smNode: SmNode;
  baBrdNode: BaNode; baFsdNode: BaNode; baFixFsdNode: BaNode; baReviewUgNode: BaNode;
  taEnrichNode: TaNode;
  saTddNode: SaNode; saReviewNode: SaNode;
  qaPlanNode: QaNode; qaTestNode: QaNode; qaVerifyUgNode: QaNode;
  devCodeNode: DevNode; devUgNode: DevNode;
  devopsDeployNode: DevOpsNode;
  securityFsdNode: SecurityNode; securityTddNode: SecurityNode; securityCodeNode: SecurityNode;
  feedbackNode: FeedbackNode;
  qgRequirements: ApprovalNode; qgSpecification: ApprovalNode; qgDesign: ApprovalNode;
  qgTestPlanning: ApprovalNode; qgImplementation: ApprovalNode; qgUserGuide: ApprovalNode;
  qgTesting: ApprovalNode; qgDeployment: ApprovalNode;
  verifyBaBrd: VerifyNode; verifyBaFsd: VerifyNode; verifySaTdd: VerifyNode;
  verifyQaPlan: VerifyNode; verifyDevCode: VerifyNode; verifyDevUg: VerifyNode;
}

export function createSdlcNodes(mcpBridge: McpBridge, streamHandler: StreamHandler, llmProvider?: LlmProvider): SdlcNodes {
  return {
    smNode: new SmNode("sm", mcpBridge, streamHandler, llmProvider),
    baBrdNode: new BaNode("ba_brd", mcpBridge, streamHandler, llmProvider),
    baFsdNode: new BaNode("ba_fsd", mcpBridge, streamHandler, llmProvider),
    baFixFsdNode: new BaNode("ba_fix_fsd", mcpBridge, streamHandler, llmProvider),
    baReviewUgNode: new BaNode("ba_review_ug", mcpBridge, streamHandler, llmProvider),
    taEnrichNode: new TaNode("ta_enrich", mcpBridge, streamHandler, llmProvider),
    saTddNode: new SaNode("sa_tdd", mcpBridge, streamHandler, llmProvider),
    saReviewNode: new SaNode("sa_review", mcpBridge, streamHandler, llmProvider),
    qaPlanNode: new QaNode("qa_plan", mcpBridge, streamHandler, llmProvider),
    qaTestNode: new QaNode("qa_test", mcpBridge, streamHandler, llmProvider),
    qaVerifyUgNode: new QaNode("qa_verify_ug", mcpBridge, streamHandler, llmProvider),
    devCodeNode: new DevNode("dev_code", mcpBridge, streamHandler, llmProvider),
    devUgNode: new DevNode("dev_ug", mcpBridge, streamHandler, llmProvider),
    devopsDeployNode: new DevOpsNode("devops_deploy", mcpBridge, streamHandler, llmProvider),
    securityFsdNode: new SecurityNode("security_review_fsd", mcpBridge, streamHandler, llmProvider),
    securityTddNode: new SecurityNode("security_review_tdd", mcpBridge, streamHandler, llmProvider),
    securityCodeNode: new SecurityNode("security_review_code", mcpBridge, streamHandler, llmProvider),
    feedbackNode: new FeedbackNode("feedback_check", mcpBridge, streamHandler, llmProvider),
    qgRequirements: new ApprovalNode("quality_gate_requirements", "requirements", mcpBridge, streamHandler, llmProvider),
    qgSpecification: new ApprovalNode("quality_gate_specification", "specification", mcpBridge, streamHandler, llmProvider),
    qgDesign: new ApprovalNode("quality_gate_design", "design", mcpBridge, streamHandler, llmProvider),
    qgTestPlanning: new ApprovalNode("quality_gate_test_planning", "test_planning", mcpBridge, streamHandler, llmProvider),
    qgImplementation: new ApprovalNode("quality_gate_implementation", "implementation", mcpBridge, streamHandler, llmProvider),
    qgUserGuide: new ApprovalNode("quality_gate_user_guide", "user_guide", mcpBridge, streamHandler, llmProvider),
    qgTesting: new ApprovalNode("quality_gate_testing", "testing", mcpBridge, streamHandler, llmProvider),
    qgDeployment: new ApprovalNode("quality_gate_deployment", "deployment", mcpBridge, streamHandler, llmProvider),
    verifyBaBrd: new VerifyNode("verify_ba_brd", "ba_brd", mcpBridge, streamHandler, llmProvider),
    verifyBaFsd: new VerifyNode("verify_ba_fsd", "ba_fsd", mcpBridge, streamHandler, llmProvider),
    verifySaTdd: new VerifyNode("verify_sa_tdd", "sa_tdd", mcpBridge, streamHandler, llmProvider),
    verifyQaPlan: new VerifyNode("verify_qa_plan", "qa_plan", mcpBridge, streamHandler, llmProvider),
    verifyDevCode: new VerifyNode("verify_dev_code", "dev_code", mcpBridge, streamHandler, llmProvider),
    verifyDevUg: new VerifyNode("verify_dev_ug", "dev_ug", mcpBridge, streamHandler, llmProvider),
  };
}
