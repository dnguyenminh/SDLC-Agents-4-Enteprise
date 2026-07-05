/**
 * Multi-format document converter — backward-compatible entry point.
 * Delegates to Strategy-based converter/ module.
 */
export {
    ConversionResult,
    IFileConverter,
    FileConverterService,
    TextConverter,
    RemoteConverter,
    LocalFallbackConverter,
    convertFileToMarkdown,
    isFileTooLarge,
    isTextFormat,
    wrapTextContent,
} from "./converter/index";
 