/**
 * MemoryToolDispatcher — routes all mem_* tool calls via handler registry.
 * OCP fix: replaced 23-case switch with a Map-based registry.
 * Adding a new mem_* tool only requires adding an entry to HANDLER_REGISTRY.
 */

import type { MemoryEngine } from '../engine/core.js';
import type { QueryLayer } from '../../../engine/query/query-layer.js';
import type { ScopeContext } from '../models.js';
import type { ScopePromotionService } from '../promotion/service.js';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { TagAnalyzerService } from '../llm/analyzer.js';
import type { ClassifyService } from '../llm/classify-service.js';
import type { ConvertToolResolver } from '../ingest/ConvertToolResolver.js';
import { handleSearch, handleDiscover, handleTags, handleCitations } from './search.js';
import { handleIngest, handleIngestFile, handlePin, handleMap, handleCrud } from './crud.js';
import {
  handleAdmin, handleGraph, handleConsolidate, handleLifecycle,
  handleTemplates, handleAttachments, handleConversation,
  handleScoring, handlePromote,
} from './analytics.js';
import { handleOutcome, handleVerify, handleConfigureDecay } from './evolution.js';
import { handleSmartIngest, handleSmartIngestCleanup } from './smart-ingest.js';

type Args = Record<string, unknown>;

/** Context bag passed to every handler. */
export interface DispatchContext {
  engine: MemoryEngine;
  workspace: string;
  scopeCtx: ScopeContext | undefined;
  queryLayer: QueryLayer | undefined;
  promotionService: ScopePromotionService | undefined;
  tagAnalyzer: TagAnalyzerService | undefined;
  classifyService: ClassifyService | undefined;
  convertResolver: ConvertToolResolver | undefined;
  dbAdapter: DatabaseAdapter | undefined;
  embeddingAvailable: boolean;
}

type ToolHandlerFn = (ctx: DispatchContext, args: Args) => Promise<string | null>;

/** Helper: wrap sync-or-async-or-null result into Promise<string | null>. */
function p(v: string | Promise<string | null> | null | undefined): Promise<string | null> {
  if (v == null) return Promise.resolve(null);
  if (typeof v === 'string') return Promise.resolve(v);
  return v;
}

/** Backward-compatible aliases: aliased name -> [canonical, extra args]. */
const ALIASES: Record<string, [string, Record<string, string>]> = {
  mem_get:       ['mem_crud',  { action: 'get' }],
  mem_delete:    ['mem_crud',  { action: 'delete' }],
  mem_list:      ['mem_crud',  { action: 'list' }],
  mem_status:    ['mem_admin', { action: 'status' }],
  mem_audit:     ['mem_admin', { action: 'audit' }],
  mem_sessions:  ['mem_admin', { action: 'sessions' }],
  mem_sync_code: ['mem_admin', { action: 'sync_code' }],
};

/**
 * OCP registry: tool name -> handler.
 * To add a new mem_* tool: import handler, add one line here. No other changes needed.
 */
const HANDLER_REGISTRY: Record<string, ToolHandlerFn> = {
  mem_search:               (ctx, a) => p(handleSearch(ctx.engine, ctx.scopeCtx, a)),
  mem_ingest:               (ctx, a) => p(handleIngest(ctx.engine, ctx.scopeCtx, ctx.tagAnalyzer, a, ctx.dbAdapter, ctx.embeddingAvailable)),
  mem_ingest_file:          (ctx, a) => p(handleIngestFile(ctx.engine, ctx.scopeCtx, ctx.workspace, a, ctx.convertResolver, ctx.dbAdapter, ctx.embeddingAvailable)),
  mem_pin:                  (_ctx, a) => p(handlePin(a)),
  mem_map:                  (_ctx, a) => p(handleMap(a)),
  mem_crud:                 (ctx, a) => p(handleCrud(ctx.engine, ctx.scopeCtx, a)),
  mem_graph:                (ctx, a) => p(handleGraph(ctx.engine, a)),
  mem_consolidate:          (_ctx, _a) => p(handleConsolidate()),
  mem_lifecycle:            (_ctx, a) => p(handleLifecycle(a)),
  mem_templates:            (_ctx, a) => p(handleTemplates(a)),
  mem_attachments:          (_ctx, a) => p(handleAttachments(a)),
  mem_discover:             (_ctx, a) => p(handleDiscover(a)),
  mem_tags:                 (ctx, a) => p(handleTags(ctx.engine, ctx.tagAnalyzer, a)),
  mem_citations:            (_ctx, a) => p(handleCitations(a)),
  mem_conversation:         (_ctx, a) => p(handleConversation(a)),
  mem_scoring:              (_ctx, a) => p(handleScoring(a)),
  mem_admin:                (ctx, a) => p(handleAdmin(ctx.engine, { ...a, _queryLayer: ctx.queryLayer, _workspace: ctx.workspace })),
  mem_promote:              (ctx, a) => p(handlePromote(ctx.promotionService, ctx.scopeCtx, a)),
  mem_outcome:              (ctx, a) => p(handleOutcome(ctx.engine, a)),
  mem_verify:               (ctx, a) => p(handleVerify(ctx.engine, a)),
  mem_configure_decay:      (ctx, a) => p(handleConfigureDecay(ctx.engine, a)),
  mem_smart_ingest:         (ctx, a) => p(handleSmartIngest(ctx.engine, ctx.scopeCtx, ctx.classifyService, a)),
  mem_smart_ingest_cleanup: (ctx, a) => p(handleSmartIngestCleanup(ctx.engine, ctx.scopeCtx, ctx.classifyService, a)),
};

export class MemoryToolDispatcher {
  private scopeCtx: ScopeContext | undefined;
  private promotionService: ScopePromotionService | undefined;
  private tagAnalyzer: TagAnalyzerService | undefined;
  private classifyService: ClassifyService | undefined;
  private convertResolver: ConvertToolResolver | undefined;
  private dbAdapter: DatabaseAdapter | undefined;
  private embeddingAvailable = false;

  constructor(
    private readonly engine: MemoryEngine,
    private readonly workspace: string,
    private readonly queryLayer?: QueryLayer,
  ) {}

  setScopeContext(ctx: ScopeContext | undefined): void { this.scopeCtx = ctx; }
  setPromotionService(svc: ScopePromotionService): void { this.promotionService = svc; }
  setTagAnalyzer(svc: TagAnalyzerService): void { this.tagAnalyzer = svc; }
  setConvertResolver(resolver: ConvertToolResolver): void { this.convertResolver = resolver; }
  setClassifyService(svc: ClassifyService): void { this.classifyService = svc; }
  setDbAdapter(adapter: DatabaseAdapter): void { this.dbAdapter = adapter; }
  setEmbeddingAvailable(available: boolean): void { this.embeddingAvailable = available; }

  /**
   * Dispatch a tool call via the handler registry.
   * OCP: to add a new tool, add to HANDLER_REGISTRY — no changes here.
   */
  async dispatch(name: string, args: Args): Promise<string | null> {
    const [resolved, merged] = this.resolveAlias(name, args);
    const handler = HANDLER_REGISTRY[resolved];
    if (!handler) return null;
    return handler(this.buildContext(), merged);
  }

  private buildContext(): DispatchContext {
    return {
      engine: this.engine,
      workspace: this.workspace,
      scopeCtx: this.scopeCtx,
      queryLayer: this.queryLayer,
      promotionService: this.promotionService,
      tagAnalyzer: this.tagAnalyzer,
      classifyService: this.classifyService,
      convertResolver: this.convertResolver,
      dbAdapter: this.dbAdapter,
      embeddingAvailable: this.embeddingAvailable,
    };
  }

  private resolveAlias(name: string, args: Args): [string, Args] {
    const alias = ALIASES[name];
    if (!alias) return [name, args];
    return [alias[0], { ...alias[1], ...args }];
  }
}
