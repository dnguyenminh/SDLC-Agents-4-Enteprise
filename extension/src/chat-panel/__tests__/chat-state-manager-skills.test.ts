import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mock the 'vscode' module (aliased to the test mock in vitest.config) so we can
// construct ChatStateManager outside the extension host. We keep the existing mock
// exports (window, workspace, etc.) and add the RelativePattern + file watcher API
// that ChatStateManager's constructor relies on.
vi.mock('vscode', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, any>;
  class RelativePattern {
    constructor(public base: string, public pattern: string) {}
  }
  const fakeWatcher = {
    onDidCreate: () => ({ dispose: () => {} }),
    onDidChange: () => ({ dispose: () => {} }),
    onDidDelete: () => ({ dispose: () => {} }),
    dispose: () => {},
  };
  return {
    ...actual,
    RelativePattern,
    workspace: {
      ...(actual.workspace ?? {}),
      createFileSystemWatcher: () => fakeWatcher,
    },
  };
});

import { ChatStateManager } from '../ChatStateManager';

describe('ChatStateManager.sendSkillsInfo (SA4E-188)', () => {
  let tmpRoot: string;
  let sent: Array<{ type: string; skills?: Array<{ id: string; label: string; description: string }> }>;
  let sendToWebview: (msg: any) => void;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e188-skills-'));
    sent = [];
    sendToWebview = (msg: any) => sent.push(msg);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function createManager(): ChatStateManager {
    const getEngine = () => ({}) as any;
    return new ChatStateManager(tmpRoot, undefined, sendToWebview, getEngine);
  }

  it('broadcasts chat:skillsLoaded with parsed skill descriptions from .code-intel/skills', () => {
    const skillsDir = path.join(tmpRoot, '.code-intel', 'skills');
    fs.mkdirSync(path.join(skillsDir, 'browser-harness'), { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, 'browser-harness', 'SKILL.md'),
      '---\ndescription: "Browser automation CLI for AI agents"\n---\nbody'
    );
    fs.mkdirSync(path.join(skillsDir, 'drawio'), { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, 'drawio', 'SKILL.md'),
      '---\ndescription: "Draw.io diagram tool"\n---'
    );

    createManager();

    const msg = sent.find((m) => m.type === 'chat:skillsLoaded');
    expect(msg).toBeDefined();
    expect(msg!.skills).toHaveLength(2);

    const bh = msg!.skills!.find((s) => s.id === 'browser-harness');
    expect(bh).toBeDefined();
    expect(bh!.label).toBe('browser-harness');
    expect(bh!.description).toBe('Browser automation CLI for AI agents');

    const dr = msg!.skills!.find((s) => s.id === 'drawio');
    expect(dr).toBeDefined();
    expect(dr!.description).toBe('Draw.io diagram tool');
  });

  it('does not broadcast chat:skillsLoaded when no skills directory exists', () => {
    createManager();
    expect(sent.find((m) => m.type === 'chat:skillsLoaded')).toBeUndefined();
  });

  it('includes skills with empty description when SKILL.md has no frontmatter', () => {
    const skillsDir = path.join(tmpRoot, '.code-intel', 'skills');
    fs.mkdirSync(path.join(skillsDir, 'plain-skill'), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'plain-skill', 'SKILL.md'), 'no frontmatter here');

    createManager();

    const msg = sent.find((m) => m.type === 'chat:skillsLoaded');
    expect(msg).toBeDefined();
    const plain = msg!.skills!.find((s) => s.id === 'plain-skill');
    expect(plain).toBeDefined();
    expect(plain!.description).toBe('');
  });
});
