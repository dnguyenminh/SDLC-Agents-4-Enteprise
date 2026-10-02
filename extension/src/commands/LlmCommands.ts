/**
 * LlmCommands — LLM-related command handlers.
 * Extracted from extension.ts for SRP.
 */

import * as vscode from "vscode";
import { ChatPanelProvider } from "../chat-panel/chat-panel-provider";
import { llmSecretKey, legacyLlmSecretKey } from "../config/llm-secret-keys";

export function registerLlmCommands(
  context: vscode.ExtensionContext,
  chatPanelProvider: ChatPanelProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("sdlcAgents.notifyLlmConnected", () => {
      console.log("[LlmCommands] notifyLlmConnected fired");
      chatPanelProvider.notifyLlmStatusChanged("connected");
    }),
    vscode.commands.registerCommand("sdlcAgents.notifyLlmDisconnected", () => {
      console.log("[LlmCommands] notifyLlmDisconnected fired");
      chatPanelProvider.notifyLlmStatusChanged("disconnected");
    }),
    vscode.commands.registerCommand("sdlcAgents.testLanguageModels", () => testLanguageModels()),
    vscode.commands.registerCommand("sdlcAgents.setLlmApiKey", () => handleSetLlmApiKey(context)),
    vscode.commands.registerCommand("sdlcAgents.clearLlmApiKey", () => handleClearLlmApiKey(context)),
  );
}

async function testLanguageModels(): Promise<void> {
  const outputCh = vscode.window.createOutputChannel("LM Test");
  outputCh.show();
  outputCh.appendLine("[LM Test] Starting vscode.lm API test...");

  try {
    if (!vscode.lm || !vscode.lm.selectChatModels) {
      outputCh.appendLine("[LM Test] ERROR: vscode.lm API not available.");
      vscode.window.showErrorMessage("vscode.lm API not available in Kiro IDE.");
      return;
    }
    outputCh.appendLine("[LM Test] vscode.lm namespace exists. Calling selectChatModels({})...");
    const allModels = await vscode.lm.selectChatModels({});
    outputCh.appendLine(`[LM Test] selectChatModels returned ${allModels.length} model(s)`);

    if (allModels.length === 0) {
      outputCh.appendLine("[LM Test] No models found.");
      vscode.window.showWarningMessage("vscode.lm API exists but returned 0 models.");
      return;
    }

    for (const m of allModels) {
      outputCh.appendLine(`  - ${m.vendor}/${m.family} id=${m.id} maxTokens=${m.maxInputTokens}`);
    }

    const pick = await vscode.window.showInformationMessage(
      `Found ${allModels.length} model(s). First: ${allModels[0].vendor}/${allModels[0].family}`,
      "Test Chat", "Cancel"
    );
    if (pick === "Test Chat") {
      await sendTestChat(allModels[0], outputCh);
    }
  } catch (err: any) {
    outputCh.appendLine(`[LM Test] EXCEPTION: ${err?.message || err}`);
    vscode.window.showErrorMessage(`LM API Error: ${err?.message || String(err)}`);
  }
}

async function sendTestChat(model: vscode.LanguageModelChat, outputCh: vscode.OutputChannel): Promise<void> {
  outputCh.appendLine(`[LM Test] Sending test request to ${model.id}...`);
  const messages = [vscode.LanguageModelChatMessage.User("Say hello in 10 words or less.")];
  const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
  let result = "";
  for await (const chunk of response.text) { result += chunk; }
  outputCh.appendLine(`[LM Test] Response: ${result}`);
  vscode.window.showInformationMessage(`LLM Response: ${result}`);
}

async function handleSetLlmApiKey(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration("sdlcAgents");
  const provider = config.get<string>("llmProvider", "anthropic");
  if (provider === "ollama") {
    vscode.window.showInformationMessage("Ollama does not require an API key.");
    return;
  }
  const apiKey = await vscode.window.showInputBox({
    prompt: `Enter API key for ${provider}`, password: true,
    placeHolder: provider === "anthropic" ? "sk-ant-..." : "sk-...",
    ignoreFocusOut: true,
  });
  if (!apiKey) { return; }
  await context.secrets.store(llmSecretKey(provider), apiKey);
  vscode.window.showInformationMessage(`${provider} API key stored securely.`);
}

async function handleClearLlmApiKey(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration("sdlcAgents");
  const provider = config.get<string>("llmProvider", "anthropic");
  if (provider === "ollama") {
    vscode.window.showInformationMessage("Ollama does not use stored API keys.");
    return;
  }
  // Delete both new and legacy keys so a stale pre-rename value cannot be
  // resurrected by migrate-on-read.
  await context.secrets.delete(llmSecretKey(provider));
  await context.secrets.delete(legacyLlmSecretKey(provider));
  vscode.window.showInformationMessage(`${provider} API key removed.`);
}
