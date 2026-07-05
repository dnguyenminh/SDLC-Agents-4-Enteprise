/**
 * Strategy interface for file conversion.
 */
export interface ConversionResult {
    markdown: string;
    success: boolean;
    error: string | null;
    bytesProcessed: number;
    conversionTime: number;
}

export interface IFileConverter {
    canConvert(format: string): boolean;
    convert(filePath: string, format: string, token?: string): Promise<ConversionResult>;
}
