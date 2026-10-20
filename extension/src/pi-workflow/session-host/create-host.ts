/**
 * PiAgentSessionHost — SA4E-334 Option A.
 * Real pi-coding-agent AgentSession per workspaceRoot:
 * cwd + SessionManager (workspace-local .jsonl transcripts) +
 * ModelRuntime (in-memory API key, no auth.json writes) +
 * DefaultResourceLoader (additionalExtensionPaths = our 7 pi.dev packages,
 * appendSystemPrompt = workspace root prompt).
 *
 * Session-first with legacy fallback: any failure throws a descriptive
 * Error and the caller (PiWorkflowAdapter) keeps the legacy
 * PiWorkflowEngine path. Never hangs a turn (30s ensure timeout).
 */
import * as path from 'node:path';
import { debugLog } from '../../debug-logger';
import { halveSteeringCap } from '../../pi-agent/budget-gate.js';
import { DEFAULT_AUTO_CHUNK_CONFIG } from '../../pi-agent/context-budget-auto-split.js';
import { runSessionBudgetGate } from '../../pi-agent/session-budget-gate.js';
import { scopedSteering } from '../../pi-agent/scoped-steering.js';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { buildWorkspaceSystemPrompt } from '../pi-coding-tools.js';
import { createWorkspaceInfoTool, toSessionToolDefinition } from '../workspace-info-tool.js';
import { createSkeletonRuntime, buildSkeletonSections } from '../skeleton/skeleton-wiring.js';
import { createReadMethodTool } from '../skeleton/read-method-tool.js';
import { getPiExtensionEntries } from '../pi-extension-runtime.js';
import { resolveSessionGovernance, loadSessionContextFiles } from './governance.js';
import { createModelRuntime } from './model-resolution.js';
import { applyCompressedAgentsFiles, applyScopedSkills, failOpenOverride } from './overrides.js';
import { buildSessionLoadout, tokensOfNames } from './loadout.js';
import { createSessionPromptTurn } from './turn-executor.js';
import { wirePeerSession } from './peer-approval.js';
import type { SessionHost, SessionHostOptions } from './types.js';

/**
 * Assembles one AgentSession-backed host: model runtime + governance +
 * skeleton + loadout + budget gate + resource loader, then the live session.
 */
export async function createHost(opts: SessionHostOptions): Promise<SessionHost> {
  const { workspaceRoot, providerId } = opts;
  const piCoding = await import('@earendil-works/pi-coding-agent');

  const agentDir = piCoding.getAgentDir();
  const { modelRuntime, model } = await createModelRuntime(piCoding, opts);

  const settingsManager =
    (opts.settingsManager as never) ?? piCoding.SettingsManager.create(workspaceRoot, agentDir);
  const sessionDir = path.join(workspaceRoot, '.pi', 'sessions');
  const sessionManager =
    (opts.sessionManager as never) ?? piCoding.SessionManager.create(workspaceRoot, sessionDir);
  // SA4E-370 S2: agent personaBody is prepended to the workspace system prompt so
  // it flows through the budget gate (BR-01/BR-02: measured in static budget,
  // REJECT with PI_CONTEXT_BUDGET_EXCEEDED if oversized).
  const baseWorkspacePrompt = buildWorkspaceSystemPrompt(workspaceRoot);
  const workspacePrompt = opts.personaBody
    ? `${baseWorkspacePrompt}\n\n--- Agent Persona ---\n${opts.personaBody}`
    : baseWorkspacePrompt;
  if (opts.personaBody) {
    debugLog(`[PiSessionHost] persona injected for agent ${opts.activeAgentId ?? '(unknown)'} (${opts.personaBody.length} chars)`);
  }
  // SA4E-355 (TDD §6.1): resolve the session budget + conditional compression
  // decision BEFORE wiring the loader overrides (UC-01 feeds UC-02/UC-03).
  const { budget, shouldCompress, tier } = resolveSessionGovernance(
    piCoding,
    opts,
    model,
    workspaceRoot,
    agentDir,
    workspacePrompt
  );
  // SA4E-360 (§6.4 ①②): skeleton runtime + sections BETWEEN budget resolution
  // and gate #2 (BR-360-01 — measured BEFORE createAgentSession, provider never
  // called oversized). Bridge-absent ⇒ DEGRADED sections (fail-safe, §4.6).
  const skeletonRuntime = createSkeletonRuntime(opts.mcpBridge);
  const sections = await buildSkeletonSections(skeletonRuntime, workspaceRoot, budget.staticBudget, []);
  // SA4E-355 Task 4 (UC-04): role-aware loadout — extension/MCP names are
  // filtered by role + phase under the schema-token cap (see buildSessionLoadout).
  const { baseTools, bridgeTools, loadout } = await buildSessionLoadout(budget, opts);
  // SA4E-355 Task 5 (UC-05): fail-safe gate BEFORE createAgentSession.
  // REJECT throws PI_CONTEXT_BUDGET_EXCEEDED (provider never called, BR-09);
  // WARN logs and proceeds (AF-1 UC-05). Escalation takes real effect below.
  // SA4E-360 (§6.4 ③): skeleton + map sections enter as ADDITIONAL measured
  // context-file entries — gate #2 remains the REJECT of record (P-5).
  const gate = runSessionBudgetGate(budget, {
    loadFiles: () => [
      ...loadSessionContextFiles(piCoding, workspaceRoot, agentDir),
      ...skeletonRuntime.injector.gateEntries(sections),
    ],
    workspacePrompt,
    toolSchemaTokens: loadout.schemaTokens,
    minToolSchemaTokens: tokensOfNames(baseTools),
    shouldCompress,
  });
  // SA4E-360 (§6.4 ⑦): OI-5 enriched PI_GATE_DECISION (shipped event untouched).
  skeletonRuntime.injector.telemetry(sections, gate);
  // Escalation takes real effect: forced compression, halved steering share,
  // minimal allowlist (BR-08). Unescalated path keeps Wave-2 composition.
  const finalCompress = gate.shouldCompress;
  let steeringBudget = gate.steeringBudget;
  // SA4E-355 auto-fallback: tier small → incremental steering + lean loadout
  const tierSmall = tier === 'small';
  if (tierSmall && DEFAULT_AUTO_CHUNK_CONFIG.incrementalSteering) {
    steeringBudget = halveSteeringCap(steeringBudget);
  }
  // SA4E-369 peer wiring (→ peer-approval.ts): shared origin tracker +
  // fail-closed approval-gate extension + fail-safe registry tools.
  const peer = wirePeerSession(opts, providerId);
  const resourceLoader =
    (opts.resourceLoader as never) ??
    new piCoding.DefaultResourceLoader({
      cwd: workspaceRoot,
      agentDir,
      settingsManager,
      additionalExtensionPaths: getPiExtensionEntries(workspaceRoot),
      appendSystemPrompt: [workspacePrompt],
      extensionFactories: peer.extensionFactories,
      // SA4E-355 Task 2 (UC-02): role-scoped skills + phase-scoped, capped steering.
      skillsOverride: (base) =>
        failOpenOverride(base, (b) => applyScopedSkills(b, opts.role), 'skillsOverride'),
      // SA4E-355 Task 3+5 (UC-03/UC-05): conditional compression of AGENTS.md
      // context files — forced when the gate escalated (BR-04/BR-08).
      // SA4E-360 (§6.4 ④): composed AFTER the shipped compression — the
      // injected virtual files carry the SAME measured strings (INV-2,
      // measure == inject byte-identical; compression mirrors the ladder).
      agentsFilesOverride: (base) =>
        failOpenOverride(
          base,
          (b) => {
            const compressed = applyCompressedAgentsFiles(b, finalCompress);
            return skeletonRuntime.injector.agentsFileOverride(sections, finalCompress)(compressed);
          },
          'agentsFilesOverride'
        ),
      // SA4E-355 Task 2+3+5: scoped steering with the same conditional
      // compression over the gate-halved share when step 2 fired (BR-08).
      appendSystemPromptOverride: (base) =>
        failOpenOverride(
          base,
          (b) => scopedSteering(b, opts.role, opts.phase, steeringBudget, { compress: finalCompress }),
          'appendSystemPromptOverride'
        ),
    });

  // Tool allowlist: escalation step 3 (BR-08) drops back to the core
  // file tools + orientation; otherwise the role-aware loadout above.
  // Dedupe keeps AFT's hoisted overrides single-named.
  // Auto-fallback lean loadout only for very small context (≤4k)
  const verySmallCtx = budget.nCtx <= 4096;
  const autoLean = tierSmall && verySmallCtx && DEFAULT_AUTO_CHUNK_CONFIG.leanLoadout;
  const effectiveMinLoadout = gate.minLoadout || autoLean;
  const allowlist = (effectiveMinLoadout ? [...baseTools] : loadout.loadout).filter(
    (n, i, all) => typeof n === 'string' && n && all.indexOf(n) === i
  );
  debugLog(`[PiSessionHost] tool allowlist: ${allowlist.length} names`);

  const { session } = await piCoding.createAgentSession({
    cwd: workspaceRoot,
    modelRuntime: modelRuntime as never,
    model: model as never,
    resourceLoader: resourceLoader as never,
    sessionManager: sessionManager as never,
    settingsManager: settingsManager as never,
    // Zero-arg orientation tool (same builder as the legacy path).
    // SA4E-360 (§6.4 ⑤): read_method joins the session custom tools; the
    // workspace-info tool gains the functional-map section (C-360-M1/M2).
    customTools: [
      toSessionToolDefinition(createWorkspaceInfoTool(workspaceRoot, skeletonRuntime.mapProvider)),
      toSessionToolDefinition(createReadMethodTool(workspaceRoot, skeletonRuntime.locator, skeletonRuntime.checker)),
      // SA4E-364 FR-09: the shared converter hardcodes 'Workspace orientation'
      // prompt metadata — bridge tools override it to undefined so wrong
      // guidance never leaks into the system prompt (SDK skips undefined).
      ...bridgeTools.map((t) => ({
        ...toSessionToolDefinition(t as unknown as AgentTool),
        promptSnippet: undefined,
        promptGuidelines: undefined,
      })),
      // SA4E-369 (D4): peer_list/peer_send/peer_status auto in every tab (AC7).
      ...peer.peerToolDefs,
    ] as never,
    tools: allowlist,
  });

  debugLog(`[PiSessionHost] session ready (cwd=${workspaceRoot})`);
  const getFile = (): string | undefined => {
    try {
      return (sessionManager as { getSessionFile?: () => string })?.getSessionFile?.();
    } catch {
      return undefined;
    }
  };

  return {
    getSessionFile: getFile,
    dispose: () => {
      try {
        (session as { dispose?: () => void }).dispose?.();
      } catch { /* best-effort */ }
    },
    promptTurn: createSessionPromptTurn(session, tier, budget, getFile, peer.turnOriginTracker),
  };
}
