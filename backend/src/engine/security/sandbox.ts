/**
 * SA4E-417 — Sandbox enforcement (16K Doc §13).
 *
 * - Path containment: absolute paths, '..' segments and symlink escapes are
 *   rejected BEFORE any fs access (resolveContainedPath reuses the F1 guard).
 * - No shell concat: commands are expressed as (executable, argVector) with a
 *   '--' separator; shell metacharacters in any arg abort the call.
 * - Container limits: memory/CPU/disk/pids bounds are validated centrally so
 *   the runner cannot spawn an unconstrained workspace container.
 * - Network: denied by default; only allowlisted dependency registries.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveContainedPath } from '../indexer/path-safety.js';
import { SHELL_METACHARS } from './tool-schemas.js';

export class SandboxViolationError extends Error {
  constructor(public readonly rule: string, detail: string) {
    super(`${rule}: ${detail}`);
  }
}

/** Reject absolute paths and '..' segments syntactically (fast fail, no fs). */
export function assertRelativeWorkspacePath(filePath: string): void {
  const p = filePath.replaceAll('\\', '/');
  if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/')) {
    throw new SandboxViolationError('ABSOLUTE_PATH_FORBIDDEN', filePath);
  }
  if (p.split('/').includes('..')) {
    throw new SandboxViolationError('PATH_TRAVERSAL_FORBIDDEN', filePath);
  }
  if (p.trim() === '' || p.includes('\0')) {
    throw new SandboxViolationError('PATH_INVALID', 'empty or NUL');
  }
}

/**
 * Resolve a workspace-relative path to its canonical real path, rejecting:
 * absolute paths, '..' traversal, symlink escapes and anything resolving
 * outside the workspace root.
 */
export function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  assertRelativeWorkspacePath(relativePath);
  const target = path.join(workspaceRoot, relativePath);
  const contained = resolveContainedPath(target, workspaceRoot);
  if (!contained) {
    throw new SandboxViolationError('SYMLINK_ESCAPE_FORBIDDEN', relativePath);
  }
  return contained;
}

/**
 * Structured command vector — NEVER a concatenated shell string.
 * Path-like args are passed after '--' so flag injection is impossible.
 */
export interface CommandVector {
  executable: string;
  args: string[];
}

export function buildArgVector(executable: string, args: string[], pathLikeFrom?: number): CommandVector {
  if (SHELL_METACHARS.test(executable)) {
    throw new SandboxViolationError('SHELL_METACHARS_FORBIDDEN', executable);
  }
  const vector: string[] = [];
  args.forEach((arg, i) => {
    if (SHELL_METACHARS.test(arg)) {
      throw new SandboxViolationError('SHELL_METACHARS_FORBIDDEN', `arg[${i}]=${arg}`);
    }
    vector.push(arg);
  });
  if (pathLikeFrom !== undefined) {
    return { executable, args: [...vector.slice(0, pathLikeFrom), '--', ...vector.slice(pathLikeFrom)] };
  }
  return { executable, args: vector };
}

/** Container resource limits — the runner MUST apply all of them (rootless). */
export interface ContainerLimits {
  rootless: boolean;
  memoryMB: number;
  cpuPercent: number;
  diskMB: number;
  pids: number;
}

export const DEFAULT_CONTAINER_LIMITS: ContainerLimits = {
  rootless: true,
  memoryMB: 512,
  cpuPercent: 50,
  diskMB: 256,
  pids: 64,
};

const LIMIT_BOUNDS: Record<keyof Omit<ContainerLimits, 'rootless'>, number> = {
  memoryMB: 8192,
  cpuPercent: 100,
  diskMB: 2048,
  pids: 512,
};

export function validateContainerLimits(limits: ContainerLimits): string[] {
  const errors: string[] = [];
  if (!limits.rootless) errors.push('rootless=false forbidden (container must run non-root)');
  for (const [key, cap] of Object.entries(LIMIT_BOUNDS) as Array<[keyof typeof LIMIT_BOUNDS, number]>) {
    const v = limits[key];
    if (!Number.isFinite(v) || v <= 0) errors.push(`${key}: must be > 0`);
    else if (v > cap) errors.push(`${key}: ${v} exceeds cap ${cap}`);
  }
  return errors;
}

/** Network policy — denied by default; only allowlisted dependency registries. */
export interface NetworkPolicy {
  allowNetwork: boolean;
  registryAllowlist: string[];
}

export const DEFAULT_NETWORK_POLICY: NetworkPolicy = {
  allowNetwork: false,
  registryAllowlist: ['registry.npmjs.org', 'pypi.org', 'repo1.maven.org', 'registry-1.docker.io'],
};

export function isRegistryAllowed(policy: NetworkPolicy, host: string): boolean {
  if (!policy.allowNetwork) return false;
  return policy.registryAllowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/** Guard used by executors before touching a workspace file (fs-level). */
export function workspaceFileGuard(workspaceRoot: string, relativePath: string, mustExist = true): string {
  const resolved = resolveWorkspacePath(workspaceRoot, relativePath);
  if (mustExist && !fs.existsSync(resolved)) {
    throw new SandboxViolationError('FILE_NOT_FOUND', relativePath);
  }
  if (fs.statSync(resolved).isDirectory()) {
    throw new SandboxViolationError('PATH_IS_DIRECTORY', relativePath);
  }
  return resolved;
}
