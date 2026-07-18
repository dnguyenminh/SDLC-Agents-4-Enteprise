import { StateGraph, END } from "@langchain/langgraph";
import { PipelineAnnotation, PipelineState, SDLCPhase, PipelineStatus, ChatMessage } from "../core/state";
import { McpBridge } from "../core/mcp-bridge";
import { StreamHandler } from "../core/stream-handler";
import { WorkspaceCheckpointer } from "../core/checkpointer";
import type { LlmProvider } from "../core/llm-provider";
import { getAlternateStrategy } from "../config/alternate-strategies";
import { createSdlcNodes, SdlcNodes } from "./sdlc-node-factory";
import { agentRegistry } from "../agents/registry";
import { DynamicAgentNode } from "../agents/dynamic-agent-node";
import type { PhaseDefinition, AgentRelation } from "../agents/pipeline-extractor";
import {
  routeFromSm, routeAfterQualityGate, routeAfterAnalyzeInput,
  routeAfterFeedbackCheck, routeAfterBaFixFsd, routeAfterSaReview,
  routeAfterVerify, routeAfterStrategySwitch,
  routeToQaAgent, routeToUgJoin, routeToUgGate,
  routeAfterAdvance, resolvePhaseIndex,
  QUALITY_GATE_TARGETS,
} from "./edges";

let _mcpBridge: McpBridge;
let _streamHandler: StreamHandler;
let _llmProvider: LlmProvider | undefined;

function nodeRunner(n: SdlcNodes, id: string, advanceFn?: (s: PipelineState) => Promise<Partial<PipelineState>>) {
  return (s: PipelineState) => {
    if (id === "advance_phase" && advanceFn) return advanceFn(s);
    if (n.agentNodes[id]) return n.agentNodes[id].run(s);
    if (n.verifyNodes[id]) return n.verifyNodes[id].run(s);
    if (n.gateNodes[id]) return n.gateNodes[id].run(s);
    if (n.dynamicNodes[id]) return n.dynamicNodes[id].run(s);

    const config = agentRegistry.resolveStepId(id);
    if (config) {
      const node = new DynamicAgentNode(id, _mcpBridge, _streamHandler, config, _llmProvider);
      n.agentNodes[id] = node;
      n.dynamicNodes[id] = node;
      return node.run(s);
    }
    throw new Error(`Node '${id}' not found. Add .kiro/agents/${id}.md or register infrastructure.`);
  };
}

export async function buildSdlcSubgraph(
  mcpBridge: McpBridge, streamHandler: StreamHandler,
  checkpointer: WorkspaceCheckpointer, llmProvider?: LlmProvider
) {
  _mcpBridge = mcpBridge;
  _streamHandler = streamHandler;
  _llmProvider = llmProvider;

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

  async function advancePhaseNode(state: PipelineState): Promise<Partial<PipelineState>> {
    const pd = state.pipelineDefinition;
    if (pd && pd.phases.length > 0) {
      const idx = resolvePhaseIndex(state);
      if (idx >= 0) {
        const nextIdx = idx + 1;
        if (nextIdx < pd.phases.length) {
          return {
            currentPhaseIndex: nextIdx,
            currentPhase: pd.phases[nextIdx].id as SDLCPhase,
            lastUpdatedAt: new Date().toISOString(),
          };
        }
        return {
          pipelineStatus: "completed" as PipelineStatus,
          lastUpdatedAt: new Date().toISOString(),
        };
      }
      // Orphaned phase — check user decision
      if (state.approvalDecision === "skip" || state.approvalDecision === "approve") {
        let targetIdx = state.currentPhaseIndex;
        if (targetIdx >= pd.phases.length) targetIdx = pd.phases.length - 1;
        if (targetIdx >= 0) {
          const nextPhaseId = pd.phases[targetIdx].id;
          const barrierMsg: ChatMessage = {
            id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: "system",
            content: `[Context Barrier] Phase '${state.currentPhase}' was deleted and SKIPPED. Requests related to it are void. Current phase: '${nextPhaseId}'.`,
            timestamp: new Date().toISOString(),
          };
          return {
            currentPhaseIndex: targetIdx,
            currentPhase: nextPhaseId as SDLCPhase,
            pipelineStatus: "running" as PipelineStatus,
            approvalDecision: null,
            approvalRequired: false,
            chatHistory: [...(state.chatHistory || []), barrierMsg],
            lastUpdatedAt: new Date().toISOString(),
          };
        }
        return {
          pipelineStatus: "completed" as PipelineStatus,
          lastUpdatedAt: new Date().toISOString(),
        };
      }
      if (state.approvalDecision === "cancel" || state.approvalDecision === "reject") {
        return {
          pipelineStatus: "cancelled" as PipelineStatus,
          lastUpdatedAt: new Date().toISOString(),
        };
      }
      // First orphan detection — pause for human decision
      return {
        pipelineStatus: "paused" as PipelineStatus,
        approvalRequired: true,
        lastUpdatedAt: new Date().toISOString(),
      };
    }
    return {
      pipelineStatus: "completed" as PipelineStatus,
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

  const registeredNodes = new Set<string>();
  function addNode(graph: any, id: string) {
    if (!registeredNodes.has(id)) {
      graph.addNode(id, nodeRunner(n, id, advancePhaseNode));
      registeredNodes.add(id);
    }
  }

  const graph = new StateGraph(PipelineAnnotation) as any;

  addNode(graph, "sm");
  addNode(graph, "advance_phase");
  addNode(graph, "feedback_check");
  addNode(graph, "analyze_input");
  addNode(graph, "strategy_switch");
  addNode(graph, "ug_join");

  for (const id of agentRegistry.getAllAgentIds()) {
    addNode(graph, id);
  }

  graph
    .addEdge("__start__", "sm")
    .addConditionalEdges("sm", routeFromSm, buildSmTargets());

  const phases = agentRegistry.getPhases();
  const relations = agentRegistry.getRelations();

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const nextPhase = i < phases.length - 1 ? phases[i + 1] : null;
    wirePhase(graph, phase, relations, nextPhase, phases);
  }

  graph.addConditionalEdges("advance_phase", routeAfterAdvance, { sm: "sm", __end__: END });
  graph.addConditionalEdges("strategy_switch", routeAfterStrategySwitch, QUALITY_GATE_TARGETS);
  graph.addConditionalEdges("analyze_input", routeAfterAnalyzeInput, QUALITY_GATE_TARGETS);

  return graph.compile({ checkpointer });
}

function wirePhase(
  graph: any,
  phase: PhaseDefinition,
  relations: AgentRelation[],
  nextPhase: PhaseDefinition | null,
  allPhases: PhaseDefinition[],
): void {
  const agentId = phase.agentIds[0];
  if (!agentId) return;

  addNodeIfNeeded(graph, agentId);

  const verifyId = agentRegistry.getPhaseVerifyId(phase.id);
  const gateId = agentRegistry.getPhaseGateId(phase.id);

  const reviewsThis = relations.filter(r => r.phaseId === phase.id && r.type === "reviews");
  const feedsInto = relations.filter(r => r.phaseId === phase.id && r.type === "feeds_into");
  const verifiesThis = relations.filter(r => r.phaseId === phase.id && r.type === "verifies");

  const previousPhases = allPhases.filter(p => p.order < phase.order);

  const hasSecurity = agentId === "sa-agent" || agentId === "dev-agent"
    || relations.some(r =>
      (r.sourceId === agentId || r.targetId === agentId) &&
      r.description?.toLowerCase().includes("security")
    );

  if (phase.id === "design") {
    wireDesignPhase(graph, agentId, verifyId, gateId, phase);
    return;
  }

  if (phase.id === "user_guide") {
    wireUserGuidePhase(graph, agentId, verifyId, gateId, phase, relations);
    return;
  }

  const verifyNext = reviewsThis.length > 0 ? reviewsThis[0].sourceId : gateId;

  graph.addEdge(agentId, verifyId ?? gateId!);

  if (verifyId && gateId) {
    const afterVerifyTargets: Record<string, string> = {
      [gateId]: gateId,
      [agentId]: agentId,
      strategy_switch: "strategy_switch",
      __end__: END,
    };

    for (const rev of reviewsThis) {
      if (!afterVerifyTargets[rev.sourceId]) {
        afterVerifyTargets[rev.sourceId] = rev.sourceId;
      }
    }

    let gateNext = gateId;
    if (reviewsThis.length > 0 && !hasSecurity) {
      gateNext = reviewsThis[0].sourceId;
    }

    let securityNode: string | null = null;
    if (hasSecurity) {
      securityNode = `security_review_${phase.id}`;
      addNodeIfNeeded(graph, securityNode);
    }

    if (hasSecurity) {
      if (reviewsThis.length > 0) {
        for (const rev of reviewsThis) {
          addNodeIfNeeded(graph, rev.sourceId);
        }
      }
      graph.addConditionalEdges(verifyId, routeAfterVerify(agentId, securityNode!), afterVerifyTargets);
      graph.addEdge(securityNode!, gateId);
    } else if (reviewsThis.length > 0) {
      for (const rev of reviewsThis) {
        addNodeIfNeeded(graph, rev.sourceId);
      }
      graph.addConditionalEdges(verifyId, routeAfterVerify(agentId, reviewsThis[0].sourceId), afterVerifyTargets);
      graph.addEdge(reviewsThis[0].sourceId, gateId);
    } else {
      graph.addConditionalEdges(verifyId, routeAfterVerify(agentId, gateId), afterVerifyTargets);
    }

    if (gateId) {
      graph.addConditionalEdges(gateId, routeAfterQualityGate, {
        ...QUALITY_GATE_TARGETS, analyze_input: "analyze_input"
      });
    }
  } else if (gateId) {
    graph.addConditionalEdges(gateId, routeAfterQualityGate, {
      ...QUALITY_GATE_TARGETS, analyze_input: "analyze_input"
    });
  }

  if (nextPhase) {
    const nextAgentId = nextPhase.agentIds[0];
    if (nextAgentId && QUALITY_GATE_TARGETS[nextAgentId]) {
      QUALITY_GATE_TARGETS[nextAgentId] = nextAgentId;
    }
  }
}

function wireDesignPhase(
  graph: any,
  agentId: string,
  verifyId: string | undefined,
  gateId: string | undefined,
  phase: PhaseDefinition,
): void {
  addNodeIfNeeded(graph, "ba-agent");
  addNodeIfNeeded(graph, "sa-agent");

  graph.addEdge(agentId, verifyId ?? gateId!);

  if (verifyId && gateId) {
    graph.addConditionalEdges(verifyId, routeAfterVerify(agentId, "feedback_check"), {
      feedback_check: "feedback_check", [agentId]: agentId,
      strategy_switch: "strategy_switch", __end__: END
    });

    graph.addConditionalEdges("feedback_check", routeAfterFeedbackCheck, {
      security_review_tdd: "security_review_tdd", "ba-agent": "ba-agent"
    });
    addNodeIfNeeded(graph, "security_review_tdd");

    graph.addConditionalEdges("ba-agent", routeAfterBaFixFsd, {
      "sa-agent": "sa-agent", __end__: END
    });

    graph.addConditionalEdges("sa-agent", routeAfterSaReview, {
      feedback_check: "feedback_check", __end__: END
    });

    graph.addEdge("security_review_tdd", gateId);

    graph.addConditionalEdges(gateId, routeAfterQualityGate, {
      ...QUALITY_GATE_TARGETS, analyze_input: "analyze_input"
    });
  }
}

function wireUserGuidePhase(
  graph: any,
  agentId: string,
  verifyId: string | undefined,
  gateId: string | undefined,
  phase: PhaseDefinition,
  relations: AgentRelation[],
): void {
  addNodeIfNeeded(graph, "ba-agent");
  addNodeIfNeeded(graph, "qa-agent");

  graph.addEdge(agentId, verifyId ?? gateId!);

  if (verifyId && gateId) {
    graph.addConditionalEdges(verifyId, routeAfterVerify(agentId, "ba-agent"), {
      "ba-agent": "ba-agent", [agentId]: agentId,
      strategy_switch: "strategy_switch", __end__: END
    });

    graph.addConditionalEdges("ba-agent", routeToQaAgent, {
      "qa-agent": "qa-agent", __end__: END
    });

    graph.addConditionalEdges("qa-agent", routeToUgJoin, {
      ug_join: "ug_join", __end__: END
    });

    graph.addConditionalEdges("ug_join", routeToUgGate, {
      [gateId]: gateId, __end__: END
    });

    graph.addConditionalEdges(gateId, routeAfterQualityGate, {
      ...QUALITY_GATE_TARGETS, analyze_input: "analyze_input"
    });
  }
}

function buildSmTargets(): Record<string, string> {
  const targets: Record<string, string> = { advance_phase: "advance_phase" };
  const pipeline = agentRegistry.getPipeline();
  if (pipeline && pipeline.phases.length > 0) {
    for (const phase of pipeline.phases) {
      if (phase.agentIds.length > 0) targets[phase.agentIds[0]] = phase.agentIds[0];
    }
  }
  for (const phase of agentRegistry.getPhases()) {
    const firstNode = agentRegistry.getFirstAgentNode(phase.id);
    if (firstNode) targets[firstNode] = firstNode;
  }
  return targets;
}

function addNodeIfNeeded(graph: any, id: string) {
}
