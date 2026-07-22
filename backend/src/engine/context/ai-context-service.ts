/**
 * KSA-158: AI Context Service — intent-aware context assembly with token budgeting.
 * Orchestrates symbol resolution, section fetching, and budget management.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { SymbolResolver } from '../graph/symbol-resolver.js';
import { CallGraphService } from '../graph/call-graph-service.js';
import { TokenBudgetManager } from './token-budget-manager.js';
import { getStrategy } from './intent-strategies.js';
import { GitService } from './git-service.js';
import { AIContextParams, AIContextResponse } from './types.js';
import { fetchSection, notFoundResponse } from './context-sections.js';

export class AIContextService {
  private adapter: DatabaseAdapter;
  private resolver: SymbolResolver;
  private callGraph: CallGraphService;
  private gitService: GitService;
  private workspace: string;

  constructor(
    adapter: DatabaseAdapter,
    resolver: SymbolResolver,
    callGraph: CallGraphService,
    workspace: string
  ) {
    this.adapter = adapter;
    this.resolver = resolver;
    this.callGraph = callGraph;
    this.gitService = new GitService(workspace);
    this.workspace = workspace;
  }

  /** Get intent-aware context for a symbol within token budget. */
  async getContext(params: AIContextParams): Promise<AIContextResponse> {
    const startTime = Date.now();
    const { symbol, intent = 'explain', token_budget = 4000, caller_depth = 1 } = params;

    const resolved = await this.resolver.resolve(symbol);
    if (resolved.length === 0) {
      return notFoundResponse(symbol, intent, token_budget, startTime, this.resolver);
    }

    const targetSymbol = resolved[0];
    const strategy = getStrategy(intent);

    const budgetManager = new TokenBudgetManager(token_budget);
    const context: Record<string, any> = {};
    const sectionsIncluded: string[] = [];
    const sectionsOmitted: string[] = [];

    for (const section of strategy.sections) {
      if (budgetManager.isExhausted()) {
        sectionsOmitted.push(section.name);
        continue;
      }

      const content = fetchSection(section, targetSymbol, caller_depth, this.adapter, this.callGraph, this.resolver, this.gitService, this.workspace);
      if (content == null) {
        continue;
      }

      const tokens = budgetManager.estimateTokens(content);

      if (budgetManager.canFit(tokens)) {
        context[section.name] = content;
        budgetManager.consume(tokens);
        sectionsIncluded.push(section.name);
      } else if (budgetManager.remaining() > 100) {
        const truncated = budgetManager.truncateToFit(content);
        context[section.name] = truncated;
        context[`${section.name}_truncated`] = true;
        budgetManager.consumeAll();
        sectionsIncluded.push(section.name);
      } else {
        sectionsOmitted.push(section.name);
      }
    }

    return {
      symbol: targetSymbol.name,
      file_path: targetSymbol.filePath,
      kind: targetSymbol.kind,
      intent,
      context,
      metadata: {
        budget_used: budgetManager.used(),
        budget_total: token_budget,
        sections_included: sectionsIncluded,
        sections_omitted: sectionsOmitted,
        query_time_ms: Date.now() - startTime
      }
    };
  }
}
