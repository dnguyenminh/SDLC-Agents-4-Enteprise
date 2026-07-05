/**
 * Intent Classifier — Multi-Graph Architecture
 * Classifies user input into a PipelineIntent using regex patterns (fast path)
 * with LLM fallback for ambiguous inputs.
 */

import type { PipelineIntent } from "../state";
import type { LlmProvider } from "../llm-provider";
import { IntentClassification, CONFIDENCE_THRESHOLD } from "./router-state";

// === Regex Pattern Rules (fast path) ===

interface PatternRule {
  pattern: RegExp;
  intent: PipelineIntent;
  confidence: number;
}

const PATTERN_RULES: PatternRule[] = [
  // SDLC pipeline commands (ticket-based)
  { pattern: /^[A-Z]+-\d+\s+(full|tao\s+brd|tao\s+fsd|tao\s+tdd|tao\s+stp|tao\s+stc|implement|deploy|test|tao\s+ug)/i, intent: "sdlc", confidence: 1.0 },
  { pattern: /^[A-Z]+-\d+$/i, intent: "sdlc", confidence: 0.95 },
  { pattern: /^[A-Z]+-\d+\s+/i, intent: "sdlc", confidence: 0.9 },

  // Hotfix / bug fix
  { pattern: /\b(fix\s+bug|hotfix|patch|bug\s+fix|urgent\s+fix|critical\s+bug)\b/i, intent: "hotfix", confidence: 0.95 },
  { pattern: /\b(fix\s+lỗi|sửa\s+bug|sửa\s+lỗi|lỗi\s+gấp)\b/i, intent: "hotfix", confidence: 0.9 },

  // Code review
  { pattern: /\b(review\s+pr|code\s+review|review\s+#\d+|review\s+code|pr\s+review)\b/i, intent: "code_review", confidence: 0.95 },
  { pattern: /\b(review\s+pull\s+request|merge\s+request\s+review)\b/i, intent: "code_review", confidence: 0.9 },

  // Documentation
  { pattern: /\b(tao\s+ug|tao\s+dpg|create\s+guide|write\s+docs|viết\s+user\s+guide)\b/i, intent: "docs", confidence: 0.95 },
  { pattern: /\b(generate\s+documentation|update\s+readme)\b/i, intent: "docs", confidence: 0.85 },

  // Security audit
  { pattern: /\b(security\s+audit|scan\s+vulnerability|vulnerability\s+scan|owasp\s+scan|security\s+scan)\b/i, intent: "security_audit", confidence: 0.95 },
  { pattern: /\b(audit\s+bảo\s+mật|scan\s+bảo\s+mật)\b/i, intent: "security_audit", confidence: 0.9 },
];

/**
 * Classify user input into a PipelineIntent.
 * Fast regex match first; LLM fallback if confidence is below threshold.
 */
export async function classifyIntent(
  userInput: string,
  llmProvider?: LlmProvider
): Promise<IntentClassification> {
  // Fast path: regex matching
  const regexResult = classifyByRegex(userInput);
  if (regexResult.confidence >= CONFIDENCE_THRESHOLD) {
    return regexResult;
  }

  // LLM fallback for ambiguous inputs
  if (llmProvider) {
    try {
      const available = await llmProvider.isAvailable();
      if (available) {
        return await classifyByLlm(userInput, llmProvider);
      }
    } catch {
      // Fall through to regex result
    }
  }

  // Return best regex match or default to chat
  return regexResult;
}

/**
 * Fast regex classification — O(n) scan through pattern rules.
 */
function classifyByRegex(input: string): IntentClassification {
  const trimmed = input.trim();

  for (const rule of PATTERN_RULES) {
    if (rule.pattern.test(trimmed)) {
      return {
        intent: rule.intent,
        confidence: rule.confidence,
        source: "regex",
      };
    }
  }

  // Default: chat (free-form conversation)
  return {
    intent: "chat",
    confidence: 0.6,
    source: "regex",
  };
}

/**
 * LLM-based classification — one-shot prompt for ambiguous inputs.
 */
async function classifyByLlm(
  input: string,
  llmProvider: LlmProvider
): Promise<IntentClassification> {
  const systemPrompt = `You are an intent classifier for an SDLC pipeline system.
Classify the user's message into exactly ONE of these intents:
- "sdlc": SDLC pipeline tasks (create BRD/FSD/TDD, implement feature, deploy, test — usually with a ticket key like KSA-123)
- "hotfix": Bug fixes, urgent patches, error resolution
- "code_review": PR review, code quality review, merge request review
- "docs": Documentation generation (user guides, deployment guides, README)
- "security_audit": Security scanning, vulnerability analysis, OWASP checks
- "chat": General questions, help, conversation, explanations

Respond with ONLY the intent string, nothing else.`;

  const response = await llmProvider.chat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: input },
    ],
    { temperature: 0, maxTokens: 20 }
  );

  const normalized = response.trim().toLowerCase().replace(/['"]/g, "") as PipelineIntent;
  const validIntents: PipelineIntent[] = ["sdlc", "hotfix", "code_review", "docs", "security_audit", "chat"];

  if (validIntents.includes(normalized)) {
    return { intent: normalized, confidence: 0.85, source: "llm" };
  }

  // LLM returned invalid — fallback to chat
  return { intent: "chat", confidence: 0.5, source: "llm" };
}
