/**
 * Data models for the memory engine.
 */

/** KB Scope — determines visibility isolation level. */
export type KBScope = 'USER' | 'PROJECT' | 'SHARED';

/** Context passed to every tool call for scope enforcement. */
export interface ScopeContext {
  userId: string;
  projectId?: string;
}

export interface KnowledgeEntry {
  id: number;
  content: string;
  summary: string;
  type: string;
  tier: string;
  scope: KBScope;
  user_id: string | null;
  project_id: string | null;
  source: string | null;
  source_ref: string | null;
  tags: string;
  confidence: number;
  access_count: number;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  expires_at: string | null;
  pinned: number;
  pin_order: number;
  structured_map: string;
  quality_score: number | null;
  archived: number;
  agent_name: string | null;
  owner: string | null;
}

export interface SearchResult {
  entry: KnowledgeEntry;
  score: number;
  matchType: string;
}

export interface GraphEdge {
  id: number;
  source_id: number;
  target_id: number;
  relation: string;
  weight: number;
  metadata: string | null;
  created_at: string;
}

export interface MemorySession {
  id: number;
  session_id: string;
  agent_name: string | null;
  started_at: string;
  ended_at: string | null;
  observation_count: number;
  status: string;
}

export interface AuditEntry {
  id: number;
  operation: string;
  entry_id: number | null;
  session_id: string | null;
  agent_name: string | null;
  details: string | null;
  created_at: string;
}

export interface TierStats {
  tier: string;
  entryCount: number;
  avgConfidence: number;
  avgAccessCount: number;
}

export interface ConsolidationResult {
  promoted: number;
  demoted: number;
  expired: number;
}

export interface ConversationTurn {
  id: number;
  session_id: string;
  turn_number: number;
  role: string;
  content: string;
  tool_calls: string | null;
  metadata: string | null;
  summarized: number;
  created_at: string;
}

export interface ConversationSession {
  session_id: string;
  turn_count: number;
  roles: string[];
  last_turn_at: string;
}

/** Per-tool usage counter row (SA4E-18). */
export interface ToolUsageRow {
  tool_name: string;
  call_count: number;
  last_called_at: string | null;
}
