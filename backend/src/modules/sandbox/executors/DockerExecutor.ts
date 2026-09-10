/**
 * SA4E-6 — DockerExecutor: containerized execution via dockerode (Strategy Pattern).
 * Applies BR-12 hardening (cap drop, no-new-privileges, read-only rootfs + tmpfs,
 * network isolation) — reuses SecurityModule when available, else built-in defaults.
 * Tests touching Docker are guarded (dockerode never connects unless a container op runs).
 */

import Docker from 'dockerode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Logger } from 'pino';
import type { SandboxConfig } from '../../../config/SandboxConfig.js';
import type { SandboxHardening } from './hardening.js';
import type { IExecutor, SessionCreateConfig, ExecOptions } from './IExecutor.js';
import { OutputBuffer } from '../parsers/OutputBuffer.js';
import { buildHostConfig } from './dockerHostConfig.js';
import { prepareSafeMount } from './mountSecurity.js';
import { generateSessionId, type Session, type ExecutionResult } from '../models.js';
import { buildExecutionResult } from './result.js';
import {
  ImagePullError,
  MountError,
  OomKilledError,
  SessionNotFoundError,
} from '../errors.js';

export class DockerExecutor implements IExecutor {
  readonly mode = 'docker' as const;
  private docker: Docker;
  private logger: Logger;
  private config: SandboxConfig;
  private hardening: SandboxHardening;
  private stagingDir: string;

  constructor(
    logger: Logger,
    config: SandboxConfig,
    hardening: SandboxHardening,
    socket?: string,
  ) {
    this.logger = logger.child({ executor: 'docker' });
    this.config = config;
    this.hardening = hardening;
    this.docker = socket ? new Docker({ socketPath: socket }) : new Docker();
    this.stagingDir = path.join(os.tmpdir(), 'sa4e-sandbox-staging');
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'Docker unavailable');
      return false;
    }
  }

  /** Remove containers left behind by prior backend crashes (UC-11, FSD §3.6.3). */
  async recoverOrphans(): Promise<number> {
    if (!(await this.isAvailable())) return 0;
    try {
      const containers = await this.docker.listContainers({
        filters: { label: ['sa4e-sandbox=true'] },
      });
      let recovered = 0;
      for (const c of containers) {
        const container = this.docker.getContainer(c.Id);
        try {
          await container.remove({ force: true });
          recovered++;
          this.logger.info({ containerId: c.Id }, 'Orphan container recovered');
        } catch (err) {
          this.logger.warn({ err: (err as Error).message, containerId: c.Id }, 'Failed to remove orphan');
        }
      }
      return recovered;
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'Orphan recovery failed');
      return 0;
    }
  }

  private async ensureImage(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect();
      return;
    } catch {
      /* not present locally — pull */
    }
    await this.pullImage(image);
  }

  private pullImage(image: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(new ImagePullError(`Cannot pull image ${image}: ${err.message}`));
        if (!stream) return reject(new ImagePullError(`Cannot pull image ${image}`));
        stream.on('data', () => {});
        stream.on('end', () => resolve());
        stream.on('error', (e: Error) => reject(new ImagePullError(`Cannot pull image ${image}: ${e.message}`)));
      });
    });
  }

  async createSession(config: SessionCreateConfig): Promise<Session> {
    const sessionId = generateSessionId();
    const image = config.baseImage || this.config.defaultImage;
    await this.ensureImage(image);

    const binds: string[] = [];
    for (const m of config.mounts) {
      if (!fs.existsSync(m.source)) {
        throw new MountError(`Mount source does not exist: ${m.source}`);
      }
      const patterns = m.excludePatterns && m.excludePatterns.length ? m.excludePatterns : this.config.mountExcludePatterns;
      const safeSource =
        patterns && patterns.length
          ? prepareSafeMount(m.source, patterns, path.join(this.stagingDir, sessionId, path.basename(m.source)))
          : m.source;
      binds.push(`${safeSource}:${m.target}:${m.readOnly ? 'ro' : 'rw'}`);
    }

    const hostConfig = buildHostConfig({
      resources: config.resources,
      networkEnabled: config.networkEnabled,
      binds,
      hardening: this.hardening,
    });

    // AGGRESSIVE WORKAROUND for Docker Desktop Windows Network Isolation (TC-18)
    // 'none' is often ignored; we create an internal network and force detachment from bridge.
    if (!config.networkEnabled) {
      try {
        const netName = 'sa4e-internal-net';
        const networks = await this.docker.listNetworks();
        const exists = networks.some(n => n.Name === netName);
        if (!exists) {
          await this.docker.createNetwork({
            Name: netName,
            Internal: true,
            Driver: 'bridge',
          });
        }
        hostConfig.NetworkMode = netName;
      } catch (err) {
        this.logger.error({ err: (err as Error).message }, 'Failed to setup internal network for isolation');
        // Fallback to 'none' if internal net creation fails
        hostConfig.NetworkMode = 'none';
      }
    }

      const container = await this.docker.createContainer({
        Image: image,
        Cmd: ['tail', '-f', '/dev/null'],
        WorkingDir: config.workdir || '/workspace',
        User: 'root',
        Labels: { 'sa4e-sandbox': 'true', 'sa4e-session': sessionId },
        HostConfig: hostConfig,
        Tty: false,
        OpenStdin: false,
        AttachStdout: false,
        AttachStderr: false,
      } as Docker.ContainerCreateOptions);

    await container.start();
    const now = new Date();
    this.logger.info({ sessionId, image, mode: 'docker' }, 'Docker sandbox session created');
    return {
      sessionId,
      mode: 'docker',
      status: 'running',
      containerId: container.id,
      baseImage: image,
      mounts: config.mounts,
      resources: config.resources,
      networkEnabled: config.networkEnabled,
      createdAt: now,
      lastActivity: now,
      ttl: config.ttl,
      env: config.env,
      workdir: config.workdir,
    };
  }

  async destroySession(session: Session): Promise<void> {
    if (!session.containerId) return;
    const container = this.docker.getContainer(session.containerId);
    try {
      await container.stop({ t: 1 });
    } catch {
      /* already stopped */
    }
    try {
      await container.remove({ force: true });
    } catch {
      /* ignore */
    }
    this.logger.info({ sessionId: session.sessionId }, 'Docker sandbox session destroyed');
  }

  async execute(session: Session, command: string, options: ExecOptions): Promise<ExecutionResult> {
    if (!session.containerId) {
      throw new SessionNotFoundError(`Session ${session.sessionId} has no container`);
    }
    const container = this.docker.getContainer(session.containerId);
    const timeoutSec = Math.min(
      Math.max(options.timeout || this.config.commandTimeoutDefault, 1),
      this.config.commandTimeoutMax,
    );
    const timeoutMs = timeoutSec * 1000;
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
}
