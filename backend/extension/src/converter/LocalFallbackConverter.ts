/**
 * Strategy: Local fallback using filetomarkdown package.
 * Handles binary formats when remote conversion fails.
 */
import * as fs from "fs";
import { IFileConverter, ConversionResult } from "./IFileConverter";

const CONVERSION_TIMEOUT_MS = 30000;

let filetomarkdownModule: any = null;
let filetomarkdownLoadAttempted = false;

export class LocalFallbackConverter implements IFileConverter {
    canConvert(_format: string): boolean {
        return true; // Fallback for any format
    }

    async convert(filePath: string, _format: string): Promise<ConversionResult> {
        const startTime = Date.now();
        const fileSize = fs.statSync(filePath).size;

        const ftm = this.loadFileToMarkdown();
        if (!ftm) {
            return {
                markdown: "",
                success: false,
                error: "filetomarkdown package unavailable — cannot convert binary formats. Install with: npm install filetomarkdown",
                bytesProcessed: fileSize,
                conversionTime: Date.now() - startTime,
            };
        }

        try {
            const markdown = await this.convertWithTimeout(ftm, filePath);
            if (!markdown || markdown.trim().length === 0) {
                return {
                    markdown: "",
                    success: false,
                    error: "Conversion returned empty content",
                    bytesProcessed: fileSize,
                    conversionTime: Date.now() - startTime,
                };
            }
            return { markdown, success: true, error: null, bytesProcessed: fileSize, conversionTime: Date.now() - startTime };
        } catch (err: any) {
            const isTimeout = err.message?.includes("timeout");
            const error = isTimeout
                ? `Conversion timeout: exceeded ${CONVERSION_TIMEOUT_MS / 1000}s limit`
                : `Conversion failed: ${err.message}`;
            return { markdown: "", success: false, error, bytesProcessed: fileSize, conversionTime: Date.now() - startTime };
        }
    }

    private loadFileToMarkdown(): any {
        if (filetomarkdownModule) { return filetomarkdownModule; }
        if (filetomarkdownLoadAttempted) { return null; }
        filetomarkdownLoadAttempted = true;
        try {
            filetomarkdownModule = require("filetomarkdown");
            return filetomarkdownModule;
        } catch { return null; }
    }

    private async convertWithTimeout(ftm: any, filePath: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Conversion timeout: file took longer than ${CONVERSION_TIMEOUT_MS / 1000}s`));
            }, CONVERSION_TIMEOUT_MS);

            const promise = typeof ftm.convert === "function"
                ? ftm.convert(filePath)
                : typeof ftm.default === "function"
                    ? ftm.default(filePath)
                    : typeof ftm === "function"
                        ? ftm(filePath)
                        : Promise.reject(new Error("filetomarkdown: no convert function found"));

            Promise.resolve(promise)
                .then((result: any) => {
                    clearTimeout(timer);
                    if (typeof result === "string") { resolve(result); }
                    else if (result && typeof result.content === "string") { resolve(result.content); }
                    else if (result && typeof result.markdown === "string") { resolve(result.markdown); }
                    else { resolve(String(result || "")); }
                })
                .catch((err: any) => { clearTimeout(timer); reject(err); });
        });
    }
}
