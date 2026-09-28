import type { SymbolOutlineExtractor } from './symbol-outline-extractor';
import type { TokenCounter } from './token-counter';
import type { ContextFile, DisclosureTier, RankedSymbol, RetrievalConfig } from './types';

export interface DisclosurePlan {
  contextFiles: ContextFile[];
  totalTokens: number;
  tier: DisclosureTier;
}

interface FileGroup {
  path: string;
  symbols: RankedSymbol[];
}

interface DisclosureDeps {
  counter: TokenCounter;
  extractor: SymbolOutlineExtractor;
  config: RetrievalConfig;
}

export class ProgressiveDisclosureManager {
  constructor(private readonly deps: DisclosureDeps) {}

  disclose(symbols: RankedSymbol[]): DisclosurePlan {
    const groups = groupByFile(symbols);
    const files = this.applySymbolTier(groups);
    this.applyChunkTier(files);
    const totalTokens = files.reduce((sum, file) => sum + file.tokens, 0);
    return { contextFiles: files, totalTokens, tier: this.highestTier(files) };
  }

  private applySymbolTier(groups: FileGroup[]): ContextFile[] {
    const files: ContextFile[] = [];
    let used = 0;
    for (const group of groups) {
      const outline = this.deps.extractor.extractOutline(
        group.path,
        group.symbols,
        this.deps.config.symbolTierTokens
      );
      const tokens = this.deps.counter.estimate(outline);
      if (used + tokens > this.deps.config.tokenBudget) continue;
      used += tokens;
      files.push({ path: group.path, outline, tokens, tier: 'symbol' });
    }
    return files;
  }

  private applyChunkTier(files: ContextFile[]): void {
    let remaining = this.deps.config.tokenBudget - files.reduce((sum, f) => sum + f.tokens, 0);
    for (const file of files) {
      const chunk = this.deps.extractor.extractChunk(
        file.path,
        this.deps.config.chunkLines,
        this.deps.config.chunkTierTokens
      );
      if (!chunk) continue;
      const chunkTokens = this.deps.counter.estimate(chunk);
      const cost = chunkTokens - file.tokens;
      if (cost <= 0 || cost > remaining) continue;
      remaining -= cost;
      file.outline = chunk;
      file.tokens = chunkTokens;
      file.tier = 'chunk';
    }
  }

  private highestTier(files: ContextFile[]): DisclosureTier {
    return files.some((f) => f.tier === 'chunk') ? 'chunk' : 'symbol';
  }
}

function groupByFile(symbols: RankedSymbol[]): FileGroup[] {
  const map = new Map<string, RankedSymbol[]>();
  for (const symbol of symbols) {
    const list = map.get(symbol.filePath) ?? [];
    list.push(symbol);
    map.set(symbol.filePath, list);
  }
  return Array.from(map.entries()).map(([path, list]) => ({ path, symbols: list }));
}
