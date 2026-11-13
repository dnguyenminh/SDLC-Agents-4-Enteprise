/**
 * SA4E-406 — fix strategy for UML use-case diagrams (detect → plan → write).
 * A layered graph layout turns the actor fan-out into an orthogonal tangle;
 * this lays the diagram out the way people draw it (drawio-usecase-plan).
 */

import type { LayoutIssue } from './drawio-detect';
import { detectAllIssues } from './drawio-detect';
import type { UseCaseModel } from './drawio-detect-usecase';
import type { DiagramGraph } from './drawio-parser';
import { planUseCase } from './drawio-usecase-plan';
import { applyUseCasePlan } from './drawio-usecase-xml';
import { commitLayout } from './drawio-apply-validate';

const significant = (list: LayoutIssue[]): number => list.filter(i => i.severity !== 'low').length;

/**
 * Lay out a use-case diagram and write it.
 * @param rawXml - sanitized draw.io XML
 * @param graph - parsed diagram
 * @param model - use-case structure of `graph`
 * @param issues - issues detected before the fix (for the report)
 * @param filePath - file to write
 * @param validate - syntax/re-parse gate; throws on invalid XML
 * @returns JSON status string (fixed / already_good / error)
 */
export function useCaseRelayout(
  rawXml: string, graph: DiagramGraph, model: UseCaseModel, issues: LayoutIssue[],
  filePath: string, validate: (xml: string) => void,
): string {
  try {
    const plan = planUseCase(model, graph.edges);
    const ends = new Map(graph.edges.map(e => [e.id, { source: e.sourceId, target: e.targetId }]));
    const xml = applyUseCasePlan(rawXml, plan, model.cases.map(c => c.id), ends);
    if (xml === rawXml) {
      return JSON.stringify({ status: 'already_good', message: 'Use-case diagram already in canonical layout.', remaining_issues: significant(issues) });
    }
    const { graph: afterGraph } = commitLayout(xml, filePath);
    return JSON.stringify({
      status: 'fixed',
      message: `Use-case layout: ${model.cases.length} use cases in ${model.groups.length} group(s), ${model.actors.length} actors, ${plan.associations.length} associations.`,
      remaining_issues: significant(detectAllIssues(afterGraph)),
    });
  } catch (e: unknown) {
    console.error('[drawio-usecase-apply] use-case layout error:', e);
    return JSON.stringify({ error: `Use-case layout failed: ${e instanceof Error ? e.message : e}` });
  }
}
