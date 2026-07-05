/**
 * Strategy: Handles text-based formats (txt, csv, json, xml, yaml, yml).
 * Reads file content directly and wraps in markdown code fences.
 */
import * as fs from "fs";
import { IFileConverter, ConversionResult } from "./IFileConverter";

const TEXT_FORMATS = new Set(["txt", "csv", "json", "xml", "yaml", "yml"]);

export class TextConverter implements IFileConverter {
    canConvert(format: string): boolean {
        return TEXT_FORMATS.has(format.toLowerCase());
    }

    async convert(filePath: string, format: string): Promise<ConversionResult> {
        const startTime = Date.now();
        const fileSize = fs.statSync(filePath).size;

        try {
            const content = fs.readFileSync(filePath, "utf-8");
            const lang = format.toLowerCase() === "yml" ? "yaml" : format.toLowerCase();
            const markdown = `\`\`\`${lang}\n${content}\n\`\`\``;

            return {
                markdown,
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
}
