/**
 * Code symbol summary + vector embedding task handlers — extracted from TaskWorker.
 * SA4E-99: LLM summary + pseudo code for code symbols (graph_nodes.label update).
 */
import type { PendingTask } from './models.js';
import type { CodeSummaryDeps } from './worker-context.js';

/** SA4E-99: System prompt for code symbol summary + pseudo code generation. */
const CODE_ENRICHMENT_SYSTEM_PROMPT = `You are a code documentation generator. Given a code symbol (function, class, method), produce a concise summary and pseudo code.

## Output Format
Return ONLY valid JSON (no markdown, no code fences):

{
  "summary": "1-2 sentence description of what this symbol does, its purpose and key behavior",
  "pseudo_code": "Simplified pseudo code showing the algorithm/logic flow (max 10 lines)"
}

## Rules
- summary: max 200 chars, describe WHAT it does and WHY (business purpose)
- pseudo_code: simplified logic flow, not the actual code. Use plain English + simple control flow
- For classes: summary describes responsibility, pseudo_code lists key methods and their roles
- For functions: summary describes input→output, pseudo_code shows algorithm steps

## Example

Input: function calculateDiscount(order, customer)
Output: {"summary":"Calculates order discount based on customer loyalty tier and order total.","pseudo_code":"1. Get customer tier (gold/silver/bronze)\\n2. If tier=gold AND total>100: discount=20%\\n3. If tier=silver AND total>50: discount=10%\\n4. Apply max discount cap from config\\n5. Return final discounted price"}`;

/** Build prompt for code symbol summary generation. */
export function buildCodeSummaryPrompt(
  name: string, kind: string, signature: string | null, body: string, filePath: string,
): string {
  const sig = signature ? `\nSignature: ${signature}` : '';
  return `/no_think\n\nSymbol: ${name}\nKind: ${kind}\nFile: ${filePath}${sig}\n\nBody:\n\`\`\`\n${body.slice(0, 4000)}\n\`\`\``;
}

/** Parse LLM response for code summary. Falls back to name if parse fails. */
export function parseCodeSummaryResponse(
  llmOutput: string, name: string, kind: string,
): { summary: string; pseudoCode: string } {
  const defaults = { summary: `${kind}: ${name}`, pseudoCode: '' };
  if (!llmOutput || llmOutput.trim().length === 0) return defaults;
  try {
    const jsonMatch = llmOutput.match(/\{[\s\S]*"summary"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: (parsed.summary || defaults.summary).slice(0, 300),
        pseudoCode: (parsed.pseudo_code || parsed.pseudoCode || '').slice(0, 2000),
      };
    }
  } catch { /* fallback */ }
  // Fallback: treat first line as summary
  const lines = llmOutput.trim().split('\n');
  return { summary: lines[0].slice(0, 300), pseudoCode: lines.slice(1).join('\n').slice(0, 2000) };
}

/**
 * SA4E-99: Generate LLM summary + pseudo code for a code symbol.
 * Reads symbol body from body_embeddings, calls LLM, updates graph_nodes.label.
 * Runs async in background queue — does not block code indexing.
 */
export async function processCodeSummaryTask(deps: CodeSummaryDeps, task: PendingTask, payload: any): Promise<void> {
  const { repo, engine, config, logger } = deps;
  if (!deps.llmService) { repo.resetForRetry(task.id); return; }

  const { symbol_id, name, kind, signature, body, file_path } = payload;
  if (!body || body.length < 20) {
    await repo.markCompleted(task.id);
    return;
  }

  const prompt = buildCodeSummaryPrompt(name, kind, signature, body, file_path);
  try {
    const timeoutMs = config.llmTimeout ?? 30000;
    const response = await Promise.race([
      deps.llmService.complete([
        { role: 'system', content: CODE_ENRICHMENT_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);

    const parsed = parseCodeSummaryResponse(response.content, name, kind);

    // Update graph_nodes.label with the short summary
    const entryId = `code:${symbol_id}`;
    const label = parsed.summary.slice(0, 60);
    await engine.getAdapter().runAsync(
      `UPDATE graph_nodes SET label = ? WHERE entry_id = ?`,
      [label, entryId],
    );

    // Store full summary + pseudo code in graph node metadata (JSON in cluster_id or separate)
    // For now, store in body_embeddings metadata or a simple update to level field
    // TODO: Consider a dedicated column for code_enrichment in graph_nodes
    logger.debug({ symbol_id, name, component: 'TaskWorker' },
      'Code summary generated and propagated');
  } catch (err) {
    logger.warn({ symbol_id, name, err, component: 'TaskWorker' },
      'Code summary LLM failed (non-fatal)');
  }
  await repo.markCompleted(task.id);
}

export async function processVectorEmbeddingTask(deps: CodeSummaryDeps, task: PendingTask, payload: any): Promise<void> {
  if (!deps.embeddingService) { deps.repo.resetForRetry(task.id); return; }
  const vector = await deps.embeddingService.generateEmbedding(payload.text);
  const buf = Buffer.from(new Float32Array(vector).buffer);
  await deps.engine.getAdapter().runAsync(
    'UPDATE knowledge_entries SET vector = ? WHERE id = ?',
    [buf, task.entry_id],
  );
  await deps.repo.markCompleted(task.id);
}
