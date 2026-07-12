/**
 * MemoryToolDispatcher — routes all mem_* tool calls.
 * Handles 14 consolidated tools + backward-compatible aliases.
 */

import type { MemoryEngine } from '../engine/core.js';
import type { QueryLayer } from '../../../engine/query/query-layer.js';
import type { KBScope, ScopeContext } from '../models.js';
import type { ScopePromotionService } from '../promotion/service.js';
import type { TagAnalyzerService } from '../llm/analyzer.js';
import { handleSearch, handleDiscover, handleTags, handleCitations } from './search.js';
import { handleIngest, handleIngestFile, handlePin, handleMap, handleCrud } from './crud.js';
import {
  handleAdmin, handleGraph, handleConsolidate, handleLifecycle,
  handleTemplates, handleAttachments, handleConversation,
  handleScoring, handlePromote,
} from './analytics.js';

type Args = Record<string, unknown>;

const ALIASES: Record<string, [string, Record<string, string>]> = {
  mem_get: ['mem_crud', { action: 'get' }],
  mem_delete: ['mem_crud', { action: 'delete' }],
  mem_list: ['mem_crud', { action: 'list' }],
  mem_status: ['mem_admin', { action: 'status' }],
  mem_audit: ['mem_admin', { action: 'audit' }],
  mem_sessions: ['mem_admin', { action: 'sessions' }],
  mem_sync_code: ['mem_admin', { action: 'sync_code' }],
};

export class MemoryToolDispatcher {
  private scopeCtx: ScopeContext | undefined;
  private promotionService: ScopePromotionService | undefined;
  private tagAnalyzer: TagAnalyzerService | undefined;

  constructor(
    private readonly engine: MemoryEngine,
    private readonly workspace: string,
    private readonly queryLayer?: QueryLayer
  ) {}

  setScopeContext(ctx: ScopeContext | undefined): void {
    this.scopeCtx = ctx;
  }

  setPromotionService(svc: ScopePromotionService): void {
    this.promotionService = svc;
  }

  setTagAnalyzer(svc: TagAnalyzerService): void {
    this.tagAnalyzer = svc;
  }

  dispatch(name: string, args: Args): string | null {
    const [resolved, merged] = this.resolveAlias(name, args);
    switch (resolved) {
      case 'mem_search': return handleSearch(this.engine, this.scopeCtx, merged);
      case 'mem_ingest': return handleIngest(this.engine, this.scopeCtx, this.tagAnalyzer, merged);
      case 'mem_ingest_file': return handleIngestFile(this.engine, this.scopeCtx, this.workspace, merged);
      case 'mem_pin': return handlePin(merged);
      case 'mem_map': return handleMap(merged);
      case 'mem_crud': return handleCrud(this.engine, this.scopeCtx, merged);
      case 'mem_graph': return handleGraph(this.engine, merged);
      case 'mem_consolidate': return handleConsolidate();
      case 'mem_lifecycle': return handleLifecycle(merged);
      case 'mem_templates': return handleTemplates(merged);
      case 'mem_attachments': return handleAttachments(merged);
      case 'mem_discover': return handleDiscover(merged);
      case 'mem_tags': return handleTags(this.engine, this.tagAnalyzer, merged);
      case 'mem_citations': return handleCitations(merged);
      case 'mem_conversation': return handleConversation(merged);
      case 'mem_scoring': return handleScoring(merged);
      case 'mem_admin': return handleAdmin(this.engine, { ...merged, _queryLayer: this.queryLayer, _workspace: this.workspace });
      case 'mem_promote': return handlePromote(this.promotionService, this.scopeCtx, merged);
      default: return null;
    }
  }

  private resolveAlias(name: string, args: Args): [string, Args] {
    const alias = ALIASES[name];
    if (!alias) return [name, args];
    return [alias[0], { ...alias[1], ...args }];
  }
}
