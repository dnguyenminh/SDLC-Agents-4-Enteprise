/**
 * Prompt-context rendering for PegaRuleUnderstandingService.
 * Extracted (BR-18) — pure function; no behavior change.
 */

import type { PegaRuleUnderstanding } from '../PegaRuleUnderstandingService.js';

export function toPromptContext(understanding: PegaRuleUnderstanding): string {
  const lines: string[] = [];
  const W = 55;

  const topBorder = `╔${'═'.repeat(W)}╗`;
  const bottomBorder = `╚${'═'.repeat(W)}╝`;

  lines.push(topBorder);
  lines.push(`║  Rule Understanding: ${understanding.name.padEnd(W - 26)}║`);
  lines.push(`║  Type: ${understanding.pxObjClass.padEnd(W - 12)}║`);
  lines.push(`║  Class: ${understanding.className.padEnd(W - 13)}║`);
  lines.push(bottomBorder);
  lines.push('');

  lines.push(`── Schema ${'─'.repeat(W - 10)}──`);
  lines.push(`  Inferred: ${understanding.schema.inferred ? 'yes — detected from JSON' : 'no — loaded from known schema'}`);
  const docLines = understanding.schema.fieldDocs.split('\n');
  for (let i = 0; i < docLines.length; i++) {
    lines.push(`  ${docLines[i]}`);
  }
  lines.push('');

  lines.push(`── Semantic Analysis ${'─'.repeat(W - 22)}──`);
  lines.push(`  Summary: ${understanding.semantics.summary}`);
  lines.push(`  Intent: ${understanding.semantics.intent}`);

  if (understanding.semantics.sideEffects.length > 0) {
    lines.push('  Side Effects:');
    for (const se of understanding.semantics.sideEffects) {
      lines.push(`    • ${se.type}: ${se.detail}`);
    }
  }

  if (understanding.semantics.dataFlow.length > 0) {
    lines.push('  Data Flow:');
    for (const df of understanding.semantics.dataFlow) {
      if (df.input) {
        lines.push(`    ${df.input} > ${df.transform} > ${df.output}`);
      } else {
        lines.push(`    ${df.transform} > ${df.output}`);
      }
    }
  }

  if (understanding.semantics.conditions.length > 0) {
    lines.push('  Conditions:');
    for (const cond of understanding.semantics.conditions) {
      lines.push(`    WHEN ${cond.field} ${cond.operator} ${cond.value} — ${cond.description}`);
    }
  }
  lines.push('');

  lines.push(`── Dependencies ${'─'.repeat(W - 16)}──`);
  if (understanding.dependencies.length === 0) {
    lines.push('  (none)');
  } else {
    for (const dep of understanding.dependencies) {
      const opt = dep.optional ? ' (optional)' : '';
      lines.push(`  → ${dep.type}: ${dep.name} (${dep.relation})${opt}`);
    }
  }
  if (understanding.dependencyGraph) {
    lines.push(`  Graph: ${understanding.dependencyGraph}`);
  }
  lines.push('');

  if (understanding.simulation) {
    lines.push(`── Simulation ${'─'.repeat(W - 14)}──`);
    if (understanding.simulation.input) {
      lines.push(`  Input: ${JSON.stringify(understanding.simulation.input)}`);
    }
    if (understanding.simulation.result) {
      const r = understanding.simulation.result;
      lines.push(`  Result: ${r.success ? '✓ Success' : '✗ Failed'} (${r.executionTimeMs}ms)`);
      if (r.errors.length > 0) {
        for (const err of r.errors) {
          lines.push(`    Error: ${err}`);
        }
      }
    }
    if (understanding.simulation.trace.length > 0) {
      lines.push('  Trace:');
      for (const t of understanding.simulation.trace) {
        lines.push(`    Step ${t.step}: ${t.action} — ${t.detail}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
