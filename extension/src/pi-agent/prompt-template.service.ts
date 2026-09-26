import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface PromptTemplate {
  templateName: string;
  templatePath: string;
  promptContent: string;
}

export class PromptTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptTemplateError';
  }
}

export class PromptTemplateService {
  private readonly cwd: string;
  private readonly agentDir: string;
  private templates: PromptTemplate[] = [];

  constructor(cwd: string, agentDir?: string) {
    this.cwd = cwd;
    this.agentDir = agentDir ?? path.join(os.homedir(), '.pi', 'agent');
  }

  private static validateName(name: string): void {
    if (!/^[a-z0-9-]+$/.test(name)) {
      throw new PromptTemplateError(`Invalid template name '${name}'. Must be lowercase letters, numbers, hyphen`);
    }
  }

  private static templateNameFromFile(fileName: string): string {
    return path.basename(fileName, path.extname(fileName));
  }

  private readDirRecursive(dir: string): string[] {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => path.join(dir, e.name))
      .filter((f) => /\.(md|txt)$/i.test(f));
  }

  discover(promptsOverride?: PromptTemplate[]): void {
    const sources: string[] = [
      path.join(this.cwd, '.pi', 'prompts'),
      path.join(this.agentDir, 'prompts'),
    ];

    const discovered: PromptTemplate[] = [];

    for (const src of sources) {
      const files = this.readDirRecursive(src);
      for (const file of files) {
        try {
          const name = PromptTemplateService.templateNameFromFile(file);
          PromptTemplateService.validateName(name);
          const content = fs.readFileSync(file, 'utf-8');
          discovered.push({
            templateName: name,
            templatePath: file,
            promptContent: content,
          });
        } catch (err) {
          // log and continue
        }
      }
    }

    if (promptsOverride && Array.isArray(promptsOverride)) {
      for (const t of promptsOverride) {
        try {
          PromptTemplateService.validateName(t.templateName);
          if (!fs.existsSync(t.templatePath)) {
            // skip invalid
            continue;
          }
          discovered.push(t);
        } catch {}
      }
    }

    // deduplicate by name, override wins
    const map = new Map<string, PromptTemplate>();
    for (const t of discovered) {
      map.set(t.templateName, t);
    }
    this.templates = Array.from(map.values());
  }

  getPrompts(): PromptTemplate[] {
    return this.templates;
  }

  getPrompt(name: string): PromptTemplate {
    PromptTemplateService.validateName(name);
    const tpl = this.templates.find((t) => t.templateName === name);
    if (!tpl) {
      throw new PromptTemplateError(`Template '${name}' không tồn tại`);
    }
    return tpl;
  }

  validatePath(filePath: string): boolean {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  }
}
