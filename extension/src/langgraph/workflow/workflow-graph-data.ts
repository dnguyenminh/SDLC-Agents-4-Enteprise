import { agentRegistry } from "../agents/registry";

interface WorkflowNode {
  id: string;
  label: string;
  type: "agent" | "quality_gate" | "verify" | "security" | "control";
  phase?: string;
  description?: string;
}

interface WorkflowEdge {
  source: string;
  target: string;
  type: "direct" | "conditional";
  label?: string;
  routingFn?: string;
}

interface WorkflowGraphData {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata: { totalNodes: number; totalEdges: number; generatedAt: string };
}

const INFRA_NODE_META: Record<string, { label: string; type: WorkflowNode["type"]; phase: string }> = {
  sm: { label: "SM: Orchestrator", type: "agent", phase: "all" },
  verify_ba_requirements: { label: "Verify: Requirements", type: "verify", phase: "requirements" },
  verify_ba_specification: { label: "Verify: Specification", type: "verify", phase: "specification" },
  verify_sa_design: { label: "Verify: Design", type: "verify", phase: "design" },
  verify_qa_test_planning: { label: "Verify: Test Planning", type: "verify", phase: "test_planning" },
  verify_dev_implementation: { label: "Verify: Implementation", type: "verify", phase: "implementation" },
  verify_dev_user_guide: { label: "Verify: User Guide", type: "verify", phase: "user_guide" },
  quality_gate_requirements: { label: "QG: Requirements", type: "quality_gate", phase: "requirements" },
  quality_gate_specification: { label: "QG: Specification", type: "quality_gate", phase: "specification" },
  quality_gate_design: { label: "QG: Design", type: "quality_gate", phase: "design" },
  quality_gate_test_planning: { label: "QG: Test Planning", type: "quality_gate", phase: "test_planning" },
  quality_gate_implementation: { label: "QG: Implementation", type: "quality_gate", phase: "implementation" },
  quality_gate_user_guide: { label: "QG: User Guide", type: "quality_gate", phase: "user_guide" },
  quality_gate_testing: { label: "QG: Testing", type: "quality_gate", phase: "testing" },
  quality_gate_deployment: { label: "QG: Deployment", type: "quality_gate", phase: "deployment" },
  security_review_fsd: { label: "Security: FSD Review", type: "security", phase: "specification" },
  security_review_tdd: { label: "Security: TDD Review", type: "security", phase: "design" },
  security_review_code: { label: "Security: Code Review", type: "security", phase: "implementation" },
  feedback_check: { label: "Feedback Check", type: "control", phase: "design" },
  ug_join: { label: "UG Join", type: "control", phase: "user_guide" },
  strategy_switch: { label: "Strategy Switch", type: "control", phase: "all" },
  analyze_input: { label: "Intent Analyzer", type: "control", phase: "all" },
  __start__: { label: "START", type: "control", phase: "all" },
};

const EDGE_DEFS: Array<{ source: string; target: string; type: "direct" | "conditional"; label?: string }> = [
  { source: "__start__", target: "sm", type: "direct" },
  { source: "sm", target: "ba-agent", type: "conditional", label: "requirements" },
  { source: "sm", target: "ta-agent", type: "conditional", label: "specification" },
  { source: "sm", target: "sa-agent", type: "conditional", label: "design" },
  { source: "sm", target: "qa-agent", type: "conditional", label: "test_planning" },
  { source: "sm", target: "dev-agent", type: "conditional", label: "implementation" },
  { source: "sm", target: "qa-agent", type: "conditional", label: "testing" },
  { source: "sm", target: "devops-agent", type: "conditional", label: "deployment" },
  { source: "ba-agent", target: "verify_ba_requirements", type: "direct" },
  { source: "verify_ba_requirements", target: "quality_gate_requirements", type: "conditional", label: "pass" },
  { source: "verify_ba_requirements", target: "ba-agent", type: "conditional", label: "retry" },
  { source: "verify_ba_requirements", target: "strategy_switch", type: "conditional", label: "max_retries" },
  { source: "quality_gate_requirements", target: "sm", type: "conditional", label: "approved" },
  { source: "quality_gate_requirements", target: "ba-agent", type: "conditional", label: "rejected" },
  { source: "ba-agent", target: "verify_ba_specification", type: "direct" },
  { source: "verify_ba_specification", target: "ta-agent", type: "conditional", label: "pass" },
  { source: "verify_ba_specification", target: "ba-agent", type: "conditional", label: "retry" },
  { source: "verify_ba_specification", target: "strategy_switch", type: "conditional", label: "max_retries" },
  { source: "ta-agent", target: "security_review_fsd", type: "direct" },
  { source: "security_review_fsd", target: "quality_gate_specification", type: "conditional", label: "pass" },
  { source: "quality_gate_specification", target: "sm", type: "conditional", label: "approved" },
  { source: "quality_gate_specification", target: "ba-agent", type: "conditional", label: "rejected" },
  { source: "sa-agent", target: "verify_sa_design", type: "direct" },
  { source: "verify_sa_design", target: "feedback_check", type: "conditional", label: "pass" },
  { source: "verify_sa_design", target: "sa-agent", type: "conditional", label: "retry" },
  { source: "verify_sa_design", target: "strategy_switch", type: "conditional", label: "max_retries" },
  { source: "feedback_check", target: "security_review_tdd", type: "conditional", label: "no_discrepancy" },
  { source: "feedback_check", target: "ba-agent", type: "conditional", label: "has_discrepancy" },
  { source: "ba-agent", target: "sa-agent", type: "direct" },
  { source: "sa-agent", target: "feedback_check", type: "conditional", label: "re-check" },
  { source: "security_review_tdd", target: "quality_gate_design", type: "direct" },
  { source: "quality_gate_design", target: "sm", type: "conditional", label: "approved" },
  { source: "quality_gate_design", target: "sa-agent", type: "conditional", label: "rejected" },
  { source: "qa-agent", target: "verify_qa_test_planning", type: "direct" },
  { source: "verify_qa_test_planning", target: "quality_gate_test_planning", type: "conditional", label: "pass" },
  { source: "quality_gate_test_planning", target: "sm", type: "conditional", label: "approved" },
  { source: "dev-agent", target: "verify_dev_implementation", type: "direct" },
  { source: "verify_dev_implementation", target: "security_review_code", type: "conditional", label: "pass" },
  { source: "verify_dev_implementation", target: "dev-agent", type: "conditional", label: "retry" },
  { source: "security_review_code", target: "quality_gate_implementation", type: "conditional", label: "pass" },
  { source: "quality_gate_implementation", target: "sm", type: "conditional", label: "approved" },
  { source: "dev-agent", target: "verify_dev_user_guide", type: "direct" },
  { source: "verify_dev_user_guide", target: "ba-agent", type: "conditional", label: "pass" },
  { source: "verify_dev_user_guide", target: "dev-agent", type: "conditional", label: "retry" },
  { source: "ba-agent", target: "qa-agent", type: "conditional", label: "pass" },
  { source: "qa-agent", target: "ug_join", type: "conditional", label: "pass" },
  { source: "ug_join", target: "quality_gate_user_guide", type: "conditional", label: "complete" },
  { source: "quality_gate_user_guide", target: "sm", type: "conditional", label: "approved" },
  { source: "qa-agent", target: "quality_gate_testing", type: "conditional", label: "pass" },
  { source: "quality_gate_testing", target: "sm", type: "conditional", label: "approved" },
  { source: "devops-agent", target: "quality_gate_deployment", type: "conditional", label: "pass" },
  { source: "quality_gate_deployment", target: "sm", type: "conditional", label: "approved" },
  { source: "strategy_switch", target: "ba-agent", type: "conditional", label: "retry_alternate" },
  { source: "strategy_switch", target: "ta-agent", type: "conditional", label: "retry_alternate" },
  { source: "strategy_switch", target: "sa-agent", type: "conditional", label: "retry_alternate" },
  { source: "strategy_switch", target: "dev-agent", type: "conditional", label: "retry_alternate" },
  { source: "strategy_switch", target: "qa-agent", type: "conditional", label: "retry_alternate" },
];

let cachedData: WorkflowGraphData | null = null;

function buildWorkflowGraphData(): WorkflowGraphData {
  if (cachedData && agentRegistry.isInitialized()) return cachedData;

  const nodes: WorkflowNode[] = [];

  for (const [id, meta] of Object.entries(INFRA_NODE_META)) {
    nodes.push({ id, label: meta.label, type: meta.type, phase: meta.phase });
  }

  if (agentRegistry.isInitialized()) {
    for (const id of agentRegistry.getAllAgentIds()) {
      const config = agentRegistry.getAgentConfig(id);
      if (config && config.type === "agent") {
        nodes.push({ id, label: config.label, type: "agent", phase: config.phase });
      }
    }
  }

  const edges: WorkflowEdge[] = EDGE_DEFS.map(e => ({
    source: e.source,
    target: e.target,
    type: e.type as "direct" | "conditional",
    label: e.label,
  }));

  const data: WorkflowGraphData = {
    nodes,
    edges,
    metadata: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      generatedAt: new Date().toISOString(),
    },
  };

  cachedData = data;
  return data;
}

export const SDLC_GRAPH_DEFINITION: WorkflowGraphData = new Proxy({} as WorkflowGraphData, {
  get(_, prop) {
    return buildWorkflowGraphData()[prop as keyof WorkflowGraphData];
  },
});
