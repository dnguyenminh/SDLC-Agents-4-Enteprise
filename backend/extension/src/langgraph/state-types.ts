/**
 * Pipeline state type definitions --- KSA-210
 */

import type { LlmToolCall } from "./llm-provider";

export type SDLCPhase = "requirements" | "specification" | "design" | "test_planning" | "implementation" | "user_guide" | "testing" | "deployment" | "all";
export type PipelineIntent = "sdlc" | "hotfix" | "code_review" | "docs" | "security_audit" | "chat";
export type PipelineStatus = "idle" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type ApprovalDecision = "approve" | "reject" | "revise";
export type StreamEventType = "token" | "status" | "progress" | "complete" | "error" | "retry" | "verify" | "strategy_switch" | "human_intervention_required";

export interface StrategyEvent { nodeId: string; strategy: string; timestamp: string; reason: string; }
export interface DocumentState { status: "pending" | "in_progress" | "done" | "failed"; version: number; path: string | null; completedAt: string | null; }
export interface AgentOutput { nodeId: string; content: string; timestamp: string; metadata?: Record<string, unknown>; }
export interface QualityGateCheckpoint { gateId: string; phase: SDLCPhase; nodeId: string; summary: string; criteria: string[]; timestamp: string; }
export interface QualityGateResult { passed: boolean; issues: string[]; }
export interface ChatMessage { id: string; role: "user" | "assistant" | "system"; content: string; nodeId?: string; timestamp: string; }
export interface PipelineError { nodeId: string; code: string; message: string; timestamp: string; recoverable: boolean; }
export interface PipelineGraphNode { id: string; label: string; status: "idle" | "active" | "completed" | "failed" | "skipped"; phase: SDLCPhase; }
export interface PersistedPipelineInfo { threadId: string; ticketKey: string; phase: SDLCPhase; status: PipelineStatus; lastUpdatedAt: string; }
