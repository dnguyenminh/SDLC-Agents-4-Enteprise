/**
 * Strategy: Converts files via the remote backend MCP endpoint.
 * Handles all non-text formats as first attempt.
 */
import * as fs from "fs";
import * as http from "http";
import * as vscode from "vscode";
import { IFileConverter, ConversionResult } from "./IFileConverter";

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

        const body = JSON.stringify(payload);
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body).toString(),
        };
        if (token) { headers["Authorization"] = `Bearer ${token}`; }

        return new Promise<string | null>((resolve) => {
            const req = http.request(`${backendUrl}/mcp/tools/call`, {
                method: "POST", headers, timeout: 30000,
            }, (res) => {
                let data = "";
                res.on("data", chunk => { data += chunk; });
                res.on("end", () => {
                    if (res.statusCode === 200) {
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed?.content && Array.isArray(parsed.content)) {
                                const textObj = parsed.content.find((c: any) => c.type === "text");
                                if (textObj && typeof textObj.text === "string") {
                                    resolve(textObj.text);
                                    return;
                                }
                            }
                            resolve(null);
                        } catch { resolve(null); }
                    } else { resolve(null); }
                });
            });
            req.on("error", () => resolve(null));
            req.write(body);
            req.end();
        });
    }
}
