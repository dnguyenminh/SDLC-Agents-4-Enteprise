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
import * as path from "path";
import * as os from "os";

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
  // ===========================
  // ide_current_* tools — control CURRENT IDE via vscode API (no CDP, no restart needed)
  // These tools execute in the extension host process, giving direct access to
  // the VSCode API of the running IDE instance.
  // ===========================
  {
    name: "ide_current_executeCommand",
    description:
      "Execute a VSCode command by ID in the current IDE instance (no restart needed).",
    handler: async (_, args) => {
      const vscode = require("vscode");
      const commandId = String(args.commandId ?? "");
      if (!commandId) throw new Error("commandId is required");
      const cmdArgs = Array.isArray(args.args) ? args.args : [];
      await vscode.commands.executeCommand(commandId, ...cmdArgs);
      return { executed: true, commandId };
    },
    inputSchema: {
      type: "object",
      properties: {
        commandId: { type: "string", description: "VSCode command ID (e.g., 'workbench.action.files.openFile')" },
        args: { type: "array", items: { type: "string" }, description: "Optional arguments for the command" },
      },
      required: ["commandId"],
    },
  },
  {
    name: "ide_current_openFile",
    description:
      "Open a file in the editor of the current IDE instance.",
    handler: async (_, a) => {
      const vscode = require("vscode");
      const filePath = String(a.path ?? "");
      if (!filePath) throw new Error("path is required");
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
      return { opened: true, path: filePath };
    },
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute file path to open" },
      },
      required: ["path"],
    },
  },
  {
    name: "ide_current_getActiveTab",
    description: "Get the title and path of the currently active editor tab.",
    handler: async () => {
      const vscode = require("vscode");
      const editor = vscode.window.activeTextEditor;
      if (!editor) return { activeTab: null };
      return {
        title: editor.document.fileName ? path.basename(editor.document.fileName) : editor.document.uri.toString(),
        path: editor.document.fileName,
        language: editor.document.languageId,
      };
    },
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ide_current_getWorkspace",
    description: "Get the workspace folders of the current IDE instance.",
    handler: async () => {
      const vscode = require("vscode");
      const folders = vscode.workspace.workspaceFolders ?? [];
      return folders.map((f: any) => ({ name: f.name, uri: f.uri.fsPath }));
    },
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ide_current_getSelection",
    description: "Get the current text selection in the active editor.",
    handler: async () => {
      const vscode = require("vscode");
      const editor = vscode.window.activeTextEditor;
      if (!editor) return { selection: null };
      const sel = editor.selection;
      const text = editor.document.getText(sel);
      return {
        text,
        start: { line: sel.start.line, character: sel.start.character },
        end: { line: sel.end.line, character: sel.end.character },
      };
    },
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ide_current_getSelectionText",
    description: "Get the selected text in the active editor (alias for ide_current_getSelection).",
    handler: async (_, args) => {
      // alias
      const vscode = require("vscode");
      const editor = vscode.window.activeTextEditor;
      if (!editor) return { text: "" };
      return { text: editor.document.getText(editor.selection) };
    },
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ide_current_runTask",
    description:
      "Run a VSCode task by name.",
    handler: async (_, args) => {
      const vscode = require("vscode");
      const taskName = String(args.taskName ?? "");
      if (!taskName) throw new Error("taskName is required");
      const tasks = await vscode.tasks.fetchTasks();
      const task = tasks.find((t: any) => t.name === taskName);
      if (!task) throw new Error(`Task "${taskName}" not found`);
      const execution = await vscode.tasks.executeTask(task);
      return { started: true, taskName };
    },
    inputSchema: {
      type: "object",
      properties: { taskName: { type: "string", description: "Task name from tasks.json" } },
      required: ["taskName"],
    },
  },
  {
    name: "ide_current_screenshot",
    description:
      "Capture a screenshot of the current IDE window (OS-level, no CDP needed). Windows: PowerShell + System.Drawing; macOS: screencapture; Linux: grim/gnome-screenshot.",
    handler: async (_, _args) => {
      const { execFileSync } = require("child_process");
      const outPath = path.join(os.tmpdir(), `ide-screenshot-${Date.now()}.png`);
      if (process.platform === "win32") {
        // PowerShell screenshot (full screen)
        const ps = `Add-Type -AssemblyName System.Windows.Forms; $bmp = New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen(0,0,0,0,$bmp.Size); $bmp.Save('${path.join(os.tmpdir(), `ide-screenshot-${Date.now()}.png`)}'); $bmp.Dispose(); $g.Dispose()`;
        const { spawnSync } = require("child_process");
        const r = require("child_process").spawnSync("powershell", ["-NoProfile", "-Command", `Add-Type -AssemblyName System.Windows.Forms; $bmp = New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen(0,0,0,0,$bmp.Size); $bmp.Save('${path.join(os.tmpdir(), `ide-screenshot-${Date.now()}.png`)}'); $bmp.Dispose(); $g.Dispose()`], { encoding: "utf-8", timeout: 30000 });
        return { path: path.join(os.tmpdir(), `ide-screenshot-${Date.now()}.png`) };
      } else if (process.platform === "darwin") {
        const out = path.join(os.tmpdir(), `ide-screenshot-${Date.now()}.png`);
        require("child_process").execFileSync("screencapture", ["-x", "-S", out]);
        return { path: out };
      } else {
        const out = path.join(os.tmpdir(), `ide-screenshot-${Date.now()}.png`);
        try {
          require("child_process").execFileSync("gnome-screenshot", ["-f", out]);
        } catch {
          require("child_process").execFileSync("grim", [out]);
        }
        return { path: out };
      }
    },
    inputSchema: { type: "object", properties: {}, required: [] },
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
