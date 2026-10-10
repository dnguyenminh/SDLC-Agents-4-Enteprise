/**
 * IdeControlTools — registers hidden MCP tools (ide_*) into the extension's
 * local tool registry so AI agents can control VSCode-like IDEs and perform
 * manual testing of extensions.
 *
 * Architecture (SA4E-352, user-approved): puppeteer-core drives the IDE via
 * CDP — no per-fork chromedriver binary needed (SA4E-344 spike evidence:
 * Kiro 1.2.37 CDP attach verified).
 *
 * Tools are hidden:true — executable + discoverable via find_tools, omitted
 * from tools/list (same convention as pega_* / devtools_* tools).
 *
 * OCP: mapping table — add a spec here to expose a new ide_ tool.
 */
import { registerLocalTool, LocalToolDefinition } from "../backend-local-tools";
import { IdeSessionManager } from "./ide-session-manager";

let manager: IdeSessionManager | null = null;

function getManager(): IdeSessionManager {
  if (!manager) {
    manager = new IdeSessionManager();
  }
  return manager;
}

type IdeHandler = (
  m: IdeSessionManager,
  args: Record<string, unknown>,
) => Promise<unknown>;

interface IdeToolSpec {
  name: string;
  description: string;
  handler: IdeHandler;
  inputSchema: Record<string, unknown>;
}

const IDE_TOOL_SPECS: IdeToolSpec[] = [
  {
    name: "ide_launch",
    description:
      "Launch a VSCode-like IDE (code | kiro | antigravity | kilo) with remote debugging enabled. Returns sessionId + cdpEndpoint. Pass ideBinaryPath to override the resolved binary.",
    handler: (m, a) =>
      m.launch(String(a.ide ?? "code"), a.ideBinaryPath as string | undefined, a.userDataDir as string | undefined),
    inputSchema: {
      type: "object",
      properties: {
        ide: { type: "string", enum: ["code", "kiro", "antigravity", "kilo"], description: "IDE to launch (default: code)" },
        ideBinaryPath: { type: "string", description: "Optional: explicit path to the IDE executable (BR-01 fail-fast if missing)" },
        userDataDir: { type: "string", description: "Optional: user-data-dir for an isolated profile" },
      },
      required: [],
    },
  },
  {
    name: "ide_attach",
    description:
      "Attach puppeteer-core to a launched IDE session via its CDP endpoint. Returns the session with browser connected — required before screenshot/evaluate/inspect.",
    handler: (m, a) =>
      m.attach(String(a.sessionId ?? ""), a.cdpEndpoint as string | undefined),
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session from ide_launch" },
        cdpEndpoint: { type: "string", description: "Optional: explicit CDP endpoint (http://127.0.0.1:PORT)" },
      },
      required: [],
    },
  },
  {
    name: "ide_list_sessions",
    description: "List active IDE sessions (id, ide, cdpEndpoint, spawnedByLaunch).",
    handler: (m) => Promise.resolve(m.listSessions()),
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ide_screenshot",
    description:
      "Capture a base64 PNG screenshot of the IDE workbench window. Requires ide_attach first.",
    handler: (m, a) =>
      m.screenshot(String(a.sessionId ?? "")).then((b64) => ({ sessionId: a.sessionId, format: "png", encoding: "base64", data: b64 })),
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string", description: "Session from ide_launch" } },
      required: ["sessionId"],
    },
  },
  {
    name: "ide_evaluate",
    description:
      "Evaluate a JavaScript expression inside the IDE workbench renderer context (CDP). Requires ide_attach first.",
    handler: (m, a) =>
      m.evaluate(String(a.sessionId ?? ""), String(a.script ?? "")).then((result) => ({ sessionId: a.sessionId, result })),
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session from ide_launch" },
        script: { type: "string", description: "JavaScript expression to evaluate in the workbench renderer" },
      },
      required: ["sessionId", "script"],
    },
  },
  {
    name: "ide_inspect",
    description:
      "Inspect the IDE UI state: title, url, workbench/panel/sidebar/activitybar visibility. Requires ide_attach first.",
    handler: (m, a) => m.inspect(String(a.sessionId ?? "")),
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string", description: "Session from ide_launch" } },
      required: ["sessionId"],
    },
  },
  {
    name: "ide_close",
    description:
      "Close an IDE session: disconnect puppeteer + kill the spawned IDE process tree (kill=false to keep the IDE running).",
    handler: (m, a) => m.close(String(a.sessionId ?? ""), a.kill !== false),
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session to close" },
        kill: { type: "boolean", description: "Kill the spawned IDE process (default: true)" },
      },
      required: ["sessionId"],
    },
  },
];

function toDefinition(spec: IdeToolSpec): LocalToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    hidden: true,
  };
}

function toMcpResult(result: unknown): any {
  return {
    isError: false,
    content: [{ type: "text", text: JSON.stringify(result) }],
  };
}

export function registerIdeControlTools(): number {
  getManager();
  for (const spec of IDE_TOOL_SPECS) {
    const bound: IdeHandler = (m, args) => spec.handler(m, args);
    const wrappedHandler = async (args: Record<string, unknown>) =>
      toMcpResult(await bound(getManager(), args));
    registerLocalTool(spec.name, wrappedHandler, toDefinition(spec));
  }
  return IDE_TOOL_SPECS.length;
}
