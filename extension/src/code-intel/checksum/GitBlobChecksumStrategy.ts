/**
 * SA4E-241 — GitBlobChecksumStrategy (code non-Pega + document — Source C/D).
 * git blob hash: sha1("blob " + byteLength + "\0" + content), computed IN-PROCESS
 * with `crypto` (SEC-07: NO `git hash-object` shell-out → no OS command injection).
 * Preferred when the workspace is a git repo (matches `git hash-object` exactly).
 */
import * as crypto from "crypto";
import type { ChecksumStrategy, FileChecksumInput, ChecksumSourceKind } from "./models/ChecksumModels";

/** git object header + content sha1 — identical to `git hash-object <file>`. */
export class GitBlobChecksumStrategy implements ChecksumStrategy<FileChecksumInput> {
  readonly sourceKind: ChecksumSourceKind;

  /** @param kind - "code" or "document" (both share the git-blob formula). */
  constructor(kind: "code" | "document") {
    this.sourceKind = kind;
  }

  /** @inheritdoc */
  compute(input: FileChecksumInput): string {
    const bytes = Buffer.from(input.content, "utf-8");
    // git blob object: header "blob <byteLength>\0" then the raw content bytes.
    const header = `blob ${bytes.length}\0`;
    return crypto.createHash("sha1").update(header).update(bytes).digest("hex");
  }
}
