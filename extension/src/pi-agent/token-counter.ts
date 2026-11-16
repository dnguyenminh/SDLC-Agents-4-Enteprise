/**
 * SA4E-422 — Provider-selected token counters (16K Doc §4).
 *
 * Strategy per provider family:
 *  - Local runtime providers (llama.cpp / LM Studio / Ollama / ONNX): EXACT count
 *    from the runtime `/tokenize` endpoint (see runtime-tokenizer.ts).
 *  - Hosted providers (openai, anthropic, google, ...): HEURISTIC estimate. No
 *    tokenizer dependency exists in package.json/lockfile (tiktoken & friends are
 *    absent) and adding a ~MB-sized BPE table to the extension bundle is not
 *    justified for a budget gate, so we ship a documented heuristic and keep the
 *    `TokenCounter` seam open for a real tokenizer later.
 *
 * Heuristic error (vs the provider's real tokenizer, mixed English prose + code):
 * roughly -10% / +25%. It UNDER-counts dense minified JSON and is only a rough
 * guide for CJK. Every non-ASCII char is counted as one full token to bias
 * toward over-counting for such text. Heuristic counts are therefore NOT fed
 * into the hard session gate (which keeps the SA4E-369 3-chars/token + 8% policy).
 * Hosted providers never receive a `/tokenize` request (no prompt leakage).
 */

import { measureRuntimeStaticTokens, tryRuntimeTokenCount } from './runtime-tokenizer';

export interface TokenCounter {
  readonly id: string;
  /** true = exact tokenizer count; false = heuristic estimate. */
  readonly exact: boolean;
  /** Documented upper relative error vs the real tokenizer (0 when exact). */
  readonly relativeError: number;
  /** Token count, or null when unavailable (caller falls back to estimates). */
  count(text: string): Promise<number | null>;
}

/** Chars-per-token calibration for one provider family. */
export interface HeuristicProfile {
  id: string;
  charsPerToken: number;
  /** Safety margin added on top of the raw estimate (0.1 = +10%). */
  margin: number;
}

/** Calibrations: prose ≈ 4 chars/token, code ≈ 3; chosen slightly conservative. */
export const HEURISTIC_PROFILES: Readonly<Record<string, HeuristicProfile>> = {
  openai: { id: 'heuristic-openai', charsPerToken: 3.5, margin: 0.1 },
  anthropic: { id: 'heuristic-anthropic', charsPerToken: 3.4, margin: 0.1 },
  google: { id: 'heuristic-google', charsPerToken: 3.8, margin: 0.1 },
};
/** Unknown hosted provider: same 3 chars/token as SA4E-369 `WIRE_CHARS_PER_TOKEN`. */
export const DEFAULT_PROFILE: HeuristicProfile = { id: 'heuristic-default', charsPerToken: 3, margin: 0.1 };

/** Providers served from a local runtime that may expose `/tokenize`. */
const RUNTIME_PROVIDERS: ReadonlySet<string> = new Set(['lmstudio', 'ollama', 'onnx', 'llamacpp', 'llama.cpp']);

export class HeuristicTokenCounter implements TokenCounter {
  readonly exact = false;
  readonly relativeError = 0.25;
  constructor(private readonly profile: HeuristicProfile) {}

  get id(): string {
    return this.profile.id;
  }

  async count(text: string): Promise<number | null> {
    return this.estimate(text);
  }

  /** Sync estimate: ASCII by chars-per-token, non-ASCII 1 token/char, then margin. */
  estimate(text: string): number {
    if (!text) return 0;
    // eslint-disable-next-line no-control-regex -- intentional ASCII range test
    const nonAscii = (text.match(/[^\x00-\x7f]/g) ?? []).length;
    const ascii = text.length - nonAscii;
    const raw = ascii / this.profile.charsPerToken + nonAscii;
    return Math.ceil(raw * (1 + this.profile.margin));
  }
}

export class RuntimeEndpointTokenCounter implements TokenCounter {
  readonly id = 'runtime-endpoint';
  readonly exact = true;
  readonly relativeError = 0;
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn?: typeof fetch,
  ) {}

  count(text: string): Promise<number | null> {
    return tryRuntimeTokenCount(text, { baseUrl: this.baseUrl, fetchFn: this.fetchFn });
  }
}

export interface CounterSelection {
  providerId?: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

/** Choose the counter for a provider. Unknown id + baseUrl keeps the SA4E-422 runtime probe. */
export function selectTokenCounter(sel: CounterSelection): TokenCounter {
  const id = sel.providerId?.toLowerCase();
  const isRuntime = id === undefined || RUNTIME_PROVIDERS.has(id);
  if (isRuntime && sel.baseUrl) return new RuntimeEndpointTokenCounter(sel.baseUrl, sel.fetchFn);
  return new HeuristicTokenCounter((id && HEURISTIC_PROFILES[id]) || DEFAULT_PROFILE);
}

/**
 * Static-context count for the session gate. Only EXACT counters feed the gate;
 * heuristic providers return undefined so the SA4E-369 conservative estimate
 * stays in force (and no /tokenize request leaves for hosted providers).
 */
export async function measureStaticTokensForProvider(
  sel: CounterSelection,
  files: ReadonlyArray<{ content: string }>,
  workspacePrompt: string,
): Promise<number | undefined> {
  if (!selectTokenCounter(sel).exact) return undefined;
  return measureRuntimeStaticTokens(sel.baseUrl, files, workspacePrompt, sel.fetchFn);
}