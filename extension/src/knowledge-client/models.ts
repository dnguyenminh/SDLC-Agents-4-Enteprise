/**
 * KB Entity Models — mirror backend/src/knowledge/models.ts (SA4E-85).
 * Shared type contracts for the KnowledgeClient REST API.
 */

export type KbMessageRole = "user" | "assistant" | "system" | "tool";
export type KbThreadStatus = "active" | "completed" | "archived";

export interface KbThread {
  thread_id: string;
  workspace_id: string;
  title: string;
  agent_id: string | null;
  status: KbThreadStatus;
  created_at: string;
  updated_at: string;
}

export interface KbMessage {
  id: string;
  thread_id: string;
  workspace_id: string;
  role: KbMessageRole;
  content: string;
  agent_id: string | null;
  timestamp: string;
  seq: number;
}

export interface KbPendingWrite {
  task_id: string;
  channel: string;
  value: unknown;
}

export interface KbCheckpoint {
  thread_id: string;
  workspace_id: string;
  checkpoint: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  channel_versions: Record<string, unknown>;
  pending_writes: KbPendingWrite[];
  version: number;
  updated_at: string;
}

export interface KbCreateThreadInput {
  title?: string;
  agent_id?: string | null;
}

export interface KbSaveCheckpointInput {
  checkpoint?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  newVersions?: Record<string, unknown>;
  pendingWrites?: KbPendingWrite[];
  writes?: KbPendingWrite[];
  messages?: KbMessageInput[];
}

export interface KbMessageInput {
  id?: string;
  role: KbMessageRole;
  content: string;
  agent_id?: string | null;
  timestamp?: string;
}

/** Backend REST envelope: { data, error }. */
export interface ApiEnvelope<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
}
