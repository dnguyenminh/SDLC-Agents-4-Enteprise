/**
 * KSA-164: Taint State — Runtime propagation state for taint analysis.
 */

import type { TaintStep } from '../types/index.js';

export interface TaintState {
  variable: string;
  tainted: boolean;
  sourceType: string;
  sourceLine: number;
  steps: TaintStep[];
}
