import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createToolApprovalGateHandler } from '../pi-workflow-gate.js';
import { CommandPatternMatcher } from '../../chat/engine/CommandPatternMatcher';
import { ToolApprovalGate } from '../../chat/engine/ToolApprovalGate';

type Mode = 'autopilot' | 'supervised';

function makeDeps(getMode?: () => Mode) {
  const gate = new ToolApprovalGate();
  const gateSpy = vi.spyOn(gate, 'requestApproval');
  const matcher = new CommandPatternMatcher();
  const onApprovalPending = vi.fn();
  const handler = createToolApprovalGateHandler(gate, matcher, { getMode, onApprovalPending });
  return { gate, gateSpy, onApprovalPending, handler };
}

/** Drive a request that is expected to PEND; resolve 'reject' and return result. */
async function expectPend(handler: ReturnType<typeof makeDeps>['handler'], gate: ToolApprovalGate, command: unknown, toolName = 'powershell') {
  const id = `tu-${Math.random().toString(36).slice(2)}`;
  const input = command === undefined ? {} : { command } as Record<string, unknown>;
  const pending = handler.requestApproval({ toolUseId: id, toolName, input });
  await new Promise((r) => setTimeout(r, 5));
  gate.resolveApproval(id, 'reject');
  return pending;
}

// --- Test data loaders (STC v1.2 testdata CSVs) ---
const TESTDATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../documents/SA4E-336/testdata');
function loadCsv(file: string): Record<string, string>[] {
  const raw = fs.readFileSync(path.join(TESTDATA_DIR, file), 'utf8').trim();
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}
/** Minimal CSV splitter honoring double-quoted cells. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

// ============================================================================
// Existing behavior (pre-upgrade) — read-only + mode awareness (bash unchanged)
// ============================================================================
describe('read-only auto-approve (unchanged)', () => {
  it.each(['read', 'grep', 'find', 'ls', 'get_workspace_info'])(
    'auto-approves %s without touching the gate', async (tool) => {
      const { gateSpy, handler } = makeDeps(() => 'supervised');
      const res = await handler.requestApproval({ toolUseId: `tu-${tool}`, toolName: tool, input: {} });
      expect(res.approved).toBe(true);
      expect(gateSpy).not.toHaveBeenCalled();
    });
});

describe('bash regression (BRD §1.2 — UNCHANGED)', () => {
  it('TC-15: bash pends under Supervised (default)', async () => {
    const { gate, handler } = makeDeps(() => 'supervised');
    const res = await expectPend(handler, gate, 'ls', 'bash');
    expect((await res).approved).toBe(false);
  });

  it('TC-16: bash auto-approves under Autopilot (non-destructive classification)', async () => {
    const { gateSpy, handler } = makeDeps(() => 'autopilot');
    const res = await handler.requestApproval({ toolUseId: 'tu-bash-ap', toolName: 'bash', input: { command: 'ls' } });
    expect(res.approved).toBe(true);
    expect(res.reason).toContain('Autopilot');
    expect(gateSpy).not.toHaveBeenCalled();
  });

  it('destructive name-based tools still block even under Autopilot (delete_file/git_push)', async () => {
    const { gate, handler } = makeDeps(() => 'autopilot');
    for (const toolName of ['delete_file', 'git_push']) {
      const res = await expectPend(handler, gate, undefined, toolName);
      expect((await res).approved).toBe(false);
    }
  });
});

// ============================================================================
// SA4E-336 — PowerShell allowlist-of-safe branch
// ============================================================================
describe('powershell — safe allowlist auto-approve (TC-04)', () => {
  it.each(['autopilot', 'supervised'] as Mode[])(
    'Get-ChildItem auto-approves in %s mode without touching the gate', async (mode) => {
      const { gateSpy, handler } = makeDeps(() => mode);
      const res = await handler.requestApproval({ toolUseId: 'tu-ps-ro', toolName: 'powershell', input: { command: 'Get-ChildItem .' } });
      expect(res.approved).toBe(true);
      expect(res.reason).toContain('Read-only PowerShell');
      expect(gateSpy).not.toHaveBeenCalled();
    });

  it('TC-315: full safe-allowlist auto-approves; smuggle/non-allowlist pends', async () => {
    for (const row of loadCsv('allowlist-safe-testdata.csv')) {
      const { gate, gateSpy, handler } = makeDeps(() => 'supervised');
      if (row.expected_decision === 'auto-approve') {
        const res = await handler.requestApproval({ toolUseId: 'tu-ok', toolName: 'powershell', input: { command: row.command } });
        expect(res.approved, `safe: ${row.command}`).toBe(true);
        expect(gateSpy).not.toHaveBeenCalled();
      } else {
        const res = await expectPend(handler, gate, row.command);
        expect((await res).approved, `negative: ${row.command}`).toBe(false);
      }
    }
  });
});

describe('powershell — destructive always pends (TC-05 / TC-108)', () => {
  it.each(['autopilot', 'supervised'] as Mode[])(
    'Remove-Item pends in %s mode (BR-11, mode-independent)', async (mode) => {
      const { gate, handler } = makeDeps(() => mode);
      const res = await expectPend(handler, gate, 'Remove-Item -Recurse C:\\temp');
      expect((await res).approved).toBe(false);
    });

  it('TC-110: destructive-category coverage matrix — every sample pends (both modes)', async () => {
    const rows = loadCsv('destructive-catalog-testdata.csv');
    expect(rows.length).toBeGreaterThan(40);
    for (const row of rows) {
      for (const mode of ['autopilot', 'supervised'] as Mode[]) {
        const { gate, handler } = makeDeps(() => mode);
        const res = await expectPend(handler, gate, row.command);
        expect((await res).approved, `[${row.category}] ${row.command} (${mode})`).toBe(false);
      }
    }
  });
});

describe('powershell — bypass resistance (TC-111) + over-pend (TC-410)', () => {
  it('every obfuscation/eval vector pends; harmless-but-unlisted over-pends', async () => {
    const rows = loadCsv('bypass-vectors-testdata.csv');
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) {
      const { gate, handler } = makeDeps(() => 'autopilot');
      const res = await expectPend(handler, gate, row.command);
      expect((await res).approved, `${row.vector}: ${row.command}`).toBe(false);
    }
  });
});

describe('powershell — fail-secure boundaries', () => {
  it('TC-404: empty / null command pends (flipped — deny-by-default)', async () => {
    for (const command of ['', null]) {
      for (const mode of ['autopilot', 'supervised'] as Mode[]) {
        const { gate, handler } = makeDeps(() => mode);
        const res = await expectPend(handler, gate, command);
        expect((await res).approved, `empty(${String(command)}, ${mode})`).toBe(false);
      }
    }
  });

  it('TC-113 / SEC-08: malformed / renamed / wrong-typed input pends', async () => {
    for (const row of loadCsv('malformed-input-testdata.csv')) {
      const { gate, handler } = makeDeps(() => 'supervised');
      let input: Record<string, unknown> = {};
      try { input = row.input_shape === 'null' ? ({} as Record<string, unknown>) : JSON.parse(row.input_shape); }
      catch { input = {}; }
      const id = `tu-mal-${Math.random().toString(36).slice(2)}`;
      const pending = handler.requestApproval({ toolUseId: id, toolName: 'powershell', input });
      await new Promise((r) => setTimeout(r, 5));
      gate.resolveApproval(id, 'reject');
      const res = await pending;
      expect(res.approved, `malformed: ${row.input_shape}`).toBe(false);
    }
  });

  it('TC-112 / SEC-04 invariant: Remove-Item NEVER returns {approved:true} via any path', async () => {
    const commands = ['Remove-Item -Recurse .', 'Get-Content a.txt; Remove-Item -Recurse .', 'REMOVE-ITEM -recurse'];
    for (const command of commands) {
      for (const mode of ['autopilot', 'supervised'] as Mode[]) {
        const { gate, handler } = makeDeps(() => mode);
        // Resolve 'approve' at the gate: a destructive command still PENDS first,
        // so the only way it is approved is explicit human approval — never a
        // read-only auto-approve. Assert it ALWAYS went through the gate.
        const id = `tu-inv-${Math.random().toString(36).slice(2)}`;
        const pending = handler.requestApproval({ toolUseId: id, toolName: 'powershell', input: { command } });
        await new Promise((r) => setTimeout(r, 5));
        expect(gate.hasPending(id), `${command} must reach the gate (${mode})`).toBe(true);
        gate.resolveApproval(id, 'reject');
        const res = await pending;
        expect(res.approved).toBe(false);
      }
    }
  });

  it('TC-114 / SEC-09: unwired getMode defaults to Supervised (non-read-only pends)', async () => {
    const gate = new ToolApprovalGate();
    const handler = createToolApprovalGateHandler(gate, new CommandPatternMatcher());
    const res = await expectPend(handler, gate, undefined, 'write');
    expect((await res).approved).toBe(false);
  });
});
