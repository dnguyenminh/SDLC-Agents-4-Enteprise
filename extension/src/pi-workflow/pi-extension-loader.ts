/**
 * PiExtensionLoader — SA4E-333 Phase 2 scaffold.
 * Best-effort loader for pi.dev extension packages installed as npm deps.
 * These packages are pi-coding-agent Extensions (export default function(pi)),
 * not plain AgentTool arrays, so full UI tools (todo/ask-user/subagents)
 * require AgentSession + ExtensionRuntime. This loader records availability
 * without breaking the chat loop; built-in file tools already work via
 * pi-coding-tools.ts.
 */
import { debugLog } from '../debug-logger';
import type { AgentTool } from '@earendil-works/pi-agent-core';

export const PI_EXTENSION_PACKAGES = [
  'billion-context-pi', // 0.1.82 — compress/decompress/search_context (context opt)
  'pi-web-access', // 0.33.0 — webfetch/search
  '@juicesharp/rpiv-todo', // 2.11.0 — todo list
  '@juicesharp/rpiv-ask-user-question', // 2.11.0 — sole ask-user tool (raidou fork removed: needs pi-coding-agent>=0.85 + duplicate tool name)
  'pi-subagents', // 0.73.1 — subagent delegation
  '@cortexkit/aft-pi', // 0.57.2 — Rust file tools (read/write/edit/grep + delete/move)
] as const;

export interface ExtensionLoadResult {
  tools: AgentTool[];
  loaded: string[];
  skipped: Array<{ name: string; reason: string }>;
}

/**
 * Attempt to import each extension package. Collects plain tool arrays
 * when exposed; otherwise records loaded-but-needs-ExtensionRuntime.
 * Never throws — chat must work even if all extensions are skipped.
 */
export async function loadPiExtensionTools(): Promise<ExtensionLoadResult> {
  const tools: AgentTool[] = [];
  const loaded: string[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  for (const name of PI_EXTENSION_PACKAGES) {
    try {
      const mod = (await import(name)) as Record<string, unknown>;
      const candidates = [mod.tools, mod.default, mod.extension].filter(Boolean);
      let harvested = 0;
      for (const c of candidates) {
        if (Array.isArray(c)) {
          for (const t of c as AgentTool[]) {
            if (t && typeof (t as { name?: unknown }).name === 'string') {
              tools.push(t);
              harvested++;
            }
          }
        }
      }
      if (harvested > 0) {
        loaded.push(`${name} (+${harvested} tools)`);
      } else {
        // ESM pi extension (export default function(pi)) — needs ExtensionRuntime.
        loaded.push(name);
        skipped.push({
          name,
          reason: 'pi Extension (needs AgentSession/ExtensionRuntime for ctx.ui); dep installed, full wire in Phase 2',
        });
      }
    } catch (err) {
      skipped.push({ name, reason: `import failed: ${(err as Error).message.slice(0, 120)}` });
      debugLog(`[PiExtensionLoader] ${name} skipped: ${(err as Error).message}`);
    }
  }
  return { tools, loaded, skipped };
}
