import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export interface IAgentDirResolver {
  getAgentDir(): string;
  isDirectoryExists(dir: string): boolean;
}

export class DefaultAgentDirResolver implements IAgentDirResolver {
  private readonly defaultAgentDir: string;

  constructor(defaultAgentDir?: string) {
    this.defaultAgentDir = defaultAgentDir ?? path.join(os.homedir(), '.pi', 'agent');
  }

  getAgentDir(): string {
    const agentDir = this.defaultAgentDir;
    if (!agentDir) {
      throw new Error('agentDir is not configured');
    }
    // Resolve ~ if present and normalize path separators
    let resolved = agentDir.replace(/^~(?=$|\/|\\)/, os.homedir());
    // Normalize separators to OS-specific
    resolved = path.normalize(resolved);
    return resolved;
  }

  isDirectoryExists(dir: string): boolean {
    try {
      return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  }
}
