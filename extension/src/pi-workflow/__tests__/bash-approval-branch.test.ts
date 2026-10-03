import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../debug-logger', () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(),
  redactSensitive: (s: string) => s,
}));

import { debugLog } from '../../debug-logger';
import { ToolApprovalGate } from '../../chat/engine/ToolApprovalGate';
import {
  DESTRUCTIVE_BASH_PATTERNS,
  normalizeBashCommand,
  matchedDestructiveBashCategory,
} from '../../chat/engine/bash-command-patterns';
import { evaluateBashDestructiveGuard, NO_BASH_COMMAND } from '../bash-approval-branch';

type Mode = 'autopilot' | 'supervised';

function makeDeps(mode: Mode = 'autopilot') {
  const approvalGate = new ToolApprovalGate();
  const onApprovalPending = vi.fn();
  return {
    approvalGate,
    onApprovalPending,
    getMode: () => mode,
  };
}

function req(toolUseId: string, command?: unknown) {
  return {
    toolName: 'bash',
    toolUseId,
    input: (command === undefined ? {} : { command }) as Record<string, unknown>,
  };
}

const DESTRUCTIVE_SAMPLES = [
  'docker volume rm backend_postgres_data',
  'docker volume prune -f',
  'docker compose -f docker-compose.yml down -v',
  'docker compose down --volumes',
  'docker system prune -af',
  'docker rm -f sa4e-postgres',
  'rm -rf backend/backups',
  'rm -fr ./build',
  'rm ./documents',
  'unlink /etc/hosts',
  'mkfs.ext4 /dev/sdb1',
  'dd if=/dev/zero of=/dev/sda',
  'shred -u secrets.txt',
  ':(){ :|:& };:',
  'git push --force origin main',
  'git reset --hard HEAD~1',
  'git clean -fd',
  'git checkout -f .',
  'git checkout .',
  'DROP TABLE users;',
  'TRUNCATE TABLE sessions',
  'DELETE FROM knowledge_entries',
  'diskpart',
];

const SAFE_SAMPLES = [
  'ls -la',
  'docker ps',
  'docker compose up -d',
  'docker compose config --format json',
  'docker run --rm nginx',
  'git status',
  'git diff --stat',
  'git log --oneline -5',
  'npm run build',
  'cat README.md',
  'grep -r "TODO" src/',
  'npx vitest run',
];

describe('normalizeBashCommand', () => {
  it('de-obfuscates backticks, backslashes, whitespace and case', () => {
    expect(normalizeBashCommand('Docker` Volume   RM vol').text).toBe('docker volume rm vol');
    expect(normalizeBashCommand('d\\ocker volume rm vol').text).toBe('docker volume rm vol');
    expect(normalizeBashCommand('\n\t docker   volume\n rm x \n').text).toBe('docker volume rm x');
  });

  it('never throws on null/undefined/non-string input', () => {
    expect(normalizeBashCommand(null).text).toBe('');
    expect(normalizeBashCommand(undefined).text).toBe('');
    expect(normalizeBashCommand(42).text).toBe('42');
  });
});

describe('DESTRUCTIVE_BASH_PATTERNS / matchedDestructiveBashCategory', () => {
  it.each(DESTRUCTIVE_SAMPLES)('flags destructive: %s', (command) => {
    const { text } = normalizeBashCommand(command);
    const category = matchedDestructiveBashCategory(text);
    expect(category, command).not.toBeNull();
    expect(category).toMatch(/^DESTRUCTIVE_BASH_/);
  });

  it.each(SAFE_SAMPLES)('allows non-destructive: %s', (command) => {
    const { text } = normalizeBashCommand(command);
    expect(matchedDestructiveBashCategory(text), command).toBeNull();
  });

  it('detects the SA4E-335 incident command after de-obfuscation', () => {
    const obfuscated = 'docker` compose -f docker-compose.yml down -v';
    const category = matchedDestructiveBashCategory(normalizeBashCommand(obfuscated).text);
    expect(category).not.toBeNull();
    expect(matchedDestructiveBashCategory(normalizeBashCommand('d\\ocker volume rm vol').text)).not.toBeNull();
  });

  it('matches the SA4E-335 incident command with the exact PS-parity pattern', () => {
    const incident = 'docker compose -f docker-compose.yml down -v';
    const psParity = /docker\s+compose\b.*\sdown\b.*\s(-v|--volumes)\b/i;
    expect(psParity.test(incident)).toBe(true);
    expect(DESTRUCTIVE_BASH_PATTERNS.some((p) => p.test(incident))).toBe(true);
  });

  it('returns null for empty input', () => {
    expect(matchedDestructiveBashCategory('')).toBeNull();
  });
});

describe('evaluateBashDestructiveGuard — SEC-06 closure (mode-independent PEND)', () => {
  beforeEach(() => vi.mocked(debugLog).mockClear());

  it.each(['autopilot', 'supervised'] as Mode[])(
    'pends destructive commands in %s mode (the incident command included)',
    async (mode) => {
      const deps = makeDeps(mode);
      const id = `tu-${mode}`;
      const pending = evaluateBashDestructiveGuard(
        req(id, 'docker volume rm backend_postgres_data'),
        deps
      );
      await new Promise((r) => setTimeout(r, 5));
      expect(deps.approvalGate.hasPending(id), 'must reach the real gate').toBe(true);
      deps.approvalGate.resolveApproval(id, 'reject');
      const result = await pending;
      expect(result?.approved).toBe(false);
      expect(deps.onApprovalPending).toHaveBeenCalledWith('bash', id);
    }
  );

  it('approves ONLY after an explicit human approval', async () => {
    const deps = makeDeps('autopilot');
    const id = 'tu-approve';
    const pending = evaluateBashDestructiveGuard(
      req(id, 'docker compose down -v'),
      deps
    );
    await new Promise((r) => setTimeout(r, 5));
    deps.approvalGate.resolveApproval(id, 'approve');
    expect((await pending)?.approved).toBe(true);
  });

  it('returns null (legacy path) for non-destructive commands', async () => {
    for (const command of SAFE_SAMPLES) {
      const result = await evaluateBashDestructiveGuard(
        req(`tu-safe-${Math.random().toString(36).slice(2)}`, command),
        makeDeps('autopilot')
      );
      expect(result, command).toBeNull();
    }
  });

  it('returns null when the input carries no inspectable command (SEC-08 → legacy path, never silent auto-approve of nothing)', async () => {
    for (const input of [{}, { command: null }, { command: 42 }, { cmd: 'rm -rf /' }]) {
      const deps = makeDeps('autopilot');
      const result = await evaluateBashDestructiveGuard(
        { toolName: 'bash', toolUseId: 'tu-malformed', input },
        deps
      );
      expect(result).toBeNull();
      expect(deps.onApprovalPending).not.toHaveBeenCalled();
    }
  });

  it('SEC-05: emits a structured tool_approval audit record with the matched category', async () => {
    const deps = makeDeps('autopilot');
    const pending = evaluateBashDestructiveGuard(
      req('tu-audit', 'docker volume prune -f'),
      deps
    );
    await new Promise((r) => setTimeout(r, 5));
    deps.approvalGate.resolveApproval('tu-audit', 'reject');
    await pending;
    const auditLine = vi
      .mocked(debugLog)
      .mock.calls.map((c) => String(c[0]))
      .find((line) => line.includes('tool_approval'));
    expect(auditLine).toBeDefined();
    expect(auditLine).toContain('tool=bash');
    expect(auditLine).toContain('decision=require-approval');
    expect(auditLine).toContain('mode=autopilot');
    expect(auditLine).toContain('matchedPattern=DESTRUCTIVE_BASH_');
    expect(auditLine).toContain('commandHash=');
    expect(auditLine).toContain('commandLength=');
  });

  it('SEC-05: audit uses NO_BASH_COMMAND when there is no command to inspect', async () => {
    const deps = makeDeps('autopilot');
    await evaluateBashDestructiveGuard(
      { toolName: 'bash', toolUseId: 'tu-nocmd', input: {} },
      deps
    );
    const auditLine = vi
      .mocked(debugLog)
      .mock.calls.map((c) => String(c[0]))
      .find((line) => line.includes('tool_approval'));
    expect(auditLine).toContain(`matchedPattern=${NO_BASH_COMMAND}`);
  });

  it('non-destructive commands emit no audit record (unchanged legacy behavior)', async () => {
    vi.mocked(debugLog).mockClear();
    await evaluateBashDestructiveGuard(req('tu-quiet', 'ls -la'), makeDeps('autopilot'));
    expect(
      vi.mocked(debugLog).mock.calls.some((c) => String(c[0]).includes('tool_approval'))
    ).toBe(false);
  });
});
