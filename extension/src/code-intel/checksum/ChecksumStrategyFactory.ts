/**
 * SA4E-241 — ChecksumStrategyFactory. Selects a strategy by source kind + git
 * availability (OCP: new sources add impls, callers stay unchanged).
 */
import type { ChecksumStrategy, PegaRuleChecksumInput, FileChecksumInput } from "./models/ChecksumModels";
import { PegaRuleChecksumStrategy } from "./PegaRuleChecksumStrategy";
import { GitBlobChecksumStrategy } from "./GitBlobChecksumStrategy";
import { FileContentFallbackStrategy } from "./FileContentFallbackStrategy";

/** Factory for per-source checksum strategies (NT-2). */
export class ChecksumStrategyFactory {
  /** Pega rule strategy (Source A CSV + Source B interpolated). */
  static forPega(): ChecksumStrategy<PegaRuleChecksumInput> {
    return new PegaRuleChecksumStrategy();
  }

  /**
   * File strategy (code non-Pega / document). git-blob when the repo is git,
   * otherwise the path-inclusive sha256 fallback.
   * @param kind - "code" or "document"
   * @param hasGit - whether the workspace is a git repo
   */
  static forFile(kind: "code" | "document", hasGit: boolean): ChecksumStrategy<FileChecksumInput> {
    return hasGit ? new GitBlobChecksumStrategy(kind) : new FileContentFallbackStrategy(kind);
  }
}
