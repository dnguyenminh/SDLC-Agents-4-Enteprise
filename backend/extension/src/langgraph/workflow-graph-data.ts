/**
 * Static SDLC Graph Definition for Workflow Visualization Panel (KSA-238).
 * Mirrors the structure defined in sdlc-graph.ts for rendering purposes.
 */

export interface WorkflowNode {
  id: string;
  label: string;
  type: "agent" | "quality_gate" | "verify" | "security" | "control";
  agentClass?: string;
  description?: string;
}

export interface WorkflowEdge {
  source: string;
  target: string;
  type: "direct" | "conditional";
  label?: string;
  routingFn?: string;
}

export interface WorkflowGraphData {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata: { totalNodes: number; totalEdges: number; generatedAt: string };
}

export const SDLC_GRAPH_DEFINITION: WorkflowGraphData = {
  nodes: [
    { id: "sm", label: "SM: Orchestrator", type: "agent", agentClass: "SmNode", description: "Routes to appropriate phase" },
    { id: "ba_brd", label: "BA: BRD", type: "agent", agentClass: "BaNode", description: "Creates BRD" },
    { id: "ba_fsd", label: "BA: FSD", type: "agent", agentClass: "BaNode", description: "Creates FSD" },
    { id: "ta_enrich", label: "TA: Enrich FSD", type: "agent", agentClass: "TaNode", description: "Enriches FSD technically" },
    { id: "sa_tdd", label: "SA: TDD", type: "agent", agentClass: "SaNode", description: "Creates TDD" },
    { id: "qa_plan", label: "QA: Test Plan", type: "agent", agentClass: "QaNode", description: "Creates STP + STC" },
    { id: "dev_code", label: "DEV: Code", type: "agent", agentClass: "DevNode", description: "Implements code" },
    { id: "dev_ug", label: "DEV: User Guide", type: "agent", agentClass: "DevNode", description: "Writes User Guide" },
    { id: "ba_review_ug", label: "BA: Review UG", type: "agent", agentClass: "BaNode", description: "Reviews UG" },
    { id: "qa_verify_ug", label: "QA: Verify UG", type: "agent", agentClass: "QaNode", description: "Verifies UG" },
    { id: "qa_test", label: "QA: Test", type: "agent", agentClass: "QaNode", description: "Executes tests" },
    { id: "devops_deploy", label: "DevOps: Deploy", type: "agent", agentClass: "DevOpsNode", description: "Deploys and releases" },
    { id: "ba_fix_fsd", label: "BA: Fix FSD", type: "agent", agentClass: "BaNode", description: "Fixes FSD discrepancies" },
    { id: "sa_review", label: "SA: Review", type: "agent", agentClass: "SaNode", description: "Re-reviews after fix" },
    { id: "security_review_fsd", label: "Security: FSD", type: "security", agentClass: "SecurityNode" },
    { id: "security_review_tdd", label: "Security: TDD", type: "security", agentClass: "SecurityNode" },
    { id: "security_review_code", label: "Security: Code", type: "security", agentClass: "SecurityNode" },
    { id: "quality_gate_requirements", label: "QG: Requirements", type: "quality_gate" },
    { id: "quality_gate_specification", label: "QG: Specification", type: "quality_gate" },
    { id: "quality_gate_design", label: "QG: Design", type: "quality_gate" },
    { id: "quality_gate_test_planning", label: "QG: Test Planning", type: "quality_gate" },
    { id: "quality_gate_implementation", label: "QG: Implementation", type: "quality_gate" },
    { id: "quality_gate_user_guide", label: "QG: User Guide", type: "quality_gate" },
    { id: "quality_gate_testing", label: "QG: Testing", type: "quality_gate" },
    { id: "quality_gate_deployment", label: "QG: Deployment", type: "quality_gate" },
    { id: "verify_ba_brd", label: "Verify: BRD", type: "verify" },
    { id: "verify_ba_fsd", label: "Verify: FSD", type: "verify" },
    { id: "verify_sa_tdd", label: "Verify: TDD", type: "verify" },
    { id: "verify_qa_plan", label: "Verify: QA Plan", type: "verify" },
    { id: "verify_dev_code", label: "Verify: Code", type: "verify" },
    { id: "verify_dev_ug", label: "Verify: UG", type: "verify" },
    { id: "feedback_check", label: "Feedback Check", type: "control" },
    { id: "ug_join", label: "UG Join", type: "control" },
    { id: "strategy_switch", label: "Strategy Switch", type: "control" },
    { id: "__start__", label: "START", type: "control" },
  ],
  edges: [
    { source: "__start__", target: "sm", type: "direct" },
    { source: "sm", target: "ba_brd", type: "conditional", label: "ba_brd", routingFn: "routeFromSm" },
    { source: "sm", target: "ba_fsd", type: "conditional", label: "ba_fsd", routingFn: "routeFromSm" },
    { source: "sm", target: "sa_tdd", type: "conditional", label: "sa_tdd", routingFn: "routeFromSm" },
    { source: "sm", target: "qa_plan", type: "conditional", label: "qa_plan", routingFn: "routeFromSm" },
    { source: "sm", target: "dev_code", type: "conditional", label: "dev_code", routingFn: "routeFromSm" },
    { source: "sm", target: "dev_ug", type: "conditional", label: "dev_ug", routingFn: "routeFromSm" },
    { source: "sm", target: "qa_test", type: "conditional", label: "qa_test", routingFn: "routeFromSm" },
    { source: "sm", target: "devops_deploy", type: "conditional", label: "devops_deploy", routingFn: "routeFromSm" },
    { source: "ba_brd", target: "verify_ba_brd", type: "direct" },
    { source: "verify_ba_brd", target: "quality_gate_requirements", type: "conditional", label: "pass" },
    { source: "verify_ba_brd", target: "ba_brd", type: "conditional", label: "retry" },
    { source: "verify_ba_brd", target: "strategy_switch", type: "conditional", label: "max_retries" },
    { source: "quality_gate_requirements", target: "sm", type: "conditional", label: "approved" },
    { source: "quality_gate_requirements", target: "ba_brd", type: "conditional", label: "rejected" },
    { source: "ba_fsd", target: "verify_ba_fsd", type: "direct" },
    { source: "verify_ba_fsd", target: "ta_enrich", type: "conditional", label: "pass" },
    { source: "verify_ba_fsd", target: "ba_fsd", type: "conditional", label: "retry" },
    { source: "verify_ba_fsd", target: "strategy_switch", type: "conditional", label: "max_retries" },
    { source: "ta_enrich", target: "security_review_fsd", type: "direct" },
    { source: "security_review_fsd", target: "quality_gate_specification", type: "conditional", label: "pass" },
    { source: "quality_gate_specification", target: "sm", type: "conditional", label: "approved" },
    { source: "quality_gate_specification", target: "ba_fsd", type: "conditional", label: "rejected" },
    { source: "sa_tdd", target: "verify_sa_tdd", type: "direct" },
    { source: "verify_sa_tdd", target: "feedback_check", type: "conditional", label: "pass" },
    { source: "verify_sa_tdd", target: "sa_tdd", type: "conditional", label: "retry" },
    { source: "verify_sa_tdd", target: "strategy_switch", type: "conditional", label: "max_retries" },
    { source: "feedback_check", target: "security_review_tdd", type: "conditional", label: "no_discrepancy" },
    { source: "feedback_check", target: "ba_fix_fsd", type: "conditional", label: "has_discrepancy" },
    { source: "ba_fix_fsd", target: "sa_review", type: "direct" },
    { source: "sa_review", target: "feedback_check", type: "conditional", label: "re-check" },
    { source: "security_review_tdd", target: "quality_gate_design", type: "direct" },
    { source: "quality_gate_design", target: "sm", type: "conditional", label: "approved" },
    { source: "quality_gate_design", target: "sa_tdd", type: "conditional", label: "rejected" },
    { source: "qa_plan", target: "verify_qa_plan", type: "direct" },
    { source: "verify_qa_plan", target: "quality_gate_test_planning", type: "conditional", label: "pass" },
    { source: "verify_qa_plan", target: "qa_plan", type: "conditional", label: "retry" },
    { source: "quality_gate_test_planning", target: "sm", type: "conditional", label: "approved" },
    { source: "dev_code", target: "verify_dev_code", type: "direct" },
    { source: "verify_dev_code", target: "security_review_code", type: "conditional", label: "pass" },
    { source: "verify_dev_code", target: "dev_code", type: "conditional", label: "retry" },
    { source: "security_review_code", target: "quality_gate_implementation", type: "conditional", label: "pass" },
    { source: "quality_gate_implementation", target: "sm", type: "conditional", label: "approved" },
    { source: "dev_ug", target: "verify_dev_ug", type: "direct" },
    { source: "verify_dev_ug", target: "ba_review_ug", type: "conditional", label: "pass" },
    { source: "verify_dev_ug", target: "dev_ug", type: "conditional", label: "retry" },
    { source: "ba_review_ug", target: "qa_verify_ug", type: "conditional", label: "pass" },
    { source: "qa_verify_ug", target: "ug_join", type: "conditional", label: "pass" },
    { source: "ug_join", target: "quality_gate_user_guide", type: "conditional", label: "complete" },
    { source: "quality_gate_user_guide", target: "sm", type: "conditional", label: "approved" },
    { source: "qa_test", target: "quality_gate_testing", type: "conditional", label: "pass" },
    { source: "quality_gate_testing", target: "sm", type: "conditional", label: "approved" },
    { source: "devops_deploy", target: "quality_gate_deployment", type: "conditional", label: "pass" },
    { source: "quality_gate_deployment", target: "sm", type: "conditional", label: "approved" },
    { source: "strategy_switch", target: "ba_brd", type: "conditional", label: "retry_alternate" },
    { source: "strategy_switch", target: "ba_fsd", type: "conditional", label: "retry_alternate" },
    { source: "strategy_switch", target: "sa_tdd", type: "conditional", label: "retry_alternate" },
    { source: "strategy_switch", target: "dev_code", type: "conditional", label: "retry_alternate" },
    { source: "strategy_switch", target: "dev_ug", type: "conditional", label: "retry_alternate" },
  ],
  metadata: {
    totalNodes: 35,
    totalEdges: 59,
    generatedAt: new Date().toISOString(),
  },
};
