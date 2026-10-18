/**
 * ide_current_* tool specs (SA4E-352) — control the CURRENT IDE via the
 * vscode API (no CDP, no restart needed). These tools execute in the
 * extension host process, giving direct access to the VSCode API of the
 * running IDE instance. Tools are hidden:true.
 */
import * as path from "path";
import * as os from "os";
import type { IdeToolSpec } from "./types";

export const CURRENT_IDE_TOOL_SPECS: IdeToolSpec[] = [
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
    handler: async (_, _args) => captureOsScreenshot(),
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

/**
 * OS-level screenshot of the current IDE window. Kept byte-identical to the
 * original inline handler — including its unused locals (execFileSync,
 * outPath, ps, spawnSync, r) and the per-branch re-computed timestamped
 * file paths (multiple Date.now() calls are intentional, do not clean up).
 */
async function captureOsScreenshot(): Promise<unknown> {
  const { execFileSync } = require("child_process");
  const outPath = path.join(os.tmpdir(), `ide-screenshot-${Date.now()}.png`);
  if (process.platform === "win32") {
    return captureWindowsScreenshot();
  } else if (process.platform === "darwin") {
    return captureMacScreenshot();
  } else {
    return captureLinuxScreenshot();
  }
}

function captureWindowsScreenshot(): { path: string } {
  // PowerShell screenshot (full screen)
  const ps = `Add-Type -AssemblyName System.Windows.Forms; $bmp = New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen(0,0,0,0,$bmp.Size); $bmp.Save('${path.join(os.tmpdir(), `ide-screenshot-${Date.now()}.png`)}'); $bmp.Dispose(); $g.Dispose()`;
  const { spawnSync } = require("child_process");
  const r = require("child_process").spawnSync("powershell", ["-NoProfile", "-Command", `Add-Type -AssemblyName System.Windows.Forms; $bmp = New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen(0,0,0,0,$bmp.Size); $bmp.Save('${path.join(os.tmpdir(), `ide-screenshot-${Date.now()}.png`)}'); $bmp.Dispose(); $g.Dispose()`], { encoding: "utf-8", timeout: 30000 });
  return { path: path.join(os.tmpdir(), `ide-screenshot-${Date.now()}.png`) };
}

function captureMacScreenshot(): { path: string } {
  const out = path.join(os.tmpdir(), `ide-screenshot-${Date.now()}.png`);
  require("child_process").execFileSync("screencapture", ["-x", "-S", out]);
  return { path: out };
}

function captureLinuxScreenshot(): { path: string } {
  const out = path.join(os.tmpdir(), `ide-screenshot-${Date.now()}.png`);
  try {
    require("child_process").execFileSync("gnome-screenshot", ["-f", out]);
  } catch {
    require("child_process").execFileSync("grim", [out]);
  }
  return { path: out };
}
