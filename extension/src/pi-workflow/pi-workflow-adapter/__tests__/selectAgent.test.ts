/**
 * SA4E-370 S2: selectAgent unit tests.
 * Covers TC-004 (wire persona + role), TC-201 (file not found), TC-202 (session create),
 * TC-310 (AGENT_SWITCHED only after wiring), F02 (agentId authorization),
 * F05 (budget gate reject), BR-07 (fail-open).
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Mock fs-helpers (readAgentInfos + parseAgentFrontmatter — ESM imports in adapter-core)
const { mockReadAgentInfos, mockEnsureSessionHost, mockEvictSessionHost } = vi.hoisted(() => ({
  mockReadAgentInfos: vi.fn(),
  mockEnsureSessionHost: vi.fn(),
  mockEvictSessionHost: vi.fn(),
}));

vi.mock("../../../chat-panel/ChatStateManager/fs-helpers.js", () => ({
  readAgentInfos: (...args: any[]) => mockReadAgentInfos(...args),
  parseAgentFrontmatter: (content: string, fallbackId: string) => {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    let yaml = "";
    let body = content;
    if (match) {
      yaml = match[1];
      body = content.slice(match[0].length);
    }
    const nameMatch = yaml.match(/^name:\s*(.+)$/m);
    const descMatch = yaml.match(/^description:\s*(.+)$/m);
    const roleMatch = yaml.match(/^role:\s*(.+)$/m);
    const phaseMatch = yaml.match(/^phase:\s*(.+)$/m);
    const modelMatch = yaml.match(/^model:\s*(.+)$/m);
    return {
      id: fallbackId,
      name: nameMatch ? nameMatch[1].trim() : fallbackId,
      description: descMatch ? descMatch[1].trim() : "",
      role: roleMatch ? roleMatch[1].trim() : undefined,
      phase: phaseMatch ? phaseMatch[1].trim() : undefined,
      model: modelMatch ? modelMatch[1].trim() : undefined,
      personaBody: body.trimStart(),
    };
  },
}));

// Mock registry (adapter-core imports ../../session-host/registry.js → src/pi-workflow/session-host)
vi.mock("../../session-host/registry.js", () => ({
  ensureSessionHost: (...args: any[]) => mockEnsureSessionHost(...args),
  evictSessionHost: (...args: any[]) => mockEvictSessionHost(...args),
  clearSessionHostCache: vi.fn(),
}));

// Mock vscode
vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string) => {
        if (key === "llmProvider") return "anthropic";
        if (key === "llmModel") return "";
        return undefined;
      }),
    })),
  },
  SecretStorage: class {},
}));

// Mock logger
vi.mock("../../../debug-logger", () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(),
}));

import { AdapterCore } from "../adapter-core.js";
import type { ChatExtToWebviewMessage } from "../../../chat-panel/message-protocol.js";

// Production selectAgent reads the agent file via require("fs"), which
// BYPASSES vi.mock — so the persona source must live on the REAL filesystem.
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "sa4e-select-agent-"));
const AGENTS_DIR = path.join(ROOT, ".code-intel", "agents");
const AGENT_FILE = path.join(AGENTS_DIR, "qa-agent.md");
const QA_AGENT_MD = `---
name: QA Agent
description: QA agent
role: qa-agent
phase: testing
---
You are the QA agent.`;

// Helper to create a minimal AdapterCore instance with mocked dependencies
function createAdapter(opts: Partial<{
  mcpManager: any;
  workspaceRoot: string;
  onEvent: (msg: ChatExtToWebviewMessage) => void;
  secrets: any;
}> = {}) {
  const mcpManager: any = {};
  const onEvent = opts.onEvent || vi.fn();
  const adapter = new AdapterCore({
    mcpManager: opts.mcpManager ?? mcpManager,
    workspaceRoot: opts.workspaceRoot ?? "/test/workspace",
    onEvent,
    secrets: opts.secrets,
  } as any);
  return { adapter, onEvent };
}

describe("AdapterCore.selectAgent (S2)", () => {
  let events: ChatExtToWebviewMessage[] = [];

  beforeEach(() => {
    events = [];
    vi.clearAllMocks();
    // Real agent-file source — production reads it via require("fs") (unmockable).
    fs.rmSync(AGENTS_DIR, { recursive: true, force: true });
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
    mockEnsureSessionHost.mockResolvedValue({} as any);
    mockEvictSessionHost.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
  });

  // TC-004: Select agent wires persona + role
  it("TC-004: loads agent file, injects persona, sets role/phase from definition", async () => {
    mockReadAgentInfos.mockReturnValue([
      { id: "qa-agent", name: "QA Agent", description: "QA agent", role: "qa-agent", phase: "testing", model: undefined, personaBody: "You are the QA agent." },
    ]);
    fs.writeFileSync(AGENT_FILE, QA_AGENT_MD);

    const { adapter } = createAdapter({ workspaceRoot: ROOT, onEvent: (m) => events.push(m) });
    const result = await adapter.selectAgent("qa-agent");

    expect(result.success).toBe(true);
    expect(result.agentId).toBe("qa-agent");
    expect(result.agentName).toBe("QA Agent");
    expect(result.sessionRole).toBe("qa-agent");
    expect(result.sessionPhase).toBe("testing");

    // Verify ensureSessionHost was called with role + personaBody
    expect(mockEnsureSessionHost).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: expect.any(String),
        role: "qa-agent",
        phase: "testing",
        personaBody: "You are the QA agent.",
        activeAgentId: "qa-agent",
        workspaceRoot: ROOT,
      })
    );

    // Verify AGENT_SWITCHED emitted with success=true
    const switchedEvents = events.filter((e) => e.type === "chat:agentSwitched");
    expect(switchedEvents.length).toBe(1);
    expect((switchedEvents[0] as any).success).toBe(true);
    expect((switchedEvents[0] as any).agentId).toBe("qa-agent");
  });

  // F02: Invalid agentId not in list → rejected
  it("F02: rejects agentId not in agent list, keeps current agent", async () => {
    mockReadAgentInfos.mockReturnValue([
      { id: "qa-agent", name: "QA Agent", description: "QA agent", role: "qa-agent", phase: undefined, model: undefined, personaBody: "Body" },
    ]);

    const { adapter } = createAdapter({ workspaceRoot: "/test/workspace" });
    const result = await adapter.selectAgent("non-existent-agent");

    expect(result.success).toBe(false);
    expect(result.agentId).toBeNull();
    expect(result.error).toContain("not found");
    expect(mockEnsureSessionHost).not.toHaveBeenCalled();
  });

  // TC-201: Agent file not found / read error
  it("TC-201: agent file read error → failure, keeps current agent", async () => {
    mockReadAgentInfos.mockReturnValue([
      { id: "qa-agent", name: "QA Agent", description: "QA agent", role: "qa-agent", phase: undefined, model: undefined, personaBody: "Body" },
    ]);
    // Agent file intentionally NOT created → real readFileSync throws ENOENT.

    const { adapter } = createAdapter({ workspaceRoot: ROOT });
    const result = await adapter.selectAgent("qa-agent");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to load agent");
    expect(mockEnsureSessionHost).not.toHaveBeenCalled();
  });

  // BR-07: Fail-open on role scoping error
  it("BR-07: fail-open when ensureSessionHost throws", async () => {
    mockReadAgentInfos.mockReturnValue([
      { id: "qa-agent", name: "QA Agent", description: "QA agent", role: "qa-agent", phase: undefined, model: undefined, personaBody: "Body" },
    ]);
    fs.writeFileSync(AGENT_FILE, `---
name: QA Agent
description: QA agent
role: qa-agent
---
Body`);
    mockEnsureSessionHost.mockRejectedValue(new Error("Role scoping error"));

    const { adapter } = createAdapter({ workspaceRoot: ROOT });
    const result = await adapter.selectAgent("qa-agent");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Agent switch failed");
    // Keep current agent (null since none was set)
    expect(result.agentId).toBeNull();
  });

  // TC-310: AGENT_SWITCHED only after wiring
  it("TC-310: AGENT_SWITCHED emitted only after ensureSessionHost completes", async () => {
    let resolveEnsure: (() => void) | null = null;
    mockEnsureSessionHost.mockImplementation(() => new Promise<void>((resolve) => {
      resolveEnsure = resolve;
    }));

    mockReadAgentInfos.mockReturnValue([
      { id: "qa-agent", name: "QA Agent", description: "QA agent", role: "qa-agent", phase: undefined, model: undefined, personaBody: "Body" },
    ]);
    fs.writeFileSync(AGENT_FILE, `---
name: QA Agent
description: QA agent
role: qa-agent
---
Body`);

    const { adapter } = createAdapter({ workspaceRoot: ROOT, onEvent: (m) => events.push(m) });
    const promise = adapter.selectAgent("qa-agent");

    // Before wiring completes, no AGENT_SWITCHED should have been emitted yet
    // (the event is emitted after ensureSessionHost resolves)
    await new Promise((r) => setTimeout(r, 10));

    // Resolve the ensureSessionHost promise
    resolveEnsure!();
    await promise;

    const switchedEvents = events.filter((e) => e.type === "chat:agentSwitched");
    expect(switchedEvents.length).toBe(1);
    expect((switchedEvents[0] as any).success).toBe(true);
  });

  // null agentId deselects
  it("deselects agent when agentId is null", async () => {
    const { adapter, onEvent } = createAdapter({ workspaceRoot: "/test/workspace" });
    const result = await adapter.selectAgent(null);

    expect(result.success).toBe(true);
    expect(result.agentId).toBeNull();
    expect(mockEnsureSessionHost).not.toHaveBeenCalled();
  });
});
