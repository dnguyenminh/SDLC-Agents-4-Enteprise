import { describe, it, expect, vi, afterEach } from 'vitest';
import { mockPlatform } from './helpers/platform-mock';

// Mock the pi-coding-agent module so tool creation is deterministic + offline.
// Each factory returns a tool whose name encodes which factory produced it.
const createPowerShellTool = vi.fn((_cwd: string) => mkTool('powershell'));
const createBashTool = vi.fn((_cwd: string) => mkTool('bash'));
vi.mock('@earendil-works/pi-coding-agent', () => ({
  createReadTool: (_c: string) => mkTool('read'),
  createWriteTool: (_c: string) => mkTool('write'),
  createEditTool: (_c: string) => mkTool('edit'),
  createGrepTool: (_c: string) => mkTool('grep'),
  createFindTool: (_c: string) => mkTool('find'),
  createLsTool: (_c: string) => mkTool('ls'),
  createPowerShellTool: (c: string) => createPowerShellTool(c),
  createBashTool: (c: string) => createBashTool(c),
}));

function mkTool(name: string) {
  return { name, label: name, description: `${name} tool`, parameters: {}, execute: async () => ({ content: [], details: {} }) };
}

// Import AFTER vi.mock so the mocked module is used.
import {
  buildWorkspaceSystemPrompt,
  createWorkspaceTools,
  withBashDialectHint,
  BASH_DIALECT_NOTE,
} from '../pi-coding-tools.js';
import type { AgentTool } from '@earendil-works/pi-agent-core';

afterEach(() => {
  vi.clearAllMocks();
});

describe('buildWorkspaceSystemPrompt — OS-aware dialect (TC-007 / TC-801)', () => {
  it('win32: PowerShell dialect + normalized root', () => {
    const restore = mockPlatform('win32');
    try {
      const prompt = buildWorkspaceSystemPrompt('C:\\projects\\kiro\\SDLC-Agents-4-Enterprise');
      expect(prompt).toContain('Workspace root: C:/projects/kiro/SDLC-Agents-4-Enterprise');
      expect(prompt).toContain('The shell tool is Windows PowerShell (pwsh).');
      expect(prompt).toContain('Use PowerShell cmdlets (Get-ChildItem/Get-Content/Test-Path) or their aliases (ls/cat/dir all work).');
      expect(prompt).toContain('Windows paths work as-is (c:\\... or c:/...) — no translation needed.');
    } finally { restore(); }
  });

  it('non-win32: bash dialect preserved (regression)', () => {
    const restore = mockPlatform('linux');
    try {
      const prompt = buildWorkspaceSystemPrompt('/home/user/project');
      expect(prompt).toContain('The shell tool is Bash (POSIX).');
      expect(prompt).toContain('Use forward slashes: ls not dir /b.');
      expect(prompt).toContain('Paths: /c/... instead of c:\\...');
    } finally { restore(); }
  });
});

describe('createWorkspaceTools — OS-aware shell selection (TC-01 / TC-02 / TC-03 / TC-115)', () => {
  const ROOT = 'C:\\projects\\x';

  it('TC-01: win32 returns a tool named "powershell", not "bash"', async () => {
    const restore = mockPlatform('win32');
    try {
      const tools = await createWorkspaceTools(ROOT);
      const names = tools.map((t) => t.name);
      expect(names).toContain('powershell');
      expect(names).not.toContain('bash');
      expect(createPowerShellTool).toHaveBeenCalledWith(ROOT);
    } finally { restore(); }
  });

  it('TC-02: non-win32 returns a tool named "bash", not "powershell"', async () => {
    const restore = mockPlatform('linux');
    try {
      const tools = await createWorkspaceTools('/home/user/project');
      const names = tools.map((t) => t.name);
      expect(names).toContain('bash');
      expect(names).not.toContain('powershell');
      expect(createBashTool).toHaveBeenCalled();
    } finally { restore(); }
  });

  it('TC-115 / TC-03: PowerShell factory throws on win32 → falls back to bash (gate degraded, logged)', async () => {
    const restore = mockPlatform('win32');
    createPowerShellTool.mockImplementationOnce(() => { throw new Error('pwsh.exe not found'); });
    try {
      const tools = await createWorkspaceTools(ROOT);
      const names = tools.map((t) => t.name);
      // Fallback: shell tool is now bash, no crash.
      expect(names).toContain('bash');
      expect(names).not.toContain('powershell');
    } finally { restore(); }
  });

  it('empty workspaceRoot returns []', async () => {
    expect(await createWorkspaceTools('')).toEqual([]);
  });
});

describe('withBashDialectHint (non-win32)', () => {
  const fakeBashTool = (description: string): AgentTool =>
    ({ name: 'bash', label: 'Bash', description, parameters: {}, execute: async () => ({ content: [], details: {} }) }) as unknown as AgentTool;

  it('prepends the note while preserving the original description', () => {
    const wrapped = withBashDialectHint(fakeBashTool('Execute a bash command in cwd.'));
    expect(wrapped.description).toContain('Shell is Bash (POSIX)');
    expect(wrapped.description).toContain('Execute a bash command in cwd.');
    expect(wrapped.description.startsWith(BASH_DIALECT_NOTE)).toBe(true);
  });

  it('is idempotent (no double prefix)', () => {
    const once = withBashDialectHint(fakeBashTool('Execute a bash command.'));
    const twice = withBashDialectHint(once);
    expect(twice.description).toBe(once.description);
  });

  it('passes through tools without a description untouched', () => {
    const noDesc = { name: 'x', label: 'X', execute: async () => ({ content: [], details: {} }) } as unknown as AgentTool;
    expect(withBashDialectHint(noDesc)).toBe(noDesc);
  });
});
