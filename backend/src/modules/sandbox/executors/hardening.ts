/**
 * SA4E-6 — Container hardening profile for BR-12 (reuse of SecurityModule, SD-2).
 * When SecurityModule exposes `getHardeningProfile('sandbox')` it is used;
 * otherwise DockerExecutor falls back to these built-in safe defaults.
 */

export interface SandboxHardening {
  CapDrop: string[];
  CapAdd: string[];
  SecurityOpt: string[];
  Privileged: boolean;
  ReadonlyRootfs: boolean;
  Tmpfs?: Record<string, string>;
}

export const BUILTIN_HARDENING: SandboxHardening = {
  CapDrop: ['ALL'],
  CapAdd: ['CHOWN', 'SETGID', 'SETUID', 'NET_BIND_SERVICE'],
  SecurityOpt: ['no-new-privileges:true'],
  Privileged: false,
  ReadonlyRootfs: true,
  Tmpfs: {
    '/tmp': 'rw,noexec,nosuid,size=64m',
    '/var/tmp': 'rw,noexec,nosuid,size=64m',
  },
};
