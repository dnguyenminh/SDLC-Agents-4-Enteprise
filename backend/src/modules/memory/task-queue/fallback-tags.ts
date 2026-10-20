/**
 * Fallback tag derivation + persistence — extracted from TaskWorker (SA4E-337 Fix #5).
 */
import type { PendingTask } from './models.js';
import type { TagEnrichmentDeps } from './worker-context.js';

/**
 * SA4E-337 FSD §6: folders that must never be used as a fallback tag
 * (BR-10 / BR-23 — denylisted folders fall through to the nearest ancestor).
 */
const FALLBACK_TAG_DENYLIST = new Set([
  'diagrams', 'testdata', 'templates', 'node_modules', '.git',
  'dist', 'build', 'out', '.opencode', '.code-intel', '.analysis',
]);

/** Windows drive segment (e.g. "C:") — never a meaningful tag. */
const DRIVE_SEGMENT = /^[A-Za-z]:$/;

/**
 * SA4E-337: pure fallback tag derivation used when the LLM is unavailable (Fix #5).
 *
 * Rules (FSD §5 / STC UT-79..82):
 * - ticket folder (`SA4E-337`) → `sa4e` + `sa4e-337`; feature folder (`F3`) → `feature` + `f3`
 * - doc-type file/folder (`BRD.md`) → `brd` (any level)
 * - parent-folder fallback (BR-20): nearest NON-denylisted folder; denylisted folder
 *   falls through to its grandparent (FSD EF-2 / TC-16)
 * - root-level file with no folder (FSD TC-11, STC UT-82) → `documents`
 * - content heuristics (`#### STORY` → `user-story`, …)
 * - merged with `existing_tags` dedup (BR-22), never empty (BR-08/BR-11);
 *   nothing derivable at all → `unknown` (BR-24)
 */
export function extractFallbackTags(payload: { source?: string; content?: string; existing_tags?: string }): string[] {
  const tags = new Set<string>();

  const source = (payload.source || '').replace(/\\/g, '/');
  const segments = source.split('/').filter(Boolean);

  // 1) ticket / feature / doc-type segments — matched at any depth
  for (const part of segments) {
    if (/^SA4E-\d+$/i.test(part)) { tags.add('sa4e'); tags.add(part.toLowerCase()); }
    if (/^F[0-9]+$/i.test(part)) { tags.add('feature'); tags.add(part.toLowerCase()); }
    if (/^(BRD|FSD|TDD|STP|STC|DPG|RLN|UG|RUN-LOG)/i.test(part)) {
      tags.add(part.replace(/\..*$/, '').toLowerCase());
    }
  }

  // 2) parent-folder fallback (BR-20..23): nearest non-denylisted ancestor folder
  const dirs = segments.slice(0, -1);
  if (dirs.length > 0) {
    const parent = [...dirs].reverse().find(d => !DRIVE_SEGMENT.test(d) && !FALLBACK_TAG_DENYLIST.has(d.toLowerCase()));
    if (parent) tags.add(parent.toLowerCase());
  } else if (segments.length > 0) {
    tags.add('documents'); // FSD TC-11 / STC UT-82 root-level fallback
  }

  // 3) content heuristics
  const content = payload.content || '';
  if (/#### STORY/.test(content)) tags.add('user-story');
  if (/#### REQUIREMENT/.test(content)) tags.add('requirement');
  if (/## Acceptance Criteria/.test(content)) tags.add('acceptance-criteria');
  if (/## API Design/.test(content)) tags.add('api-design');
  if (/## Architecture/.test(content)) tags.add('architecture');
  if (/## Test Cases/.test(content)) tags.add('test-cases');
  if (/## Deployment/.test(content)) tags.add('deployment');

  // 4) merge with existing tags (dedup BR-22, case-insensitive) and guarantee
  //    non-empty (BR-08/BR-11); nothing derivable at all → `unknown` (BR-24)
  const existing = payload.existing_tags
    ? payload.existing_tags.split(',').map((t: string) => t.trim()).filter(Boolean)
    : [];
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const tag of [...existing, ...tags]) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(tag);
  }
  if (merged.length === 0) merged.push('unknown');
  return merged;
}

/**
 * SA4E-337: Fallback tag extraction when LLM unavailable.
 * Derives tags from source file path + content heuristics, then persists them
 * with a race guard (never overwrite a client-enriched entry) and closes the
 * enrichment state so the entry never sticks at 'pending' (F4).
 */
export async function fallbackTagExtraction(deps: TagEnrichmentDeps, task: PendingTask, payload: any): Promise<void> {
  const merged = extractFallbackTags(payload);

  try {
    const adapter = deps.engine.getAdapter();
    let applied = false;
    try {
      // F4: race guard — mirror the LLM path, only write while still pending.
      const updateResult = await adapter.runAsync(
        `UPDATE knowledge_entries SET tags = ? WHERE id = ? AND enrichment_status = 'pending'`,
        [merged.join(','), task.entry_id],
      );
      applied = updateResult.changes > 0;
    } catch (colErr) {
      // Legacy schema without enrichment_status (pre-migration 007): no race state to
      // guard — apply the tags unconditionally so the fallback still has effect.
      await adapter.runAsync(
        `UPDATE knowledge_entries SET tags = ? WHERE id = ?`,
        [merged.join(','), task.entry_id],
      );
      applied = true;
    }

    if (!applied) {
      deps.logger.info({ entry_id: task.entry_id }, 'Fallback tag extraction skipped — entry no longer pending');
    } else {
      // F4: mark done (conditional) so the entry never stays 'pending' when LLM is down.
      try {
        await adapter.runAsync(
          `UPDATE knowledge_entries SET enrichment_status = 'done', enriched_by = 'fallback', enriched_at = ?
           WHERE id = ? AND enrichment_status = 'pending'`,
          [new Date().toISOString(), task.entry_id],
        );
      } catch (colErr) {
        deps.logger.debug({ err: colErr, entry_id: task.entry_id }, 'Fallback: enrichment_status close skipped (column may not exist)');
      }
      deps.logger.info({ entry_id: task.entry_id, tags: merged }, 'Fallback tag extraction applied');
    }
  } catch (err: any) {
    deps.logger.warn({ err, entry_id: task.entry_id }, 'Fallback tag extraction failed');
  }

  await deps.repo.markCompleted(task.id);
}
