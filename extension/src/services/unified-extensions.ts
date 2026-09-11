/**
 * SA4E-261 Unified extension whitelist — must match backend/src/config/unified-extensions.ts
 */
export const UNIFIED_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx',
  'kt', 'java', 'py', 'go', 'rs',
  'c', 'cpp', 'h', 'hpp',
  'cs', 'php', 'rb', 'scala', 'swift',
  'cls', 'trigger', 'apex', 'soql', 'page', 'component', 'cmp', 'app', 'evt', 'intf', 'tokens', 'pega',
  'html', 'jsp', 'xml', 'sql', 'properties', 'yml', 'yaml', 'css'
] as const;

export type UnifiedExtension = typeof UNIFIED_EXTENSIONS[number];
