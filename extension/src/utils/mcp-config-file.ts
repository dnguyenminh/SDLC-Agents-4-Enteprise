/**
 * McpConfigFile — Facade for reading and writing JSON config files.
 *
 * DRY: Eliminates 12 scattered readFileSync/writeFileSync + JSON.parse/stringify
 * occurrences across mcp-injector.ts, mcp-config-builder.ts, config-watcher.ts,
 * ChatContextPicker.ts, checksum.ts, checkpointer.ts, CommandRegistrar.ts.
 *
 * Pattern: Facade — single point of contact for config file I/O.
 */

import * as fs from "fs";
import * as path from "path";

/**
 * Read a JSON file and return its parsed value.
 * @param filePath - Absolute path to the JSON file.
 * @returns Parsed JSON value, or null if the file does not exist.
 * @throws {SyntaxError} if the file content is invalid JSON.
 * @throws {Error} if the file exists but cannot be read (permissions, etc.).
 */
export function readJsonFile<T = unknown>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

/**
 * Write a value to a JSON file with pretty-printing (2-space indent).
 * Creates parent directories if they do not exist.
 * @param filePath - Absolute path to the target JSON file.
 * @param value    - Value to serialise and write.
 */
export function writeJsonFile(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

/**
 * Apply a partial update to a JSON file.
 * Reads the existing value (or uses `defaultValue`), merges the patch shallowly, then writes.
 * @param filePath     - Absolute path to the JSON file.
 * @param patch        - Partial object to merge into the existing value.
 * @param defaultValue - Value to use when the file does not exist.
 * @returns The resulting merged value that was written.
 */
export function updateJsonFile<T extends object>(
  filePath: string,
  patch: Partial<T>,
  defaultValue: T = {} as T
): T {
  const existing = readJsonFile<T>(filePath) ?? defaultValue;
  const merged: T = { ...existing, ...patch };
  writeJsonFile(filePath, merged);
  return merged;
}

/**
 * McpConfigFile — convenience wrapper scoped to a single config path.
 * Useful when the same file is read/written multiple times in a class.
 */
export class McpConfigFile<T extends object> {
  constructor(
    private readonly filePath: string,
    private readonly defaultValue: T = {} as T
  ) {}

  /** Read the config. Returns defaultValue if the file does not exist. */
  read(): T {
    return readJsonFile<T>(this.filePath) ?? this.defaultValue;
  }

  /** Overwrite the config entirely. */
  write(value: T): void {
    writeJsonFile(this.filePath, value);
  }

  /** Merge a partial patch into the existing config and save. */
  update(patch: Partial<T>): T {
    return updateJsonFile<T>(this.filePath, patch, this.defaultValue);
  }

  /** Returns true if the config file exists on disk. */
  exists(): boolean {
    return fs.existsSync(this.filePath);
  }
}
