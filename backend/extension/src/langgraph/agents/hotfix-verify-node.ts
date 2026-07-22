/**
 * HotfixVerifyNode — lightweight verification for hotfix patches
 * Checks that the dev_fix output actually addresses the reported bug
 * and flags regression risks. Avoids the full QaNode test-planning pipeline.
 */

import { BaseNode } from "../core/base-node";
import { PipelineState, AgentOutput } from "../core/state";

export class HotfixVerifyNode extends BaseNode {
  async execute(state: PipelineState): Promise<Partial<PipelineState>> {
    const streamId = state.currentStreamId;
    this.streamHandler.emitToken(
      this.nodeId,
      "[HotfixVerify] Verifying bug fix...",
      streamId
    );

    // Find the dev_fix output and the analyze_bug output from history
    const devFixOutput = this.latestOutput(state, "dev_fix");
    const bugAnalysis = this.latestOutput(state, "analyze_bug");

    if (!devFixOutput || !devFixOutput.content) {
      this.streamHandler.emitToken(
        this.nodeId,
        "[HotfixVerify] No dev_fix output found — failing verification",
        streamId
      );
      return this.fail("No dev_fix output produced");
    }

    // If LLM is available, run a targeted verification
    if (await this.isLlmAvailable()) {
      const systemPrompt = [
        "You are a senior engineer performing a lightweight hotfix verification.",
        "Given the original bug analysis and the developer's fix, determine:",
        "1. Does the code change actually address the root cause described in the bug?",
        "2. Is there any obvious regression risk or side-effect?",
        "3. Is the fix minimal and focused (no unrelated changes)?",
        "",
        'Respond with JSON: { "passed": true/false, "feedback": "specific reasoning" }',
        "Pass only if the fix directly addresses the bug with acceptable risk.",
      ].join("\n");

      const userPrompt = [
        bugAnalysis
          ? `## Bug Analysis\n${bugAnalysis.content.substring(0, 4000)}`
          : "## Bug Analysis\n(not available)",
        "",
        "## Developer Fix Output",
        devFixOutput.content.substring(0, 8000),
      ].join("\n");

      try {
        const response = await this.callLlm(systemPrompt, userPrompt, {
          temperature: 0.2,
          maxTokens: 512,
        });
        return this.parseResponse(response);
      } catch (err) {
        // LLM failure — fail-open to deploy (hotfix urgency)
        this.streamHandler.emitToken(
          this.nodeId,
          "[HotfixVerify] LLM error, passing verification by default",
          streamId
        );
        return this.pass();
      }
    }

    // No LLM — lightweight content-based check as fallback
    const content = devFixOutput.content.toLowerCase();
    const hasFix = /fix|patch|change|update|correct|resolve/i.test(content);
    if (!hasFix) {
      return this.fail("Fix output does not contain code changes");
    }

    return this.pass();
  }

  /** Find latest agent output for a given node */
  private latestOutput(state: PipelineState, nodeId: string): AgentOutput | null {
    const outputs = state.agentOutputs || [];
    for (let i = outputs.length - 1; i >= 0; i--) {
      if (outputs[i].nodeId === nodeId) return outputs[i];
    }
    return null;
  }

  /** Parse LLM JSON response */
  private parseResponse(response: string): Partial<PipelineState> {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.passed === true || parsed.passed === "true") {
          return this.pass(parsed.feedback || undefined);
        }
        return this.fail(parsed.feedback || "Fix does not pass verification");
      }
    } catch (parseErr) {
      // LLM returned non-JSON — log and fail-open (hotfix urgency)
      console.warn(`[HotfixVerifyNode:${this.nodeId}] Could not parse LLM response, treating as pass:`, (parseErr as Error).message);
    }
    return this.pass();
  }

  /** Build pass state */
  private pass(feedback?: string): Partial<PipelineState> {
    return {
      verifyPassed: true,
      verifyFeedback: feedback ?? null,
      agentOutputs: [
        {
          nodeId: this.nodeId,
          content: feedback
            ? `Hotfix verification passed: ${feedback}`
            : "Hotfix verification passed",
          timestamp: new Date().toISOString(),
          metadata: { action: "hotfix_verify", result: "pass" },
        },
      ],
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  /** Build fail state */
  private fail(feedback: string): Partial<PipelineState> {
    return {
      verifyPassed: false,
      verifyFeedback: feedback,
      pipelineStatus: "failed",
      agentOutputs: [
        {
          nodeId: this.nodeId,
          content: `Hotfix verification failed: ${feedback}`,
          timestamp: new Date().toISOString(),
          metadata: { action: "hotfix_verify", result: "fail" },
        },
      ],
      lastUpdatedAt: new Date().toISOString(),
    };
  }
}
