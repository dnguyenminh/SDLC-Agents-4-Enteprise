/**
 * KSA-159: Edit Context Service — source + callers + tests + git for editing.
 * Gathers everything needed before modifying a symbol.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { SymbolResolver } from '../graph/symbol-resolver.js';
import { CallGraphService } from '../graph/call-graph-service.js';
import { TestDetector } from '../graph/test-detector.js';
import { TokenBudgetManager } from './token-budget-manager.js';
import { GitService } from './git-service.js';
import { EditContextParams, EditContextResult } from './types.js';
import {
  ResolvedSymbolFull,
  resolveSymbolInput,
  readSymbolSource,
  getSignature,
  getCallerContext,
  getTestContext,
  getGitContext,
  getSiblingContext,
  symbolNotFoundResponse
} from './edit-helpers.js';

export class EditContextService {
  private adapter: DatabaseAdapter;
  private resolver: SymbolResolver;
  private callGraph: CallGraphService;
  private testDetector: TestDetector;
  private gitService: GitService;
  private budgetManager: TokenBudgetManager;
  private workspace: string;

  constructor(
    adapter: DatabaseAdapter,
    resolver: SymbolResolver,
    callGraph: CallGraphService,
    testDetector: TestDetector,
    workspace: string
  ) {
    this.adapter = adapter;
    this.resolver = resolver;
    this.callGraph = callGraph;
    this.testDetector = testDetector;
    this.gitService = new GitService(workspace);
    this.budgetManager = new TokenBudgetManager(4000);
    this.workspace = workspace;
  }

  /** Get full edit context for a symbol. */
  async getContext(params: EditContextParams): Promise<EditContextResult> {
    const startTime = Date.now();
    const {
      symbol: symbolInput,
      include_callers = true,
      include_tests = true,
      include_memories = false,
      include_git = true,
      token_budget = 4000,
      caller_depth = 1
    } = params;

    const symbol = resolveSymbolInput(symbolInput, this.adapter, this.resolver);
    if (!symbol) {
      return symbolNotFoundResponse(symbolInput, token_budget, startTime);
    }

    const source = readSymbolSource(symbol, this.workspace);
    const signature = getSignature(symbol, this.adapter);

    const [callers, tests, gitHistory, siblings] = await Promise.all([
      include_callers ? getCallerContext(symbol, caller_depth, this.callGraph, this.workspace) : Promise.resolve(null),
      include_tests ? getTestContext(symbol, this.testDetector, this.workspace) : Promise.resolve(null),
      include_git ? getGitContext(symbol, this.gitService) : Promise.resolve(null),
      getSiblingContext(symbol, this.adapter)
    ]);

    const sections: Record<string, { content: any; priority: number }> = {
      source: { content: source, priority: 1 },
    };
    if (callers && callers.length > 0) sections.callers = { content: callers, priority: 2 };
    if (tests && tests.length > 0) sections.tests = { content: tests, priority: 3 };
    if (gitHistory && gitHistory.length > 0) sections.git_history = { content: gitHistory, priority: 5 };
    if (siblings && siblings.length > 0) sections.siblings = { content: siblings, priority: 6 };

    const assembled = this.budgetManager.assemble(sections, token_budget);

    const result: EditContextResult = {
      symbol: symbol.name,
      file: symbol.filePath,
      line: symbol.line,
      kind: symbol.kind,
      source: assembled.result.source || source,
      signature,
      metadata: {
        tokenCount: assembled.tokenCount,
        tokenBudget: token_budget,
        sectionsIncluded: assembled.included,
        sectionsExcluded: assembled.excluded,
        queryTimeMs: Date.now() - startTime
      }
    };

    if (assembled.result.callers) result.callers = assembled.result.callers;
    if (assembled.result.tests) result.tests = assembled.result.tests;
    if (assembled.result.git_history) result.git_history = assembled.result.git_history;
    if (assembled.result.siblings) result.siblings = assembled.result.siblings;

    return result;
  }
}
