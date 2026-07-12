/**
 * AnalyzeInputNode — Multilingual Intent Classifier
 * Uses LLM with structured output (Zod) to classify raw human feedback
 * as APPROVE / REJECT / NEED_CLARIFICATION, then maps to approvalDecision.
 */
import { z } from "zod";
import { BaseNode } from "../core/base-node";
import { PipelineState, IntentAnalysis, ApprovalDecision } from "../core/state";

const IntentAnalysisSchema = z.object({
  intent: z.enum(["APPROVE", "REJECT", "NEED_CLARIFICATION"]).describe(
    "APPROVE if user agrees/LGTM/lets proceed. REJECT if user rejects/asks to cancel. NEED_CLARIFICATION if user asks a question or is ambiguous."
  ),
  reasonSummary: z.string().describe("Brief reason summary in English."),
});

const ANALYSIS_SYSTEM_PROMPT = `You are a multilingual intent classifier for an SDLC pipeline.
Analyze the user's feedback text and determine their intent.
The user may type in ANY language (English, Vietnamese, Japanese, etc.) or use slang (lgtm, ok, sửa lại, cấm chạy...).

Rules:
- APPROVE: user agrees, says "ok", "lgtm", "good", "tiếp tục", "được", "proceed", "looks good"
- REJECT: user disagrees, says "no", "stop", "cấm", "sai", "bad", "reject", "không được"
- NEED_CLARIFICATION: user asks a question, is ambiguous, or requests changes without rejecting

If the user requests specific changes (e.g. "sửa cái X đi", "change Y"), classify as APPROVE
with the change request noted in reasonSummary — the pipeline will handle the revision.`;

export class AnalyzeInputNode extends BaseNode {
  async execute(state: PipelineState): Promise<Partial<PipelineState>> {
    const rawInput = state.rawHumanInput || state.userFeedback || "";
    if (!rawInput.trim()) {
      return {
        analyzedIntent: null,
        approvalDecision: null,
        stepStatus: "NO_INPUT",
      };
    }

    this.streamHandler.emitToken(
      this.nodeId,
      `[Intent Analyzer] Classifying feedback: "${rawInput.slice(0, 80)}..."`,
      state.currentStreamId
    );

    try {
      const structuredLlm = this.llmProvider!.withStructuredOutput(IntentAnalysisSchema);
      const result: IntentAnalysis = await structuredLlm.invoke([
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: `User feedback: "${rawInput}"` },
      ]);

      this.streamHandler.emitToken(
        this.nodeId,
        `[Intent Analyzer] Result: ${result.intent} — ${result.reasonSummary}`,
        state.currentStreamId
      );

      const approvalDecision: ApprovalDecision | null = this.mapIntentToDecision(result.intent);

      return {
        analyzedIntent: result,
        approvalDecision,
        approvalRequired: false,
        pipelineStatus: approvalDecision === "reject" ? "cancelled" : "running",
        rawHumanInput: null,
      };
    } catch (error) {
      this.streamHandler.emitError(
        this.nodeId,
        `Intent analysis failed: ${(error as Error).message}`,
        state.currentStreamId
      );
      return {
        analyzedIntent: { intent: "NEED_CLARIFICATION", reasonSummary: "Analysis error, defaulting to clarification needed." },
        approvalDecision: null,
        approvalRequired: true,
        pipelineStatus: "paused",
      };
    }
  }

  private mapIntentToDecision(intent: "APPROVE" | "REJECT" | "NEED_CLARIFICATION"): ApprovalDecision | null {
    switch (intent) {
      case "APPROVE": return "approve";
      case "REJECT": return "reject";
      case "NEED_CLARIFICATION": return null;
    }
  }
}
