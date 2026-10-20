/**
 * SA4E-6 — Docker session lifecycle (extracted from DockerExecutor).
 * Container creation with safe mounts, BR-12 hardening, and the Windows
 * network-isolation workaround (TC-18). Image pull on demand.
 */

import Docker from 'dockerode';
import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from 'pino';
import type { SandboxConfig } from '../../../config/SandboxConfig.js';
import type { SandboxHardening } from './hardening.js';
import type { SessionCreateConfig } from './IExecutor.js';
import { prepareSafeMount } from './mountSecurity.js';
import { buildHostConfig } from './dockerHostConfig.js';
import { generateSessionId, type Session } from '../models.js';
import { ImagePullError, MountError } from '../errors.js';

/** Manages docker sandbox sessions (create/destroy). */
export class DockerSessionManager {
  constructor(
    private readonly docker: Docker,
    private readonly config: SandboxConfig,
    private readonly hardening: SandboxHardening,
    private readonly logger: Logger,
    private readonly stagingDir: string,
  ) {}

  async createSession(config: SessionCreateConfig): Promise<Session> {
    const sessionId = generateSessionId();
    const image = config.baseImage || this.config.defaultImage;
    await this.ensureImage(image);

    const binds = this.buildBinds(config, sessionId);
    const hostConfig = buildHostConfig({
      resources: config.resources,
      networkEnabled: config.networkEnabled,
      binds,
      hardening: this.hardening,
    });
    if (!config.networkEnabled) {
      await this.applyNetworkIsolation(hostConfig);
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

  /** Build ro/rw bind strings; copies excluded patterns through a safe staging mount. */
  private buildBinds(config: SessionCreateConfig, sessionId: string): string[] {
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
    return binds;
  }

  /**
   * AGGRESSIVE WORKAROUND for Docker Desktop Windows Network Isolation (TC-18)
   * 'none' is often ignored; we create an internal network and force detachment from bridge.
   */
  private async applyNetworkIsolation(hostConfig: Docker.HostConfig): Promise<void> {
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
}
