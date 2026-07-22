/**
 * Security Audit Subgraph — Full Security Scan Pipeline
 * OWASP-style audit across dependencies, code patterns, and configuration.
 *
 * Flow: __start__ → [scan_dependencies, scan_code_patterns, scan_config] (parallel)
 *   → join → generate_report → __end__
 */

import { StateGraph, END } from "@langchain/langgraph";
import { PipelineAnnotation, PipelineState } from "../core/state";
import { McpBridge } from "../core/mcp-bridge";
import { StreamHandler } from "../core/stream-handler";
import type { LlmProvider } from "../core/llm-provider";
import { SecurityNode } from "../agents/security-node";

/**
 * Build the security audit subgraph.
 * Each scan node is specialized to a different security dimension.
 * Scans run in parallel via fan-out from start, then join before report generation.
 */
export async function buildSecurityAuditSubgraph(
  mcpBridge: McpBridge,
  streamHandler: StreamHandler,
  llmProvider?: LlmProvider
) {
  const depScanNode = new SecurityNode("scan_dependencies", mcpBridge, streamHandler, llmProvider, "dependency");
  const codeScanNode = new SecurityNode("scan_code_patterns", mcpBridge, streamHandler, llmProvider, "code_pattern");
  const configScanNode = new SecurityNode("scan_config", mcpBridge, streamHandler, llmProvider, "config");

  const graph = new StateGraph(PipelineAnnotation)
    // Parallel fan-out: all 3 scans start simultaneously
    .addNode("scan_dependencies", (state: PipelineState) => depScanNode.run(state))
    .addNode("scan_code_patterns", (state: PipelineState) => codeScanNode.run(state))
    .addNode("scan_config", (state: PipelineState) => configScanNode.run(state))

    // Join node: waits for all parallel scans to complete
    .addNode("scan_join", async (state: PipelineState) => {
      const outputs = state.agentOutputs || [];
      const depFindings = outputs.find(o => o.nodeId === "scan_dependencies")?.content || "(no findings)";
      const codeFindings = outputs.find(o => o.nodeId === "scan_code_patterns")?.content || "(no findings)";
      const configFindings = outputs.find(o => o.nodeId === "scan_config")?.content || "(no findings)";
      return {
        parallelResults: { depFindings, codeFindings, configFindings },
        lastUpdatedAt: new Date().toISOString(),
      };
    })

    // Generate consolidated security assessment report
    .addNode("generate_report", async (state: PipelineState) => {
      const streamId = state.currentStreamId || `stream-security-${Date.now()}`;
      streamHandler.emitStatus("generate_report", "active", streamId);

      const depFindings = state.parallelResults?.depFindings || "No dependency issues.";
      const codeFindings = state.parallelResults?.codeFindings || "No code pattern issues.";
      const configFindings = state.parallelResults?.configFindings || "No config issues.";

      let report = [
        "# Security Assessment Report",
        "",
        `**Generated:** ${new Date().toISOString()}`,
        "",
        "## 1. Dependency Vulnerabilities",
        depFindings,
        "",
        "## 2. Code Security Patterns",
        codeFindings,
        "",
        "## 3. Configuration Security",
        configFindings,
        "",
        "## Summary",
        "Security audit complete. Review findings above and address critical issues first.",
        "Critical > High > Medium > Low priority remediation order.",
      ].join("\n");

      if (llmProvider) {
        try {
          report = await llmProvider.chat(
            [
              {
                role: "system",
                content: "You are a security auditor. Generate a professional Security Assessment Report in markdown format. Categorize findings by severity (Critical, High, Medium, Low). Include remediation recommendations for each finding. Consolidate related findings."
              },
              {
                role: "user",
                content: `Dependency scan:\n${depFindings}\n\nCode patterns:\n${codeFindings}\n\nConfig scan:\n${configFindings}`
              },
            ],
            { temperature: 0.2, maxTokens: 4096 }
          );
        } catch (err) {
          console.debug(`[SecurityAuditGraph] LLM report generation failed, using basic report (non-fatal): ${(err as Error).message}`);
        }
      }

      streamHandler.emitComplete("generate_report", 0, streamId);

      return {
        agentOutputs: [{
          nodeId: "generate_report",
          content: report,
          timestamp: new Date().toISOString(),
          metadata: { action: "security_report" },
        }],
        pipelineStatus: "completed" as const,
        lastUpdatedAt: new Date().toISOString(),
      };
    })

    // Fan-out to all 3 scans in parallel
    .addEdge("__start__", "scan_dependencies")
    .addEdge("__start__", "scan_code_patterns")
    .addEdge("__start__", "scan_config")

    // Collect all scan results in join node
    .addEdge("scan_dependencies", "scan_join")
    .addEdge("scan_code_patterns", "scan_join")
    .addEdge("scan_config", "scan_join")

    // Join → report → finish
    .addEdge("scan_join", "generate_report")
    .addEdge("generate_report", END);

  return graph.compile();
}

