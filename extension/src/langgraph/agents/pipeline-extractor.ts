import type { LlmProvider, LlmMessage } from "../core/llm-provider";

export interface PhaseDefinition {
  id: string;
  label: string;
  order: number;
  agentIds: string[];
  outputDoc?: string;
  description?: string;
}

export interface AgentRelation {
  sourceId: string;
  targetId: string;
  type: "reviews" | "feeds_into" | "verifies";
  phaseId: string;
  description?: string;
}

export interface PipelineDefinition {
  phases: PhaseDefinition[];
  relations: AgentRelation[];
}

const SYSTEM_PROMPT = `You are a pipeline architect analyzing agent markdown files.
Extract the SDLC pipeline structure from the agent descriptions.

Rules:
1. Each agent belongs to exactly one phase (its primary execution phase)
2. Some agents may also be reviewers in other phases
3. "reviews" = agent evaluates another agent's output in a specific phase
4. "feeds_into" = one phase's output is input for another phase
5. "verifies" = agent formally verifies/approves another agent's output
6. Phase order follows the natural SDLC lifecycle

Output the phases in correct execution order.`;

function buildPrompt(agentFiles: { id: string; content: string }[]): string {
  const fileBlock = agentFiles.map(f =>
    `=== Agent: ${f.id} ===\n${f.content}\n=== End ${f.id} ===`
  ).join("\n\n");

  return `Read the following agent markdown files and extract the pipeline structure (phases in order, agent-to-phase mapping, and inter-agent relationships).

${fileBlock}

Output a valid JSON object with:
- phases: array of { id, label, order, agentIds, outputDoc?, description? }
- relations: array of { sourceId, targetId, type ("reviews"|"feeds_into"|"verifies"), phaseId }

The phaseId in relations refers to the phase where the relationship applies (typically the target's phase).

Respond with ONLY the JSON object, no other text.`;
}

export class PipelineExtractor {
  async extract(
    agentFiles: { id: string; content: string }[],
    llm: LlmProvider
  ): Promise<PipelineDefinition> {
    const messages: LlmMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildPrompt(agentFiles) },
    ];

    // llm.chat() returns Promise<string> (per LlmProvider interface).
    // Previously this read response.content — a bug that threw
    // "Cannot read properties of undefined (reading 'match')" because
    // response was a plain string and .content was undefined.
    const response = await llm.chat(messages, { temperature: 0 });
    const jsonStr = extractJson(response);

    let parsed: { phases?: unknown[]; relations?: unknown[] };
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err) {
      // LLM output is non-deterministic; a malformed JSON response must
      // not crash the pipeline. Re-throw with context so callers (ensureGraph)
      // can fall back to static phase definitions.
      throw new Error(`PipelineExtractor: failed to parse LLM JSON output: ${(err as Error).message}`);
    }

    return {
      phases: (parsed.phases || []).map((p: any, i: number) => ({
        id: String(p.id),
        label: String(p.label || p.id),
        order: typeof p.order === "number" ? p.order : i,
        agentIds: (p.agentIds || []).map(String),
        outputDoc: p.outputDoc ? String(p.outputDoc) : undefined,
        description: p.description ? String(p.description) : undefined,
      })),
      relations: (parsed.relations || []).map((r: any) => ({
        sourceId: String(r.sourceId),
        targetId: String(r.targetId),
        type: r.type as AgentRelation["type"],
        phaseId: String(r.phaseId),
        description: r.description ? String(r.description) : undefined,
      })),
    };
  }
}

function extractJson(text: string): string {
  if (!text || typeof text !== "string") return "{}";
  // Try fenced code block first (common LLM output format: ```json ... ```)
  const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) return codeMatch[1].trim();
  // Then try the outermost JSON object (non-greedy via balanced-ish heuristic:
  // match from first { to the LAST } rather than first } to handle nested objects)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  return text;
}
