/**
 * SA4E-241 — FileContentFallbackStrategy (Source C/D, used when NO git repo).
 * Formula: sha256(relativePath + NUL(\0) + fileContent). The path is included so
 * two files with identical content but different paths get different checksums.
 */
import * as crypto from "crypto";
import type { ChecksumStrategy, FileChecksumInput, ChecksumSourceKind } from "./models/ChecksumModels";

/** sha256 over relativePath + NUL separator + content (no git available). */
export class FileContentFallbackStrategy implements ChecksumStrategy<FileChecksumInput> {
  readonly sourceKind: ChecksumSourceKind;

  /** @param kind - "code" or "document" (both share the fallback formula). */
  constructor(kind: "code" | "document") {
    this.sourceKind = kind;
  }

  /** @inheritdoc */
  compute(input: FileChecksumInput): string {
    // NUL (0x00) separates path from content so path is part of the digest.
    const payload = Buffer.concat([
      Buffer.from(input.relativePath, "utf-8"),
      Buffer.from([0x00]),
      Buffer.from(input.content, "utf-8"),
    ]);
    return crypto.createHash("sha256").update(payload).digest("hex");
  }
}
