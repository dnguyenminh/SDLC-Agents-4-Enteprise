/**
 * SA4E-6 — DockerExecutor (facade): containerized execution via dockerode
 * (Strategy Pattern). Applies BR-12 hardening (cap drop, no-new-privileges,
 * read-only rootfs + tmpfs, network isolation) — reuses SecurityModule when
 * available, else built-in defaults. Tests touching Docker are guarded
 * (dockerode never connects unless a container op runs).
 *
 * Implementation submodules (same directory):
 * - DockerSessionManager.ts — session create/destroy, mounts, image pull
 * - DockerCommandRunner.ts  — command exec with timeout + OOM detection
 */

import Docker from 'dockerode';
import * as os from 'os';
import * as path from 'path';
import type { Logger } from 'pino';
import type { SandboxConfig } from '../../../config/SandboxConfig.js';
import type { SandboxHardening } from './hardening.js';
import type { IExecutor, SessionCreateConfig, ExecOptions } from './IExecutor.js';
import type { Session, ExecutionResult } from '../models.js';
import { DockerSessionManager } from './DockerSessionManager.js';
import { DockerCommandRunner } from './DockerCommandRunner.js';

export class DockerExecutor implements IExecutor {
  readonly mode = 'docker' as const;
  private docker: Docker;
  private logger: Logger;
  private sessionManager: DockerSessionManager;
  private commandRunner: DockerCommandRunner;

  constructor(
    logger: Logger,
    config: SandboxConfig,
    hardening: SandboxHardening,
    socket?: string,
  ) {
    this.logger = logger.child({ executor: 'docker' });
    this.docker = socket ? new Docker({ socketPath: socket }) : new Docker();
    const stagingDir = path.join(os.tmpdir(), 'sa4e-sandbox-staging');
    this.sessionManager = new DockerSessionManager(this.docker, config, hardening, this.logger, stagingDir);
    this.commandRunner = new DockerCommandRunner(this.docker, config, this.logger);
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

  async createSession(config: SessionCreateConfig): Promise<Session> {
    return this.sessionManager.createSession(config);
  }

  async destroySession(session: Session): Promise<void> {
    return this.sessionManager.destroySession(session);
  }

  async execute(session: Session, command: string, options: ExecOptions): Promise<ExecutionResult> {
    return this.commandRunner.execute(session, command, options);
  }
}
