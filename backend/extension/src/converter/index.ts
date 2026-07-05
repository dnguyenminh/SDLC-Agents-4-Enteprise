/**
 * Barrel export + backward-compatible convertFileToMarkdown function.
 */
export { ConversionResult, IFileConverter } from "./IFileConverter";
export { TextConverter } from "./TextConverter";
export { RemoteConverter } from "./RemoteConverter";
export { LocalFallbackConverter } from "./LocalFallbackConverter";
export { FileConverterService } from "./FileConverterService";

import { FileConverterService } from "./FileConverterService";
import { ConversionResult } from "./IFileConverter";

// Re-export helpers needed by external code
export { isFileTooLarge, isTextFormat, wrapTextContent } from "../converter-helpers";

// Singleton instance for backward compatibility
let _instance: FileConverterService | null = null;

function getInstance(): FileConverterService {
    if (!_instance) { _instance = new FileConverterService(); }
    return _instance;
}

/**
 * Backward-compatible wrapper — delegates to FileConverterService singleton.
 */
export async function convertFileToMarkdown(
    filePath: string, format: string, token?: string
): Promise<ConversionResult> {
    return getInstance().convert(filePath, format, token);
}
