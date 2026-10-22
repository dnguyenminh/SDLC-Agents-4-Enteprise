/**
 * One-time config migration (SA4E-370): copies old flat key values → new
 * dot-notation keys. Runs at extension activation, guarded by a globalState
 * flag so it executes exactly once per user. Shows a popup with a detailed
 * migration table after completion.
 *
 * Design notes:
 * - Old key values are COPIED, never deleted (backward compatibility for
 *   users downgrading to a pre-rename release).
 * - The new key wins: when the new key already has a value (user or workspace
 *   scope), the old value is NOT overwritten.
 * - Workspace-scope old values are copied to the workspace scope; global old
 *   values to the user (global) scope.
 * - The completion flag is set AFTER the loop finishes, even when 0 keys were
 *   migrated, so the popup never re-appears.
 */
import * as vscode from "vscode";

const MIGRATION_FLAG = "sdlcAgents.configMigration.v1_55_0.completed";

/** old flat key → new dotted key */
export const CONFIG_MIGRATION_MAP: Record<string, string> = {
  "pegaEndpoint": "pega.endpoint",
  "pegaUsername": "pega.username",
  "pegaDeveloperShortName": "pega.developerShortName",
  "mcpServerPort": "mcp.serverPort",
  "mcpMaxBodyBytes": "mcp.maxBodyBytes",
  "enableMcpServer": "mcp.enabled",
  "mcpServerUrl": "mcp.serverUrl",
  "llmProvider": "llm.provider",
  "llmModel": "llm.model",
  "llmFallbackModels": "llm.fallbackModels",
  "anthropicBaseUrl": "llm.anthropic.baseUrl",
  "openaiBaseUrl": "llm.openai.baseUrl",
  "ollamaUrl": "llm.ollama.baseUrl",
  "lmstudioBaseUrl": "llm.lmstudio.baseUrl",
  "openrouterBaseUrl": "llm.openrouter.baseUrl",
  "kiroModel": "llm.kiro.model",
  "atlassianConnectionType": "jira.connectionType",
  "jiraSyncState": "jira.syncState",
  "jiraLastProject": "jira.lastProject",
  "jiraAttachmentChecksums": "jira.attachmentChecksums",
  "configPath": "workspace.configPath",
};

interface MigrationResult {
  oldKey: string;
  newKey: string;
  value: unknown;
  scope: "user" | "workspace";
}

export async function runConfigMigration(context: vscode.ExtensionContext): Promise<void> {
  // Skip if already migrated
  if (context.globalState.get<boolean>(MIGRATION_FLAG, false)) { return; }

  const config = vscode.workspace.getConfiguration("sdlcAgents");
  const migrated: MigrationResult[] = [];

  for (const [oldKey, newKey] of Object.entries(CONFIG_MIGRATION_MAP)) {
    const oldInspect = config.inspect(oldKey);
    const newInspect = config.inspect(newKey);
    const oldHasValue = oldInspect?.globalValue !== undefined || oldInspect?.workspaceValue !== undefined;
    const newHasValue = newInspect?.globalValue !== undefined || newInspect?.workspaceValue !== undefined;

    if (oldHasValue && !newHasValue) {
      const value = oldInspect?.workspaceValue ?? oldInspect?.globalValue;
      const scope: vscode.ConfigurationTarget = oldInspect?.workspaceValue !== undefined
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
      await config.update(newKey, value, scope);
      migrated.push({
        oldKey,
        newKey,
        value,
        scope: scope === vscode.ConfigurationTarget.Workspace ? "workspace" : "user",
      });
    }
  }

  // Set flag — migration done
  await context.globalState.update(MIGRATION_FLAG, true);

  // Show popup if any keys migrated
  if (migrated.length > 0) {
    showMigrationPopup(migrated);
  }
}

function showMigrationPopup(migrated: MigrationResult[]): void {
  const tableLines = migrated.map((m) =>
    `| \`${m.oldKey}\` | \`${m.newKey}\` | ${JSON.stringify(m.value)} | ${m.scope} |`
  );
  const report = [
    "# SDLC Agents — Config Migration Complete",
    "",
    `**${migrated.length} setting(s) migrated** to the new dot-notation format.`,
    "Your old settings still work — values were **copied** (not moved) for backward compatibility.",
    "",
    "| Old Key | New Key | Value | Scope |",
    "|---------|---------|-------|-------|",
    ...tableLines,
    "",
    "---",
    "*This migration runs only once. You will not see this message again.*",
  ].join("\n");

  vscode.window
    .showInformationMessage(
      `SDLC Agents: ${migrated.length} config setting(s) migrated to new format.`,
      "View Details",
      "Dismiss"
    )
    .then((selection) => {
      if (selection === "View Details") {
        vscode.workspace
          .openTextDocument({ content: report, language: "markdown" })
          .then((doc) => vscode.window.showTextDocument(doc));
      }
    });
}
