/**
 * Facade + Chain of Responsibility for file conversion.
 * Tries each converter strategy in order until one succeeds.
 */
import * as fs from "fs";
import { IFileConverter, ConversionResult } from "./IFileConverter";
import { TextConverter } from "./TextConverter";
import { RemoteConverter } from "./RemoteConverter";
import { LocalFallbackConverter } from "./LocalFallbackConverter";

const SIZE_LIMITS: Record<string, number> = {
    pdf: 50 * 1024 * 1024,
    png: 20 * 1024 * 1024, jpg: 20 * 1024 * 1024, jpeg: 20 * 1024 * 1024,
    gif: 20 * 1024 * 1024, bmp: 20 * 1024 * 1024, webp: 20 * 1024 * 1024,
    svg: 20 * 1024 * 1024, default: 50 * 1024 * 1024,
};

export class FileConverterService {
    private readonly converters: IFileConverter[];

    constructor() {
        this.converters = [
            new TextConverter(),
            new RemoteConverter(),
            new LocalFallbackConverter(),
        ];
    }

    async convert(filePath: string, format: string, token?: string): Promise<ConversionResult> {
        const startTime = Date.now();

        // Step 1: Check file exists and get size
        let fileSize: number;
        try {
            const stat = fs.statSync(filePath);
            fileSize = stat.size;
        } catch (err: any) {
            return this.failure(`File not found or inaccessible: ${err.code || err.message}`, 0, startTime);
        }

        // Step 2: Check size limit
        const limit = SIZE_LIMITS[format.toLowerCase()] ?? SIZE_LIMITS.default;
        if (fileSize > limit) {
            const limitMB = (limit / (1024 * 1024)).toFixed(0);
            const fileMB = (fileSize / (1024 * 1024)).toFixed(1);
            return this.failure(`Exceeds size limit: ${fileMB}MB > ${limitMB}MB limit for .${format}`, fileSize, startTime);
        }

        // Step 3: Try each converter in order — return first success
        for (const converter of this.converters) {
            if (!converter.canConvert(format)) { continue; }
            const result = await converter.convert(filePath, format, token);
            if (result.success) { return result; }
        }

        return this.failure("All converters failed", fileSize, startTime);
    }

    private failure(error: string, bytesProcessed: number, startTime: number): ConversionResult {
        return { markdown: "", success: false, error, bytesProcessed, conversionTime: Date.now() - startTime };
    }
}
