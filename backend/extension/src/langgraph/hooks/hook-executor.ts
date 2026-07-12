/**
 * HookExecutor — KSA-249
 * Executes hook actions (askAgent / runCommand) with timeout and error handling.
 * Non-blocking: hook failures never crash the pipeline.
 */

import * as vscode from "vscode";
import { HookDefinition } from "./hook-loader";

export interface HookContext {
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  nodeName?: string;
  inputState?: unknown;
  taskOutput?: unknown;
  duration?: number;
}

export interface HookResult {
  status: "completed" | "failed" | "timed_out" | "denied";
  output?: string;
  modifiedParams?: Record<string, unknown>;
  error?: string;
  duration: number;
}

export class HookExecutor {
  private outputChannel: vscode.OutputChannel;
  private defaultTimeout: number;

  constructor(outputChannel: vscode.OutputChannel, defaultTimeout = 60000) {
    this.outputChannel = outputChannel;
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Execute a hook's action based on its type.
   */
  async execute(hook: HookDefinition, context: HookContext): Promise<HookResult> {
    const start = Date.now();
    try {
      if (hook.then.type === "askAgent") {
        return await this.executeAskAgent(hook, context, start);
      } else if (hook.then.type === "runCommand") {
        return await this.executeRunCommand(hook, context, start);
      }
      return { status: "failed", error: `Unknown action type: ${hook.then.type}`, duration: Date.now() - start };
    } catch (err) {
      const duration = Date.now() - start;
      const message = (err as Error).message;
      this.outputChannel.appendLine(`[ERROR] Hook "${hook.name}" failed: ${message}`);
      return { status: "failed", error: message, duration };
    }
  }

  /**
   * Execute askAgent action — resolves prompt with placeholders.
   * Checks for denial patterns in tool results.
   */
  private async executeAskAgent(hook: HookDefinition, context: HookContext, start: number): Promise<HookResult> {
    const prompt = hook.then.prompt;
    if (!prompt) {
      return { status: "failed", error: "No prompt defined", duration: Date.now() - start };
    }

    const resolvedPrompt = this.substitutePlaceholders(prompt, context);
    this.outputChannel.appendLine(`[HOOK] "${hook.name}" askAgent: ${resolvedPrompt.slice(0, 200)}`);

    if (context.toolResult) {
      const denied = this.detectDenial(context.toolResult);
      if (denied) {
        this.outputChannel.appendLine(`[HOOK] "${hook.name}" detected denial: ${denied}`);
        return { status: "denied", output: resolvedPrompt, error: denied, duration: Date.now() - start };
      }
    }

    return { status: "completed", output: resolvedPrompt, duration: Date.now() - start };
  }

  /**
   * Execute runCommand — spawns child process with timeout.
   * SIGTERM on timeout, SIGKILL after 5s grace period.
   */
  private async executeRunCommand(hook: HookDefinition, context: HookContext, start: number): Promise<HookResult> {
    const command = hook.then.command;
    if (!command) {
      return { status: "failed", error: "No command defined", duration: Date.now() - start };
    }

    const resolvedCmd = this.substitutePlaceholders(command, context);
    this.outputChannel.appendLine(`[HOOK] "${hook.name}" runCommand: ${resolvedCmd}`);

    const timeout = this.defaultTimeout;
    const { spawn } = await import("child_process");

    return new Promise<HookResult>((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const proc = spawn(resolvedCmd, [], {
        shell: true,
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        env: { ...process.env },
      });

      const timer = setTimeout(() => {
        timedOut = true;
        this.killProcess(proc.pid);
      }, timeout);

      proc.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
        if (stdout.length > 10000) stdout = stdout.slice(-10000);
      });

      proc.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
        if (stderr.length > 5000) stderr = stderr.slice(-5000);
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        const duration = Date.now() - start;

        if (timedOut) {
          this.outputChannel.appendLine(`[HOOK] "${hook.name}" timed out after ${timeout}ms`);
          resolve({ status: "timed_out", output: stdout, error: `Timed out after ${timeout}ms`, duration });
        } else if (code !== 0) {
          this.outputChannel.appendLine(`[HOOK] "${hook.name}" exited with code ${code}`);
          resolve({ status: "failed", output: stdout, error: stderr || `Exit code: ${code}`, duration });
        } else {
          resolve({ status: "completed", output: stdout, duration });
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({ status: "failed", error: err.message, duration: Date.now() - start });
      });
    });
  }

  /**
   * Kill a process: SIGTERM first, SIGKILL after 5s.
   */
  private killProcess(pid: number | undefined): void {
    if (!pid) return;
    try {
      process.kill(pid, "SIGTERM");
      setTimeout(() => {
        try { process.kill(pid, "SIGKILL"); } catch { /* already dead */ }
      }, 5000);
    } catch { /* process already exited */ }
  }

  /**
   * Substitute placeholders in prompt/command templates.
   * Supported: {{toolName}}, {{toolArgs}}, {{toolResult}}, {{nodeName}}
   */
  private substitutePlaceholders(template: string, context: HookContext): string {
    let result = template;
    if (context.toolName) {
      result = result.replace(/\{\{toolName\}\}/g, context.toolName);
    }
    if (context.toolArgs) {
      const argsStr = JSON.stringify(context.toolArgs).slice(0, 1000);
      result = result.replace(/\{\{toolArgs\}\}/g, argsStr);
    }
    if (context.toolResult) {
      const truncated = context.toolResult.slice(0, 1000);
      result = result.replace(/\{\{toolResult\}\}/g, truncated);
    }
    if (context.nodeName) {
      result = result.replace(/\{\{nodeName\}\}/g, context.nodeName);
    }
    return result;
  }

  /**
   * Detect denial patterns in tool results.
   */
  private detectDenial(result: string): string | null {
    const upper = result.toUpperCase();
    const patterns = ["FORBIDDEN", "DENY", "ACCESS_DENIED", "PERMISSION DENIED"];
    for (const p of patterns) {
      if (upper.includes(p)) return p;
    }
    return null;
  }
}
