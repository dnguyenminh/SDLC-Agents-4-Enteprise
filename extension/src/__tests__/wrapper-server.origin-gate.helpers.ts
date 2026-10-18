/**
 * Shared suite fixture for the wrapper-level SA4E-358 Origin Gate ITs
 * (T1..T14, split across wrapper-server.origin-gate*.test.ts).
 * Real WrapperServer on a RANDOM port (G-7 — never hardcoded 9181) with a
 * capturing outputChannel for deny-log assertions.
 */
import { expect } from 'vitest';
import { WrapperServer } from '../services/WrapperServer';
import {
  createTestServer, ensureTmpDir, cleanTmpDir, MockDeps,
} from './wrapper-server.helpers';
import { createCapturingOutputChannel } from './wrapper-server.http.helpers';

export interface OriginGateSuite {
  server: WrapperServer;
  deps: MockDeps;
  port: number;
  logLines: string[];
  deniedLogs: () => string[];
  expectDeniedLog: (n: number, reason: string, from: number) => void;
  rpc: (id: number, method: string, params?: unknown) => string;
  teardown: () => Promise<void>;
}

/** Start a fresh origin-gate suite server; call `teardown()` in afterAll. */
export async function startOriginGateSuite(): Promise<OriginGateSuite> {
  ensureTmpDir();
  const channel = createCapturingOutputChannel();
  const logLines = channel.lines;
  const { server, deps } = createTestServer({ outputChannel: channel } as Partial<MockDeps>);
  await server.start(0);
  const port = server.listeningPort!;

  /** Deny log lines emitted so far — each deny appends exactly 1 line (FR-09). */
  const deniedLogs = () => logLines.filter((l) => l.startsWith('[WrapperServer] Denied request'));
  /** Assert the deny-log count grew by exactly `n` with the expected reason + format (§7.3). */
  function expectDeniedLog(n: number, reason: string, from: number): void {
    const fresh = deniedLogs().slice(from);
    expect(fresh).toHaveLength(n);
    for (const line of fresh) {
      expect(line).toContain(`reason=${reason}`);
      expect(line).toMatch(/^\[WrapperServer\] Denied request — reason=\S+ origin=.* host=.* \(\S+ \S+\)$/);
    }
  }

  const rpc = (id: number, method: string, params?: unknown) =>
    JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });

  const teardown = async () => {
    await server.stop();
    cleanTmpDir();
  };

  return { server, deps, port, logLines, deniedLogs, expectDeniedLog, rpc, teardown };
}
