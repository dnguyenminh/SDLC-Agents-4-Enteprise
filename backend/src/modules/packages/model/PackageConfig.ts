export type PackageStatus = 'installed' | 'pending' | 'error' | 'not_installed';

export interface PackageConfig {
  packageId: string;
  packageName: string;
  version?: string;
  enabled: boolean;
  status?: PackageStatus;
  lastUpdated?: string;
}

export const PRE_INSTALL_PACKAGES = [
  'pi-mcp-adapter',
  'pi-web-access',
  '@juicesharp/rpiv-todo',
  '@juicesharp/rpiv-ask-user-question',
  'pi-lens',
  'context-mode',
  'pi-subagents',
];
