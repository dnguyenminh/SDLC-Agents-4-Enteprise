/**
 * HookCommands — KSA-249
 * Registers VS Code commands for userTriggered hooks.
 * Each hook with when.type === "userTriggered" gets a command:
 *   kiro-sdlc.hook.{sanitized-name}
 */

import * as vscode from "vscode";
import { HookDefinition, loadHooks } from "./hook-loader";
import { HookExecutor, HookContext } from "./hook-executor";

export class HookCommands implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private executor: HookExecutor;
  private outputChannel: vscode.OutputChannel;
  private workspaceRoot: string;

  constructor(workspaceRoot: string, outputChannel: vscode.OutputChannel) {
    this.workspaceRoot = workspaceRoot;
    this.outputChannel = outputChannel;
    this.executor = new HookExecutor(outputChannel);
  }

  /**
   * Register VS Code commands for all userTriggered hooks.
   * Disposes previous registrations before re-registering.
   */
  async registerCommands(): Promise<void> {
    this.dispose();

    const hooks = await loadHooks(this.workspaceRoot);
    const userTriggered = hooks.filter(
      h => h.when.type === "userTriggered" && h.enabled !== false
    );

    for (const hook of userTriggered) {
      const commandId = `kiro-sdlc.hook.${this.sanitizeName(hook.name)}`;

      const disposable = vscode.commands.registerCommand(commandId, async () => {
        this.outputChannel.appendLine(`[CMD] Executing userTriggered hook: "${hook.name}"`);
        const context: HookContext = {};
        const result = await this.executor.execute(hook, context);

        if (result.status === "completed") {
          vscode.window.setStatusBarMessage(`Hook: ${hook.name}`, 3000);
        } else {
          vscode.window.showWarningMessage(`Hook "${hook.name}" ${result.status}: ${result.error || ""}`);
        }
      });

      this.disposables.push(disposable);
      this.outputChannel.appendLine(`[CMD] Registered: ${commandId}`);
    }

    if (userTriggered.length > 0) {
      this.outputChannel.appendLine(`[CMD] ${userTriggered.length} userTriggered commands registered`);
    }
  }

  /**
   * Get list of registered command IDs.
   */
  async getRegisteredCommands(): Promise<string[]> {
    const hooks = await loadHooks(this.workspaceRoot);
    return hooks
      .filter(h => h.when.type === "userTriggered" && h.enabled !== false)
      .map(h => `kiro-sdlc.hook.${this.sanitizeName(h.name)}`);
  }

  /**
   * Sanitize hook name to valid VS Code command segment.
   */
  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
