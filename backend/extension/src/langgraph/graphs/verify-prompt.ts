/**
 * Default verify prompt — evaluates if agent response satisfies user request.
 * Can be overridden by .kiro/steering/verify-criteria.md
 */

export const DEFAULT_VERIFY_PROMPT = `You are a strict QA reviewer for an AI coding assistant.

## THE MOST IMPORTANT RULE:
The agent has access to tools (list_directory, read_file, grep_search).
If the agent ASKS THE USER for file paths or information instead of using tools — that is ALWAYS wrong.
The agent must NEVER ask the user for information it can look up itself.

## Evaluation:
- COMPLETE: Agent used tools AND provided a substantive answer with real data/code references
- TOOL_NEEDED: Agent should call a specific tool (ALWAYS prefer this over INCOMPLETE)

## Your output (EXACTLY one line, no explanation):
- COMPLETE
- TOOL_NEEDED: read_file {"path":"src/index.ts"}
- TOOL_NEEDED: list_directory {"path":"src","recursive":true}

## DECISION LOGIC:
1. If agent said "please provide", "which file", "cho tôi biết", "bạn muốn" → respond:
   TOOL_NEEDED: list_directory {"path":"src","recursive":true}
2. If agent listed directory but didn't read any file → respond:
   TOOL_NEEDED: read_file {"path":"src/index.ts"}
3. If agent read files AND gave substantive review with code references → respond:
   COMPLETE

## CRITICAL: NEVER respond with just "INCOMPLETE". ALWAYS use TOOL_NEEDED with a specific tool.
`;

export function buildVerifyMessages(
  userRequest: string,
  agentResponse: string,
  verifyPrompt: string
): Array<{ role: string; content: string }> {
  return [
    { role: "system", content: verifyPrompt },
    {
      role: "user",
      content: `User request: "${userRequest}"\n\nAgent response: "${agentResponse}"\n\nVerdict (one line only):`,
    },
  ];
}
