/**
 * SA4E-132 — GateGuardToolHandler: MCP tool handler registration.
 * Facade pattern: delegates to GateGuardService and formats MCP ToolResult responses.
 * All inputs validated with zod schemas before processing.
 */

import type { Logger } from 'pino';
import type { ToolHandler, ToolResult } from '../../../types/tool.js';
import type { GateGuardService } from './GateGuardService.js';
import { EvaluateInputSchema, DenylistInputSchema, AuditLogInputSchema } from './models.js';

/** Create text ToolResult helper */
function textResult(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }], isError: false };
}

/** Create error ToolResult helper */
function errorResult(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export class GateGuardToolHandler {
  constructor(
    private readonly service: GateGuardService,
    private readonly logger: Logger,
  ) {}

  /** Build Map of tool name → handler function */
  getHandlers(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();
    handlers.set('gateguard_evaluate', this.handleEvaluate.bind(this));
    handlers.set('gateguard_denylist', this.handleDenylist.bind(this));
    handlers.set('gateguard_audit_log', this.handleAuditLog.bind(this));
    return handlers;
  }

  /** gateguard_evaluate — evaluate command against denylist */
  private async handleEvaluate(args: Record<string, unknown>): Promise<ToolResult> {
    const parsed = EvaluateInputSchema.safeParse(args);
if (!parsed.success) {
      return errorResult(`Validation error: ${parsed.error.message}`);
    }
    const { command, agent, project_id } = parsed.data;
    const result = await this.service.evaluate(command, agent, project_id);
    this.logger.debug({ command: command.slice(0, 100), action: result.action }, 'gateguard_evaluate');
    return textResult(result);
  }

  /** gateguard_denylist — CRUD for denylist patterns */
  private async handleDenylist(args: Record<string, unknown>): Promise<ToolResult> {
const parsed = DenylistInputSchema.safeParse(args);
    if (!parsed.success) {
      return errorResult(`Validation error: ${parsed.error.message}`);
    }
    const { action, project_id, pattern, pattern_id, description } = parsed.data;

    switch (action) {
      case 'list':
        return textResult(await this.service.listPatterns(project_id));
      case 'add':
        return this.handleAddPattern(pattern, description, project_id);
      case 'remove':
        return this.handleRemovePattern(pattern_id);
default:
        return errorResult(`Unknown denylist action: ${action}`);
    }
  }

  /** gateguard_audit_log — query audit entries */
  private async handleAuditLog(args: Record<string, unknown>): Promise<ToolResult> {
const parsed = AuditLogInputSchema.safeParse(args);
    if (!parsed.success) {
      return errorResult(`Validation error: ${parsed.error.message}`);
    }
    const { project_id, limit, action_filter } = parsed.data;
    const entries = await this.service.getAuditLog(project_id, limit, action_filter);
    return textResult({ entries, count: entries.length });
  }

  private async handleAddPattern(pattern?: string, description?: string, projectId?: string): Promise<ToolResult> {
    if (!pattern) return errorResult('Missing required field: pattern');
    try {
      const added = await this.service.addPattern(pattern, description ?? '', projectId);
      return textResult({ success: true, pattern: added });
} catch (err) {
      return errorResult(`Failed to add pattern: ${(err as Error).message}`);
    }
  }

  private async handleRemovePattern(patternId?: string): Promise<ToolResult> {
    if (!patternId) return errorResult('Missing required field: pattern_id');
    const removed = await this.service.removePattern(patternId);
    if (!removed) return errorResult('Pattern not found or is a default pattern (cannot remove)');
    return textResult({ success: true, removed: patternId });
  }
}
