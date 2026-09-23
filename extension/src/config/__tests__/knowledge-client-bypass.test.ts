/**
 * SA4E-320 Finding #1 — KnowledgeClient / resolveKbBaseUrl must forward the
 * kiroSdlc.backend.allowInsecureRemote opt-in bypass flag into URL validation.
 *
 * Before the fix, KnowledgeClient's constructor called validateBackendUrl(baseUrl)
 * WITHOUT { allowInsecureRemote }, so remote HTTP was rejected even with the
 * bypass ON (fail-closed hard-fail at activation — inconsistent with getBackendUrl()).
 *
 * Contract proven here:
 *  - bypass ON  + remote HTTP → resolution succeeds (getBackendUrl / constructor)
 *  - bypass OFF + remote HTTP → still rejects ([Security] throw) — enforcement unchanged
 *  - flag OFF / missing       → enforcement unchanged (fail-closed)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {} as Record<string, unknown>,
}));

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [],
    getConfiguration: () => ({
      get: <T>(key: string, defaultValue?: T): T =>
        key in mockConfig ? (mockConfig[key] as T) : defaultValue,
      update: () => Promise.resolve(),
    }),
  },
  window: {},
  commands: {},
}));

import { KnowledgeClient, resolveKbBaseUrl } from '../../knowledge-client';
import { getAllowInsecureRemote, getBackendUrl } from '../backend-url';

const REMOTE_HTTP = 'http://remote.server.internal:48721';

describe('KnowledgeClient bypass flow (SA4E-320 Finding #1)', () => {
  beforeEach(() => {
    mockConfig['backend.url'] = REMOTE_HTTP;
    mockConfig['backend.allowInsecureRemote'] = false;
    // Ensure env override does not mask config-driven resolution.
    delete process.env.CODE_INTEL_PORT;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CODE_INTEL_PORT;
  });

  it('bypass ON + remote HTTP → getAllowInsecureRemote reads true from config', () => {
    mockConfig['backend.allowInsecureRemote'] = true;
    expect(getAllowInsecureRemote()).toBe(true);
  });

  it('bypass OFF / missing → getAllowInsecureRemote returns false (fail-closed)', () => {
    expect(getAllowInsecureRemote()).toBe(false);
    delete mockConfig['backend.allowInsecureRemote'];
    expect(getAllowInsecureRemote()).toBe(false);
    // Non-boolean truthy values must NOT enable the bypass (strict === true).
    mockConfig['backend.allowInsecureRemote'] = 'true';
    expect(getAllowInsecureRemote()).toBe(false);
  });

  it('bypass ON + remote HTTP → getBackendUrl accepts remote URL', () => {
    mockConfig['backend.allowInsecureRemote'] = true;
    expect(getBackendUrl()).toBe(REMOTE_HTTP);
  });

  it('bypass OFF + remote HTTP → getBackendUrl still rejects (enforcement unchanged)', () => {
    mockConfig['backend.allowInsecureRemote'] = false;
    expect(() => getBackendUrl()).toThrow(/Insecure backend URL rejected/);
  });

  it('bypass ON + remote HTTP → resolveKbBaseUrl succeeds with remote URL', () => {
    mockConfig['backend.allowInsecureRemote'] = true;
    expect(resolveKbBaseUrl()).toBe(REMOTE_HTTP);
  });

  it('bypass OFF + remote HTTP → resolveKbBaseUrl falls back to loopback default (fail-closed)', () => {
    mockConfig['backend.allowInsecureRemote'] = false;
    expect(resolveKbBaseUrl()).toBe('http://127.0.0.1:48721');
  });

  it('bypass ON + remote HTTP → new KnowledgeClient does NOT throw (Finding #1 regression)', () => {
    mockConfig['backend.allowInsecureRemote'] = true;
    expect(() => new KnowledgeClient(REMOTE_HTTP)).not.toThrow();
    const client = new KnowledgeClient(REMOTE_HTTP);
    expect(client).toBeInstanceOf(KnowledgeClient);
    // console.warn security warning still emitted on the accepted remote HTTP URL.
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/\[Security\] WARNING: Insecure remote backend URL allowed/)
    );
  });

  it('bypass OFF + remote HTTP → new KnowledgeClient still throws [Security]', () => {
    mockConfig['backend.allowInsecureRemote'] = false;
    expect(() => new KnowledgeClient(REMOTE_HTTP)).toThrow(
      /\[Security\] Insecure backend URL rejected/
    );
  });

  it('bypass missing (flag OFF default) + remote HTTP → still rejects (default behavior unchanged)', () => {
    delete mockConfig['backend.allowInsecureRemote'];
    expect(() => new KnowledgeClient(REMOTE_HTTP)).toThrow(
      /\[Security\] Insecure backend URL rejected/
    );
  });

  it('bypass ON does not relax protocol allowlist (ftp still rejected by KnowledgeClient)', () => {
    mockConfig['backend.allowInsecureRemote'] = true;
    expect(() => new KnowledgeClient('ftp://remote.server.internal:21')).toThrow(
      /\[Security\] Invalid backend URL protocol/
    );
  });

  it('loopback HTTP unaffected regardless of flag', () => {
    mockConfig['backend.allowInsecureRemote'] = false;
    expect(() => new KnowledgeClient('http://127.0.0.1:48721')).not.toThrow();
    mockConfig['backend.allowInsecureRemote'] = true;
    expect(() => new KnowledgeClient('http://localhost:9999')).not.toThrow();
  });
});
