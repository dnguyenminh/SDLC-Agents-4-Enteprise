/**
 * SA4E-6 — Docker command execution (extracted from DockerExecutor).
 * Runs commands inside a container exec with output demuxing, byte-capped
 * buffers and timeout-kill handling (OOM exit codes rejected).
 */

import Docker from 'dockerode';
import type { Logger } from 'pino';
import type { SandboxConfig } from '../../../config/SandboxConfig.js';
import type { ExecOptions } from './IExecutor.js';
import { OutputBuffer } from '../parsers/OutputBuffer.js';
import { buildExecutionResult } from './result.js';
import type { Session, ExecutionResult } from '../models.js';
import { OomKilledError, SessionNotFoundError } from '../errors.js';

/** Executes commands inside running docker sessions. */
export class DockerCommandRunner {
  constructor(
    private readonly docker: Docker,
    private readonly config: SandboxConfig,
    private readonly logger: Logger,
  ) {}

  async execute(session: Session, command: string, options: ExecOptions): Promise<ExecutionResult> {
    if (!session.containerId) {
      throw new SessionNotFoundError(`Session ${session.sessionId} has no container`);
    }
    const container = this.docker.getContainer(session.containerId);
    const timeoutMs = this.resolveTimeoutMs(options);
    const maxBytes = this.config.maxOutputBytes;
    const stdoutBuf = new OutputBuffer(maxBytes);
    const stderrBuf = new OutputBuffer(maxBytes);

    const exec = await container.exec({
      Cmd: ['bash', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      Env: Object.entries({ ...session.env, ...(options.env || {}) }).map(([k, v]) => `${k}=${v}`),
      WorkingDir: options.workdir || session.workdir || '/workspace',
    } as Docker.ExecCreateOptions);

    const stream = (await exec.start({ hijack: true, stdin: false })) as NodeJS.ReadableStream;
    await this.demux(stream, stdoutBuf, stderrBuf);

    const start = Date.now();
    let timedOut = false;
    const result = await new Promise<ExecutionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        timedOut = true;
        container.kill().catch(() => {});
      }, timeoutMs);

      const finish = async (exitCode: number) => {
        clearTimeout(timer);
        const duration = Date.now() - start;
        this.logger.info({
          sessionId: session.sessionId,
          exitCode,
          stdout: stdoutBuf.toString(),
          stderr: stderrBuf.toString()
        }, 'Command execution detailed result');
        if (exitCode === 137 || exitCode === -190 || exitCode === 139) {
          reject(new OomKilledError());
          return;
        }
        resolve(buildExecutionResult(exitCode, stdoutBuf, stderrBuf, session.sessionId, duration, timedOut));
      };

      (stream as NodeJS.ReadableStream).on('end', async () => {
        try {
          const insp = await exec.inspect();
          this.logger.debug({ sessionId: session.sessionId, exitCode: insp.ExitCode, stdout: stdoutBuf.toString(), stderr: stderrBuf.toString() }, 'Command execution finished');
          await finish(insp.ExitCode ?? -1);
        } catch (e) {
          clearTimeout(timer);
          reject(e);
        }
      });
      (stream as NodeJS.ReadableStream).on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
    return result;
  }

  /** Clamp timeout into [1s, commandTimeoutMax]. */
  private resolveTimeoutMs(options: ExecOptions): number {
    const timeoutSec = Math.min(
      Math.max(options.timeout || this.config.commandTimeoutDefault, 1),
      this.config.commandTimeoutMax,
    );
    return timeoutSec * 1000;
  }

  /** Split the docker multiplexed stream into stdout/stderr buffers. */
  private async demux(
    stream: NodeJS.ReadableStream, stdoutBuf: OutputBuffer, stderrBuf: OutputBuffer,
  ): Promise<void> {
    const { Writable } = await import('stream');
    const out = new Writable({
      write: (chunk: Buffer, _enc, cb) => {
        stdoutBuf.append(chunk.toString('utf-8'));
        cb();
      },
    });
    const err = new Writable({
      write: (chunk: Buffer, _enc, cb) => {
        stderrBuf.append(chunk.toString('utf-8'));
        cb();
      },
    });
    this.docker.modem.demuxStream(stream, out, err);
  }
}
