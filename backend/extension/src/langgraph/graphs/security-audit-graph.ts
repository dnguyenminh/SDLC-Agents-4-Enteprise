/**
 * Security Audit Subgraph — Full Security Scan Pipeline
 * OWASP-style audit across dependencies, code patterns, and configuration.
 *
 * Flow: __start__ → scan_dependencies → scan_code_patterns → scan_config → generate_report → __end__
 */

import { StateGraph, END } from "@langchain/langgraph";
import { PipelineAnnotation, PipelineState } from "../state";
import { McpBridge } from "../mcp-bridge";
import { StreamHandler } from "../stream-handler";
import type { LlmProvider } from "../llm-provider";
import { SecurityNode } from "../nodes/security-node";

/**
 * Build the security audit subgraph.
 */
export async function buildSecurityAuditSubgraph(
  mcpBridge: McpBridge,
  streamHandler: StreamHandler,
  llmProvider?: LlmProvider
) {
  const depScanNode = new SecurityNode("scan_dependencies", mcpBridge, streamHandler, llmProvider);
  const codeScanNode = new SecurityNode("scan_code_patterns", mcpBridge, streamHandler, llmProvider);
  const configScanNode = new SecurityNode("scan_config", mcpBridge, streamHandler, llmProvider);

  const graph = new StateGraph(PipelineAnnotation)
    // Scan dependencies for known vulnerabilities
    .addNode("scan_dependencies", (state: PipelineState) => depScanNode.run(state))

    // Scan code patterns for security anti-patterns
    .addNode("scan_code_patterns", (state: PipelineState) => codeScanNode.run(state))

    // Scan configuration for security misconfigurations
    .addNode("scan_config", (state: PipelineState) => configScanNode.run(state))

    // Generate consolidated security assessment report
    .addNode("generate_report", async (state: PipelineState) => {
      const streamId = state.currentStreamId || `stream-security-${Date.now()}`;
      streamHandler.emitStatus("generate_report", "active", streamId);

      const outputs = state.agentOutputs || [];
      const depFindings = outputs.find(o => o.nodeId === "scan_dependencies")?.content || "No dependency issues.";
      const codeFindings = outputs.find(o => o.nodeId === "scan_code_patterns")?.content || "No code pattern issues.";
      const configFindings = outputs.find(o => o.nodeId === "scan_config")?.content || "No config issues.";

      let report = [
        "# Security Assessment Report",
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
        "Security audit complete. Review findings above and address critical issues.",
      ].join("\n");

      if (llmProvider) {
        try {
          report = await llmProvider.chat(
            [
              { role: "system", content: "You are a security auditor. Generate a professional Security Assessment Report in markdown format. Categorize findings by severity (Critical, High, Medium, Low). Include remediation recommendations for each finding." },
              { role: "user", content: `Dependency scan:\n${depFindings}\n\nCode patterns:\n${codeFindings}\n\nConfig scan:\n${configFindings}` },
            ],
            { temperature: 0.2, maxTokens: 4096 }
          );
        } catch {
          // Use basic report
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

    .addEdge("__start__", "scan_dependencies")
    .addEdge("scan_dependencies", "scan_code_patterns")
    .addEdge("scan_code_patterns", "scan_config")
    .addEdge("scan_config", "generate_report")
    .addEdge("generate_report", END);

  return graph.compile();
}
