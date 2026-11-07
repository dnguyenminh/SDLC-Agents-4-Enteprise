/**
 * Tool loadout assembly for the PiAgentSessionHost (SA4E-336/355/360/364/367):
 * the OS-aware base allowlist, the role-aware loadout build, and the bare
 * name-token estimate used by the budget gate.
 */
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { buildSessionToolLoadout, nameTools, toolSchemaTokenCap } from '../../pi-agent/tool-loadout.js';
import { estimateToolSchemaTokens } from '../../pi-agent/tool-schema-tokens.js';
import type { ContextBudget } from '../../pi-agent/models/ContextBudget';
import { McpBridge } from '../../mcp/mcp-bridge';
import { buildMcpBridgeAgentTools, buildMcpBridgeAgentToolsLive } from '../../pi-agent/extensions/mcp-bridge-extension';
import { isDiscoveryTool } from '../../pi-agent/extensions/tool-definitions';
import { getPiExtensionAgentTools } from '../pi-extension-runtime.js';
import { WORKSPACE_INFO_TOOL_NAME } from '../workspace-info-tool.js';
import { PEER_TOOL_NAMES } from '../peer/constants.js';
import { debugLog } from '../../debug-logger';
import type { SessionHostOptions } from './types.js';

/**
 * SA4E-336: OS-aware base tool loadout (TDD §3.6).
 * win32 → include `powershell`, exclude `bash`; non-win32 → the reverse.
 * A single shell tool per platform avoids model confusion / dual shell.
 * SA4E-360 (C-360-R1): `read_method` joins the loadout as a core read-only
 * symbol-slice tool (delta ⑥).
 * @param _workspaceRoot workspace root (reserved; loadout is platform-driven)
 * @returns ordered tool-name allowlist including the orientation tool
 */
export function getSessionToolLoadout(_workspaceRoot: string): string[] {
  const shellTool = process.platform === 'win32' ? 'powershell' : 'bash';
  // SA4E-369 (D4/AC7 + UAT layer-2 fix): the peer a2a tools are CORE session
  // tools ("auto in every tab") — they join the allowlist exactly like
  // read_method. Without this, the SDK's isAllowedTool filter drops the
  // peer customTools from the model's tool pool (never call-able).
  return [
    'read', 'write', 'edit', shellTool, 'grep', 'find', 'ls',
    WORKSPACE_INFO_TOOL_NAME, 'read_method', ...PEER_TOOL_NAMES,
  ];
}

/** UC-04: estimated schema tokens of bare tool names (OI-4 name estimate). */
export function tokensOfNames(names: readonly string[]): number {
  return names.reduce((sum, name) => sum + estimateToolSchemaTokens({ name }), 0);
}

/**
 * SA4E-355 Task 4 (UC-04): role-aware loadout — extension/MCP names are
 * filtered by role + phase under the schema-token cap. Core file tools are
 * NEVER dropped (BR-06); unknown role keeps the full pool (BR-07
 * fail-open); discoveryTools: [] keeps the Wave-2 allowlist composition.
 */
export async function buildSessionLoadout(
  budget: ContextBudget,
  opts: SessionHostOptions
): Promise<{ baseTools: string[]; extNames: string[]; bridgeTools: AgentTool[]; loadout: ReturnType<typeof buildSessionToolLoadout> }> {
  const workspaceRoot = opts.workspaceRoot;
  const baseTools = getSessionToolLoadout(workspaceRoot);
  let extNames: string[] = [];
  try {
    const ext = await getPiExtensionAgentTools(workspaceRoot);
    extNames = ext.tools.map((t) => t.name);
    if (ext.loaded.length > 0 || ext.skipped.length > 0) {
      debugLog(`[PiSessionHost] extensions: loaded=${ext.loaded.length} skipped=${ext.skipped.length}`);
    }
  } catch (err) {
    debugLog(`[PiSessionHost] extension names skipped: ${(err as Error).message}`);
  }
  // SA4E-364 OI-03: reuse opts.mcpBridge (typed unknown → narrow before build);
  // absent/wrong type ⇒ [] (fail-safe degraded — SA4E-360, W-1).
  // SA4E-391: prefer the LIVE server catalog (tools/list) so the agent sees the
  // real connected tools (drawio_*, get_curated_context, …), not just the frozen
  // 6-tool static list. Fall back to the static concrete tools when the server
  // is down or tools/list fails (degraded, never crashes).
  let bridgeTools: AgentTool[] = [];
  if (opts.mcpBridge instanceof McpBridge) {
    const bridge = opts.mcpBridge;
    bridgeTools = await buildMcpBridgeAgentToolsLive(bridge, { allowDynamicChaining: true });
    // Startup race: a tab's first turn can build the session a moment before
    // the MCP server reports "running" / finishes loading its tool catalog, so
    // the first tools/list returns empty. Since the cached host is reused for
    // the whole tab, a one-shot empty result would freeze the agent on the
    // static fallback forever. Retry briefly while the server IS available
    // before giving up, so the live catalog is picked up on session build.
    for (let attempt = 0; attempt < 3 && bridgeTools.length === 0 && bridge.isAvailable(); attempt++) {
      await new Promise((r) => setTimeout(r, 400));
      bridgeTools = await buildMcpBridgeAgentToolsLive(bridge, { allowDynamicChaining: true });
    }
    if (bridgeTools.length > 0) {
      debugLog(`[PiSessionHost] mcp live tools: ${bridgeTools.length} from tools/list`);
    } else {
      bridgeTools = buildMcpBridgeAgentTools(bridge, { allowDynamicChaining: true });
      debugLog(`[PiSessionHost] mcp live tools unavailable — static fallback: ${bridgeTools.length}`);
    }
  }
  if (bridgeTools.length === 0) debugLog('[PiSessionHost] mcp bridge absent — bridge tools omitted (degraded)');
  const bridgeNames = bridgeTools.map((t) => t.name);
  // SA4E-367: opted-in dynamic pair bypasses the role filter via discoveryTools
  // (never dropped — no role prefix matches find_/execute_). Default [] = today's behavior.
  const bridgeDynamicNames = bridgeTools.map((t) => t.name).filter(isDiscoveryTool);
  const bridgeConcreteNames = bridgeTools.map((t) => t.name).filter((n) => !isDiscoveryTool(n));
  const loadout = buildSessionToolLoadout({
    role: opts.role,
    phase: opts.phase,
    schemaTokenCap: toolSchemaTokenCap(budget),
    coreTools: nameTools(baseTools),
    discoveryTools: nameTools(bridgeDynamicNames),
    mcpTools: nameTools([...extNames, ...bridgeConcreteNames]), // SA4E-364: bridge names join the pool (role filter + cap apply)
  });
  return { baseTools, extNames, bridgeTools, loadout };
}
