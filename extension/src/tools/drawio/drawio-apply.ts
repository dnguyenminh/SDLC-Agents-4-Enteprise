/**
 * SA4E-84 — Apply orchestrator for drawio_auto_layout fix mode (public face).
 * SA4E-406: the actual logic moved behind this facade for the line-count gate —
 *   drawio-verify-loop  (BRD STORY 2 verify loop + A2 contract assembly)
 *   drawio-apply-strategy (one dispatch pass: sequence/use-case/ports/repair/ELK)
 *   drawio-apply-relayout (full relayout strategies), drawio-apply-args (limits)
 */

export { handleApply } from './drawio-verify-loop';
export { normalizeLayoutArgs, violationRatio } from './drawio-apply-args';
