import * as fs from 'fs';
import * as path from 'path';

export interface Settings {
  model?: string;
  thinkingLevel?: string;
  scopedModels?: string[];
  [key: string]: unknown;
}

export interface SettingsManagerOptions {
  source: 'file' | 'memory';
  filePath?: string;
  initial?: Settings;
}

export class SettingsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsParseError';
  }
}

export class SettingsManager {
  private settings: Settings = {};

  constructor(private readonly opts: SettingsManagerOptions) {
    this.load();
  }

  private load(): void {
    try {
      if (this.opts.source === 'file' && this.opts.filePath) {
        if (!fs.existsSync(this.opts.filePath)) {
          throw new SettingsParseError(`Settings file not found: ${this.opts.filePath}`);
        }
        const raw = fs.readFileSync(this.opts.filePath, 'utf-8');
        const ext = path.extname(this.opts.filePath).toLowerCase();
        if (ext === '.json') {
          this.settings = JSON.parse(raw);
        } else if (ext === '.yaml' || ext === '.yml') {
          // simple YAML support for key: value pairs
          this.settings = this.parseSimpleYaml(raw);
        } else {
          throw new SettingsParseError(`Unsupported settings format: ${ext}`);
        }
      } else if (this.opts.source === 'memory' && this.opts.initial) {
        this.settings = { ...this.opts.initial };
      }
    } catch (err) {
      // fallback to defaults
      this.settings = {};
    }
  }

  private parseSimpleYaml(text: string): Settings {
    const out: Settings = {};
    for (const line of text.split('\n')) {
      const m = line.match(/^([^:#]+):\s*(.*)$/);
      if (m) {
        const key = m[1].trim();
        let val = m[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        out[key] = val;
      }
    }
    return out;
  }

  getSettings(): Settings {
    return this.settings;
  }

  get(key: string): unknown {
    return this.settings[key];
  }

  reload(): void {
    this.load();
  }
}
