/**
 * KSA-154/155/156/157: Graph Services Unit Tests.
 * Tests SymbolResolver, CallGraphService, DependencyGraphService, ImpactAnalysis, Traverser.
 * Split into case modules + fixtures to keep each file under the CI line-count
 * gate (<=200 lines). No logic changed — this entry file registers the
 * relocated describe blocks (node:test, excluded from vitest by config).
 */

import { registerResolverCases } from './graph-services.resolver-cases.js';
import { registerAnalysisCases } from './graph-services.analysis-cases.js';
import { registerTraversalCases } from './graph-services.traversal-cases.js';

registerResolverCases();
registerAnalysisCases();
registerTraversalCases();
