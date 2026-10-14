/**
 * SA4E-360 — SkeletonInjector (TDD §6.2, C-360-S2 measure==inject, OI-5).
 *
 * Composes the measured skeleton + functional-map sections into the shipped
 * gate #2 inputs: loadFiles gate entries (raw — the gate applies compression
 * internally during ladder escalation) and the virtual agentsFiles override
 * (byte-identical content — INV-2; compression applied ONLY when the gate
 * escalated, matching measureStaticAssembly's compressed measurement).
 * SA4E-360 never throws budget errors itself — gate #2 stays the REJECT of
 * record (P-3/P-5); this module only supplies measured content + telemetry.
 */
import { compressPrompt } from '../../pi-agent/prompt-compressor.js';
import { logger } from '../../logger.js';
import { SKELETON_MEASUREMENT_POINT } from './skeleton-types.js';
import type { SkeletonGateTelemetry, SkeletonSections } from './skeleton-types.js';
import type { SessionGateResult } from '../../pi-agent/session-budget-gate.js';

/** Virtual agentsFiles carrying the measured sections (TDD §2.2 step 7). */
export const SKELETON_VIRTUAL_FILE = '.pi/workspace-skeleton.md';
export const MAP_VIRTUAL_FILE = '.pi/workspace-map.md';

export class SkeletonInjector {
  /**
   * Gate #2 entries: skeleton + functional-map text (raw). Empty/degraded
   * content contributes NOTHING (zero tokens) — DEGRADED stays invisible.
   */
  gateEntries(sections: SkeletonSections): ReadonlyArray<{ content: string }> {
    const entries: Array<{ content: string }> = [];
    const skeleton = sections.skeleton.skeletonContent;
    if (skeleton) entries.push({ content: skeleton });
    const mapText = sections.map?.text;
    if (mapText) entries.push({ content: mapText });
    return entries;
  }

  /**
   * Decorator over the shipped applyCompressedAgentsFiles composition: appends
   * the SAME measured strings as virtual context files (measure == inject).
   * Degraded/empty sections return the base UNCHANGED (identity — the shipped
   * SA4E-355 passthrough contract holds byte-for-byte when nothing is added).
   */
  agentsFileOverride(
    sections: SkeletonSections,
    shouldCompress: boolean
  ): <T extends { path: string; content: string }>(base: { agentsFiles: T[] }) => { agentsFiles: T[] } {
    return (base) => {
      const skeleton = sections.skeleton.skeletonContent;
      const mapText = sections.map?.text;
      if (!skeleton && !mapText) return base; // degraded — identity passthrough
      const files = [...base.agentsFiles];
      if (skeleton) {
        files.push({ ...(base.agentsFiles[0] ?? ({} as never)), path: SKELETON_VIRTUAL_FILE, content: shouldCompress ? compressPrompt(skeleton) : skeleton } as never);
      }
      if (mapText) {
        files.push({ ...(base.agentsFiles[0] ?? ({} as never)), path: MAP_VIRTUAL_FILE, content: shouldCompress ? compressPrompt(mapText) : mapText } as never);
      }
      return { agentsFiles: files };
    };
  }

  /**
   * OI-5 — enriched PI_GATE_DECISION payload: shipped decision vocabulary
   * (ALLOW/WARN/REJECT) + skeleton fields for M6/machine traceability. The
   * shipped event in budget-gate.ts is UNTOUCHED (governance constraint).
   */
  telemetry(sections: SkeletonSections, gate: SessionGateResult): SkeletonGateTelemetry {
    const enriched: SkeletonGateTelemetry = {
      decision: gate.outcome.decision,
      usagePercent: Math.round(gate.outcome.usagePercent * 100) / 100,
      staticTokens: gate.outcome.staticTokens,
      escalations: [...gate.outcome.escalations],
      skeletonTokens: sections.skeleton.skeletonTokens,
      truncationApplied: sections.skeleton.truncationApplied,
      measurementPoint: SKELETON_MEASUREMENT_POINT,
    };
    logger.info('PI_GATE_DECISION', enriched as unknown as Record<string, unknown>);
    return enriched;
  }
}
