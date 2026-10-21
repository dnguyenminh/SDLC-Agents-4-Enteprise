/**
 * SA4E-370 S1: fs-helpers unit tests — AgentInfo v2 parser.
 * Covers TC-001 (v2 parse), TC-002 (v1 backward compat), TC-200 (invalid YAML),
 * TC-100 (invalid role fallback), TC-101 (invalid model fallback),
 * TC-303 (parser fail-safe), TC-408 (empty body).
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

vi.mock("../../debug-logger", () => ({
  debugLog: vi.fn(),
}));

import { parseAgentFrontmatter, readAgentInfos } from "../fs-helpers";

function makeAgentFile(frontmatter: Record<string, string>, body: string): string {
  const fmLines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`);
  return `---\n${fmLines.join("\n")}\n---\n${body}`;
}

describe("parseAgentFrontmatter (S1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-001: Parse v2 agent file with all fields
  it("TC-001: parses v2 agent file with all fields (role, phase, model, personaBody)", () => {
    const content = makeAgentFile(
      { name: "QA Agent", description: "Quality engineering agent", role: "qa-agent", phase: "testing", model: "gpt-4o-mini" },
      "You are the QA agent. You write tests."
    );
    const result = parseAgentFrontmatter(content, "qa-agent");

    expect(result.id).toBe("qa-agent");
    expect(result.name).toBe("QA Agent");
    expect(result.description).toBe("Quality engineering agent");
    expect(result.role).toBe("qa-agent");
    expect(result.phase).toBe("testing");
    expect(result.model).toBe("gpt-4o-mini");
    expect(result.personaBody).toBe("You are the QA agent. You write tests.");
  });

  // TC-002: Parse v1 agent file (backward compatibility)
  it("TC-002: parses v1 agent file (name + description only), role/phase/model undefined", () => {
    const content = makeAgentFile(
      { name: "Legacy Agent", description: "Old agent" },
      "You are a legacy agent."
    );
    const result = parseAgentFrontmatter(content, "legacy-agent");

    expect(result.id).toBe("legacy-agent");
    expect(result.name).toBe("Legacy Agent");
    expect(result.description).toBe("Old agent");
    expect(result.role).toBeUndefined();
    expect(result.phase).toBeUndefined();
    expect(result.model).toBeUndefined();
    expect(result.personaBody).toBe("You are a legacy agent.");
  });

  // TC-200: File without frontmatter — body = entire content
  it("TC-200: handles file without frontmatter (body = entire content)", () => {
    const content = "No frontmatter here. Just body text.";
    const result = parseAgentFrontmatter(content, "nofm-agent");

    expect(result.name).toBe("nofm-agent");
    expect(result.description).toBe("");
    expect(result.personaBody).toBe(content);
  });

  // TC-100: Invalid role falls back (parser extracts, engine validates)
  it("TC-100: invalid role is returned as-is (engine fallback handles validation)", () => {
    const content = makeAgentFile(
      { name: "Bad Agent", description: "Bad role", role: "unknown-role" },
      "Body"
    );
    const result = parseAgentFrontmatter(content, "bad-agent");

    expect(result.role).toBe("unknown-role");
  });

  // TC-101: Invalid model falls back (parser extracts, engine validates)
  it("TC-101: invalid model is returned as-is (engine fallback handles validation)", () => {
    const content = makeAgentFile(
      { name: "Bad Model Agent", description: "Bad model", model: "unsupported-model" },
      "Body"
    );
    const result = parseAgentFrontmatter(content, "bad-model-agent");

    expect(result.model).toBe("unsupported-model");
  });

  // TC-408: Empty body
  it("TC-408: empty body → personaBody is empty string", () => {
    const content = makeAgentFile({ name: "Empty Agent", description: "No body" }, "");
    const result = parseAgentFrontmatter(content, "empty-agent");

    expect(result.personaBody).toBe("");
  });

  // Quoted values
  it("strips quotes from frontmatter values", () => {
    const content = makeAgentFile(
      { name: '"Quoted Name"', description: "'Quoted Desc'" },
      "Body"
    );
    const result = parseAgentFrontmatter(content, "quoted-agent");

    expect(result.name).toBe("Quoted Name");
    expect(result.description).toBe("Quoted Desc");
  });
});

describe("readAgentInfos (S1)", () => {
  // fs-helpers reads the filesystem via require("fs") inside each helper,
  // which BYPASSES vi.mock — so these tests drive a REAL temp workspace
  // (same convention as dir-watchers.test.ts).
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "sa4e-fs-helpers-"));
  const AGENTS_DIR = path.join(ROOT, ".code-intel", "agents");

  beforeEach(() => {
    fs.rmSync(AGENTS_DIR, { recursive: true, force: true });
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
  });

  // TC-303: Parser fail-safe — invalid file skipped, no crash
  it("TC-303: skips invalid/unreadable files, continues with valid ones", () => {
    // Valid agent file
    fs.writeFileSync(
      path.join(AGENTS_DIR, "good-agent.md"),
      makeAgentFile({ name: "Good Agent", description: "Good" }, "Good body")
    );
    // Unreadable entry: a DIRECTORY named like an agent file — readFileSync
    // throws (EISDIR) and the fail-safe skips it (BR-04, F06).
    fs.mkdirSync(path.join(AGENTS_DIR, "bad-agent.md"));

    const result = readAgentInfos(ROOT);

    expect(result.length).toBe(1);
    expect(result[0].id).toBe("good-agent");
    expect(result[0].name).toBe("Good Agent");
  });

  it("returns empty array when agents dir does not exist", () => {
    fs.rmSync(AGENTS_DIR, { recursive: true, force: true });
    const result = readAgentInfos(ROOT);
    expect(result).toEqual([]);
  });

  it("returns empty array when agents dir is empty", () => {
    const result = readAgentInfos(ROOT);
    expect(result).toEqual([]);
  });
});
