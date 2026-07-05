/**
 * Converter helpers — size limits, format checks, text wrapping, and
 * local fallback conversion via filetomarkdown.
 */

import * as fs from "fs";

// --- Types ---

export interface ConversionResult {
    markdown: string;
    success: boolean;
    error: string | null;
    bytesProcessed: number;
    conversionTime: number;
}

// --- Constants ---

/** Size limits per format category (in bytes) */
export const SIZE_LIMITS: Record<string, number> = {
    pdf: 50 * 1024 * 1024,
    png: 20 * 1024 * 1024,
    jpg: 20 * 1024 * 1024,
    jpeg: 20 * 1024 * 1024,
    gif: 20 * 1024 * 1024,
    bmp: 20 * 1024 * 1024,
    webp: 20 * 1024 * 1024,
    svg: 20 * 1024 * 1024,
    default: 50 * 1024 * 1024,
};

/** Text-based formats that can be read directly */
const TEXT_FORMATS = new Set(["txt", "csv", "json", "xml", "yaml", "yml"]);

/** Conversion timeout in milliseconds */
export const CONVERSION_TIMEOUT_MS = 30000;

// --- Lazy-loaded filetomarkdown reference ---
let filetomarkdownModule: any = null;
let filetomarkdownLoadAttempted = false;

// --- Public API ---

export function isFileTooLarge(format: string, sizeBytes: number): boolean {
    const limit = SIZE_LIMITS[format.toLowerCase()] ?? SIZE_LIMITS.default;
    return sizeBytes > limit;
}

export function isTextFormat(format: string): boolean {
    return TEXT_FORMATS.has(format.toLowerCase());
}

export function wrapTextContent(content: string, format: string): string {
    const lang = format.toLowerCase() === "yml" ? "yaml" : format.toLowerCase();
    return `\`\`\`${lang}\n${content}\n\`\`\``;
}

export function readTextFile(filePath: string, format: string, fileSize: number, startTime: number): ConversionResult {
    try {
        const content = fs.readFileSync(filePath, "utf-8");
        return {
            markdown: wrapTextContent(content, format),
            success: true,
            error: null,
            bytesProcessed: fileSize,
            conversionTime: Date.now() - startTime,
        };
    } catch (err: any) {
        return {
            markdown: "",
            success: false,
            error: `Failed to read text file: ${err.message}`,
            bytesProcessed: fileSize,
            conversionTime: Date.now() - startTime,
        };
    }
}

/**
 * Lazy-load the filetomarkdown package.
 */
export function loadFileToMarkdown(): any {
    if (filetomarkdownModule) { return filetomarkdownModule; }
    if (filetomarkdownLoadAttempted) { return null; }
    filetomarkdownLoadAttempted = true;
    try {
        filetomarkdownModule = require("filetomarkdown");
        return filetomarkdownModule;
    } catch {
        return null;
    }
}

/**
 * Run filetomarkdown conversion with a timeout.
 */
export async function convertWithTimeout(ftm: any, filePath: string, timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Conversion timeout: file took longer than ${timeoutMs / 1000}s`));
        }, timeoutMs);

        const conversionPromise = typeof ftm.convert === "function"
            ? ftm.convert(filePath)
            : typeof ftm.default === "function"
                ? ftm.default(filePath)
                : typeof ftm === "function"
                    ? ftm(filePath)
                    : Promise.reject(new Error("filetomarkdown: no convert function found"));

        Promise.resolve(conversionPromise)
            .then((result: any) => {
                clearTimeout(timer);
                if (typeof result === "string") { resolve(result); }
                else if (result && typeof result.content === "string") { resolve(result.content); }
                else if (result && typeof result.markdown === "string") { resolve(result.markdown); }
                else { resolve(String(result || "")); }
            })
            .catch((err: any) => {
                clearTimeout(timer);
                reject(err);
            });
    });
}
