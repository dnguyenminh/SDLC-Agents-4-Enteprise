/**
 * SA4E-335 follow-up — bash destructive-CONTENT guard (closes SA4E-336 SEC-06).
 * Narrow fix: only destructive content is promoted to a mode-independent PEND.
 * PowerShell allowlist/destructive/bypass/fail-secure suites live in
 * pi-workflow-gate.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { createToolApprovalGateHandler } from '../pi-workflow-gate.js';
import { evaluateBashDestructiveGuard } from '../bash-approval-branch.js';
import { CommandPatternMatcher } from '../../chat/engine/CommandPatternMatcher';
import { ToolApprovalGate } from '../../chat/engine/ToolApprovalGate';

type Mode = 'autopilot' | 'supervised';

function makeGateDeps(mode: Mode, rememberedPattern?: string) {
  const gate = new ToolApprovalGate();
  const matcher = new CommandPatternMatcher();
  if (rememberedPattern) matcher.addPattern(rememberedPattern);
  const onApprovalPending = vi.fn();
  const handler = createToolApprovalGateHandler(gate, matcher, { getMode: () => mode, onApprovalPending });
  return { gate, matcher, gateSpy: vi.spyOn(gate, 'requestApproval'), onApprovalPending, handler };
}

/** Drive a request that is expected to PEND; resolve 'reject' and return result. */
async function expectPend(handler: ReturnType<typeof makeGateDeps>['handler'], gate: ToolApprovalGate, command: unknown, toolName = 'powershell') {
  const id = `tu-${Math.random().toString(36).slice(2)}`;
  const input = command === undefined ? {} : { command } as Record<string, unknown>;
  const pending = handler.requestApproval({ toolUseId: id, toolName, input });
  await new Promise((r) => setTimeout(r, 5));
  gate.resolveApproval(id, 'reject');
  return pending;
}

describe('bash — destructive command content pends (SEC-06 closure)', () => {
  const DESTRUCTIVE = [
    'docker volume rm backend_postgres_data',
    'docker compose -f docker-compose.yml down -v',
    'docker compose down --volumes',
    'docker system prune -af',
    'rm -rf backend/backups',
    'git reset --hard HEAD~1',
    'DROP TABLE users;',
  ];

  it.each(DESTRUCTIVE)(
    'TC-606: %s pends in BOTH modes and reaches the real gate',
    async (command) => {
      for (const mode of ['autopilot', 'supervised'] as Mode[]) {
        const { gate, handler } = makeGateDeps(mode);
        const res = await expectPend(handler, gate, command, 'bash');
        expect((await res).approved, `[${mode}] ${command}`).toBe(false);
      }
    }
  );

  it('TC-606: the content gate WINS over a remembered auto-approve pattern (the incident sequence)', async () => {
    // Reproduces the loss: a user-approved "Allow all" pattern made the
    // gate return {approved:true} BEFORE any content check ran.
    const { gate, matcher, handler } = makeGateDeps('autopilot', 'bash*');
    expect(matcher.matches('bash'), 'sanity: the pattern branch would have fired').toBe('bash*');
    const res = await expectPend(handler, gate, 'docker compose down -v', 'bash');
    expect((await res).approved).toBe(false);
  });

  it('remembered pattern still auto-approves NON-destructive bash (unchanged behavior)', async () => {
    const { gateSpy, matcher, handler } = makeGateDeps('autopilot', 'bash*');
    expect(matcher.matches('bash')).toBe('bash*');
    const res = await handler.requestApproval({ toolUseId: 'tu-bash-rec', toolName: 'bash', input: { command: 'npm run build' } });
    expect(res.approved).toBe(true);
    expect(gateSpy).not.toHaveBeenCalled();
  });

  it('TC-701: harmless docker commands still auto-approve under Autopilot (no over-pend regression)', async () => {
    const { gateSpy, handler } = makeGateDeps('autopilot');
    for (const command of ['docker run --rm nginx', 'docker ps', 'docker compose up -d']) {
      const res = await handler.requestApproval({
        toolUseId: `tu-safe-${command.length}`,
        toolName: 'bash',
        input: { command },
      });
      expect(res.approved, command).toBe(true);
      expect(gateSpy, command).not.toHaveBeenCalled();
    }
  });

  it('TC-701: the same harmless commands are NOT classified destructive by the content guard', async () => {
    for (const command of ['docker run --rm nginx', 'docker ps', 'docker compose up -d', 'ls -la']) {
      const guard = await evaluateBashDestructiveGuard(
        { toolName: 'bash', toolUseId: 'tu-guard-safe', input: { command } },
        { approvalGate: new ToolApprovalGate(), getMode: () => 'supervised' }
      );
      expect(guard, command).toBeNull();
    }
  });

  it('TC-15 / TC-16 remain intact: bash still pends in Supervised and auto-approves in Autopilot for `ls`', async () => {
    const supervised = makeGateDeps('supervised');
    expect((await expectPend(supervised.handler, supervised.gate, 'ls', 'bash')).approved).toBe(false);

    const autopilot = makeGateDeps('autopilot');
    const res = await autopilot.handler.requestApproval({ toolUseId: 'tu-ls-ap', toolName: 'bash', input: { command: 'ls' } });
    expect(res.approved).toBe(true);
    expect(autopilot.gateSpy).not.toHaveBeenCalled();
  });

  it('an explicit human APPROVE is the only way destructive bash runs under Autopilot', async () => {
    const { gate, handler } = makeGateDeps('autopilot');
    const id = 'tu-human-approve';
    const pending = handler.requestApproval({ toolUseId: id, toolName: 'bash', input: { command: 'docker volume rm backend_postgres_data' } });
    await new Promise((r) => setTimeout(r, 5));
    expect(gate.hasPending(id)).toBe(true);
    gate.resolveApproval(id, 'approve');
    expect((await pending).approved).toBe(true);
  });
});
