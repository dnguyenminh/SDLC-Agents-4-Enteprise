/**
 * OnnxTokenizer --- simple tokenizer for ONNX models.
 */

/** SEC-324-02 hardening: reject oversized/non-file tokenizer reads (DoS cap). */
const MAX_TOKENIZER_BYTES = 100 * 1024 * 1024;

/** Guard the tokenizer file before the synchronous read. */
function assertReadableTokenizerFile(fs: typeof import("fs"), tokenizerPath: string): void {
  if (!tokenizerPath || tokenizerPath.includes("\0")) {
    throw new Error(`Invalid tokenizer path`);
  }
  const stat = fs.statSync(tokenizerPath);
  if (!stat.isFile() || stat.size > MAX_TOKENIZER_BYTES) {
    throw new Error(`Tokenizer file rejected (not a file or >100MB): ${tokenizerPath}`);
  }
}

export class OnnxTokenizer {
  private vocab: Map<string, number>;
  private reverseVocab: Map<number, string>;
  readonly vocabSize: number;
  readonly eosTokenId: number;

  private constructor(vocab: Map<string, number>, eosTokenId: number) {
    this.vocab = vocab;
    this.reverseVocab = new Map(Array.from(vocab.entries()).map(([k, v]) => [v, k]));
    this.vocabSize = vocab.size;
    this.eosTokenId = eosTokenId;
  }

  static async load(tokenizerPath: string): Promise<OnnxTokenizer> {
    const fs = await import("fs");
    assertReadableTokenizerFile(fs, tokenizerPath);
    const raw = fs.readFileSync(tokenizerPath, "utf-8");
    const config = JSON.parse(raw);
    const vocab = new Map<string, number>();
    const model = config.model || {};
    if (model.vocab) {
      for (const [token, id] of Object.entries(model.vocab)) { vocab.set(token, id as number); }
    } else if (config.added_tokens) {
      for (const token of config.added_tokens) { vocab.set(token.content, token.id); }
    }
    const eosId = vocab.get("<|end|>") ?? vocab.get("</s>") ?? vocab.get("<|endoftext|>") ?? 0;
    return new OnnxTokenizer(vocab, eosId);
  }

  encode(text: string): number[] {
    const tokens: number[] = [];
    const words = text.split(/(\s+)/);
    for (const word of words) {
      const id = this.vocab.get(word);
      if (id !== undefined) { tokens.push(id); }
      else { for (const char of word) { tokens.push(this.vocab.get(char) ?? 0); } }
    }
    return tokens;
  }

  decode(tokenIds: number[]): string {
    return tokenIds.map(id => this.reverseVocab.get(id) || "").join("");
  }
}
