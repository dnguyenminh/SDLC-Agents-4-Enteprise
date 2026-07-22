/**
 * Strategy: Converts files via the remote backend MCP endpoint.
 * Handles all non-text formats as first attempt.
 */
import * as fs from "fs";
import * as vscode from "vscode";
import { IFileConverter, ConversionResult } from "./IFileConverter";
import { httpPostJson } from "../utils/http-client-utils";

export class RemoteConverter implements IFileConverter {
    canConvert(_format: string): boolean {
        return true; // Attempts any format remotely
    }

    async convert(filePath: string, _format: string, token?: string): Promise<ConversionResult> {
        const startTime = Date.now();
        const fileSize = fs.statSync(filePath).size;

        const markdown = await this.callRemote(filePath, token);
        if (markdown !== null) {
            return {
                markdown,
                success: true,
                error: null,
                bytesProcessed: fileSize,
                conversionTime: Date.now() - startTime,
            };
        }

        return {
            markdown: "",
            success: false,
            error: "Remote conversion returned no result",
            bytesProcessed: fileSize,
            conversionTime: Date.now() - startTime,
        };
    }

    private async callRemote(filePath: string, token?: string): Promise<string | null> {
        const config = vscode.workspace.getConfiguration("kiroSdlc");
        const backendUrl = config.get<string>("backend.url") || "http://127.0.0.1:48721";

        let fileUri = filePath.replace(/\\/g, "/");
        if (!fileUri.startsWith("/")) { fileUri = "/" + fileUri; }
        const uri = `file://${fileUri}`;

        const payload = {
            tool_name: "execute_dynamic_tool",
            arguments: { toolName: "convert_to_markdown", arguments: { uri } },
        };

        const authHeaders: Record<string, string> = token ? { "Authorization": `Bearer ${token}` } : {};

        try {
            const parsed = await httpPostJson<{ content?: Array<{ type: string; text: string }> }>(
                `${backendUrl}/mcp/tools/call`,
                payload,
                { headers: authHeaders, timeoutMs: 30000 }
            );
            if (parsed?.content && Array.isArray(parsed.content)) {
                const textObj = parsed.content.find((c) => c.type === "text");
                if (textObj && typeof textObj.text === "string") {
                    return textObj.text;
                }
            }
            return null;
        } catch (err) {
            console.warn(`[RemoteConverter] callRemote failed: ${(err as Error).message}`);
            return null;
        }
    }
}
