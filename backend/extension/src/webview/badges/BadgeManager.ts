/**
 * BadgeManager — CRUD operations for context tag badges
 * KSA-252
 */

import type { ContextTagBadge, ResolvedContext } from '../protocol';
import { MessageBridge } from '../bridge/MessageBridge';

export class BadgeManager {
  private badges: Map<string, ContextTagBadge> = new Map();
  private bridge: MessageBridge;
  private idCounter = 0;

  constructor(bridge: MessageBridge) {
    this.bridge = bridge;
  }

  generateId(): string {
    return `badge-${++this.idCounter}-${Date.now()}`;
  }

  insert(badge: ContextTagBadge): void {
    this.badges.set(badge.id, badge);
  }

  remove(badgeId: string): boolean {
    return this.badges.delete(badgeId);
  }

  getAll(): ContextTagBadge[] {
    return Array.from(this.badges.values());
  }

  get(badgeId: string): ContextTagBadge | undefined {
    return this.badges.get(badgeId);
  }

  clear(): void {
    this.badges.clear();
  }

  count(): number {
    return this.badges.size;
  }

  async resolveAll(): Promise<ResolvedContext[]> {
    const results: ResolvedContext[] = [];

    for (const badge of this.badges.values()) {
      try {
        const content = await this.resolveOne(badge);
        results.push({
          type: badge.type,
          label: badge.label,
          content,
        });
      } catch (err) {
        results.push({
          type: badge.type,
          label: badge.label,
          content: `[Error resolving ${badge.label}: ${(err as Error).message}]`,
        });
      }
    }

    return results;
  }

  private async resolveOne(badge: ContextTagBadge): Promise<string> {
    switch (badge.type) {
      case 'git-diff':
        return this.bridge.resolveGitDiff();
      case 'terminal':
        return this.bridge.resolveTerminalOutput();
      case 'problems': {
        const diags = await this.bridge.resolveDiagnostics();
        return diags.map(d => `${d.severity.toUpperCase()} ${d.file}:${d.line} - ${d.message}`).join('\n');
      }
      case 'current-file': {
        const name = await this.bridge.getActiveFileName();
        return name || '[No active file]';
      }
      case 'files':
      case 'folder':
      case 'spec':
      case 'steering':
      case 'mcp':
        // These are resolved on submit via their metadata
        return `[${badge.type}: ${badge.label}]`;
      default:
        return `[Unknown type: ${badge.type}]`;
    }
  }
}
