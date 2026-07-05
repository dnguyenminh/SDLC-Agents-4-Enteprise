/**
 * DiagnosticsProvider — KSA-178
 * On file save → queries code_search for issues → shows as VS Code diagnostics.
 * Also provides CodeActions for quick fixes.
 */

import * as vscode from "vscode";
import { McpServerManager } from "./mcp-server-manager";

interface CodeIssue {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: "error" | "warning" | "info" | "hint";
  code: string;
  suggestion?: string;
}

const DIAGNOSTIC_SOURCE = "Kiro Code Intelligence";

/**
 * Register the diagnostics provider. Auto-triggers on file save.
 */
export function registerDiagnosticsProvider(
  context: vscode.ExtensionContext,
  mcpManager: McpServerManager
): vscode.DiagnosticCollection {
  const diagnostics = vscode.languages.createDiagnosticCollection("kiroCodeIntel");
  context.subscriptions.push(diagnostics);

  // Analyze on save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      analyzeDocument(doc, mcpManager, diagnostics);
    })
  );

  // Register code action provider for all languages
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: "file" },
      new KiroCodeActionProvider(diagnostics),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    )
  );

  // Clear diagnostics when file is closed
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      diagnostics.delete(doc.uri);
    })
  );

  return diagnostics;
}

async function analyzeDocument(
  doc: vscode.TextDocument,
  mcpManager: McpServerManager,
  diagnostics: vscode.DiagnosticCollection
): Promise<void> {
  if (mcpManager.status !== "running") { return; }

  const relativePath = vscode.workspace.asRelativePath(doc.uri);
  try {
    const raw = await mcpManager.invokeTool("code_search", {
      query: `issues in ${relativePath}`,
      file: relativePath,
      limit: 50,
    });
    const issues = parseIssues(raw, doc);
    diagnostics.set(doc.uri, issues);
  } catch {
    // Silently fail — don't disrupt user workflow
  }
}

function parseIssues(raw: string, doc: vscode.TextDocument): vscode.Diagnostic[] {
  try {
    const parsed = JSON.parse(raw);
    const items: CodeIssue[] = Array.isArray(parsed) ? parsed : (parsed.issues || parsed.results || []);
    return items.map((issue) => toDiagnostic(issue, doc)).filter(Boolean) as vscode.Diagnostic[];
  } catch {
    return [];
  }
}

function toDiagnostic(issue: CodeIssue, doc: vscode.TextDocument): vscode.Diagnostic | null {
  const line = Math.max(0, (issue.line || 1) - 1);
  const col = Math.max(0, (issue.column || 1) - 1);
  const endLine = Math.max(line, (issue.endLine || issue.line || 1) - 1);
  const endCol = issue.endColumn ? issue.endColumn - 1 : doc.lineAt(endLine).text.length;

  const range = new vscode.Range(line, col, endLine, endCol);
  const severity = mapSeverity(issue.severity);
  const diagnostic = new vscode.Diagnostic(range, issue.message, severity);
  diagnostic.source = DIAGNOSTIC_SOURCE;
  diagnostic.code = issue.code || "kiro-issue";

  if (issue.suggestion) {
    diagnostic.relatedInformation = [
      new vscode.DiagnosticRelatedInformation(
        new vscode.Location(doc.uri, range),
        `Fix: ${issue.suggestion}`
      ),
    ];
  }

  return diagnostic;
}

function mapSeverity(severity: string): vscode.DiagnosticSeverity {
  switch (severity) {
    case "error": return vscode.DiagnosticSeverity.Error;
    case "warning": return vscode.DiagnosticSeverity.Warning;
    case "hint": return vscode.DiagnosticSeverity.Hint;
    default: return vscode.DiagnosticSeverity.Information;
  }
}

class KiroCodeActionProvider implements vscode.CodeActionProvider {
  constructor(private readonly diagnostics: vscode.DiagnosticCollection) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== DIAGNOSTIC_SOURCE) { continue; }
      if (!diagnostic.relatedInformation?.length) { continue; }

      const suggestion = diagnostic.relatedInformation[0].message.replace("Fix: ", "");
      const action = new vscode.CodeAction(
        `Fix: ${suggestion}`,
        vscode.CodeActionKind.QuickFix
      );
      action.diagnostics = [diagnostic];
      action.isPreferred = true;
      actions.push(action);
    }

    return actions;
  }
}
