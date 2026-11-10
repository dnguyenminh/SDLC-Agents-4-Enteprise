/**
 * SA4E-406 — fix strategy for sequence diagrams: rebuild the canonical
 * lifeline/message layout (drawio-sequence-plan + drawio-sequence-xml) instead
 * of a graph layout, which would scramble the message order.
 */

import * as fs from 'fs';
import type { LayoutIssue } from './drawio-detect';
import { detectAllIssues } from './drawio-detect';
import { parseDrawioXml } from './drawio-parser';
import { planSequence } from './drawio-sequence-plan';
import { applySequencePlan } from './drawio-sequence-xml';
import { readCells } from './drawio-table-cells';

/** Warning for frames that could not be matched to messages (the file gives no positions or containment). */
function unmatched(ids: string[]): string {
  return ids.length ? `  ${ids.length} fragment frame(s) enclose no message that has a position in the file and were left as notes: ${ids.join(', ')}.` : '';
}

/** Warning for dividers whose position between the messages is not in the file. */
function guessed(ids: string[]): string {
  return ids.length ? `  ${ids.length} divider(s) had no message positions to place them by and were put mid-frame: ${ids.join(', ')}.` : '';
}

const significant = (list: LayoutIssue[]): number => list.filter(i => i.severity !== 'low').length;

/**
 * Lay out a sequence diagram and write it.
 * @param rawXml - sanitized draw.io XML
 * @param issues - issues detected before the fix (for the report)
 * @param filePath - file to write
 * @param validate - syntax/re-parse gate; throws on invalid XML
 * @returns JSON status string (fixed / already_good / error)
 */
export function sequenceRelayout(
  rawXml: string, issues: LayoutIssue[], filePath: string, validate: (xml: string) => void,
): string {
  try {
    const plan = planSequence(rawXml);
    if (!plan) return JSON.stringify({ error: 'Sequence diagram has no messages between top-level participants.' });
    const styles = new Map(readCells(rawXml).map(c => [c.id, c.style]));
    const xml = applySequencePlan(rawXml, plan, styles);
    if (xml === rawXml) {
      return JSON.stringify({ status: 'already_good', message: 'Sequence diagram already in canonical lifeline layout.', remaining_issues: significant(issues) });
    }
    validate(xml);
    fs.writeFileSync(filePath, xml, 'utf-8');
    const removed = plan.redundant.length ? ` Removed ${plan.redundant.length} unlabelled duplicate edges.` : '';
    return JSON.stringify({
      status: 'fixed',
      message: `Sequence layout: ${plan.participants.length} lifelines, ${plan.messages.length} messages in authoring order, ${plan.fragments.length} fragment(s).${removed}${unmatched(plan.unmatchedFrames)}${guessed(plan.guessedDividers)}`,
      remaining_issues: significant(detectAllIssues(parseDrawioXml(xml))),
    });
  } catch (e: unknown) {
    console.error('[drawio-sequence-apply] sequence layout error:', e);
    return JSON.stringify({ error: `Sequence layout failed: ${e instanceof Error ? e.message : e}` });
  }
}
