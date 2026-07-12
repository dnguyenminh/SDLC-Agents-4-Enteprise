/**
 * Provider Registry — Data-driven LLM provider definitions.
 * Comprehensive list matching OpenCode/litellm ecosystem (150+ providers).
 * All OpenAI-compatible providers use the same OpenAIProvider with different base URLs.
 */

type ApiType = "anthropic" | "openai-compatible" | "ollama" | "onnx" | "none";
type ProviderCategory = "cloud" | "gateway" | "local" | "enterprise";

export interface ProviderDef {
  id: string;
  label: string;
  category: ProviderCategory;
  apiType: ApiType;
  baseUrl: string;
  requiresApiKey: boolean;
}

/** Full provider registry — alphabetical, matching OpenCode/litellm */
export const PROVIDER_REGISTRY: ProviderDef[] = [
  // === Major Providers ===
  { id: "anthropic", label: "Anthropic", category: "cloud", apiType: "anthropic", baseUrl: "https://api.anthropic.com", requiresApiKey: true },
  { id: "openai", label: "OpenAI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.openai.com/v1", requiresApiKey: true },
  { id: "google", label: "Google AI (Gemini)", category: "cloud", apiType: "openai-compatible", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", requiresApiKey: true },
  { id: "deepseek", label: "DeepSeek", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.deepseek.com/v1", requiresApiKey: true },
  { id: "mistral", label: "Mistral", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.mistral.ai/v1", requiresApiKey: true },
  { id: "xai", label: "xAI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.x.ai/v1", requiresApiKey: true },
  // === Fast Inference ===
  { id: "groq", label: "Groq", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.groq.com/openai/v1", requiresApiKey: true },
  { id: "cerebras", label: "Cerebras", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.cerebras.ai/v1", requiresApiKey: true },
  { id: "sambanova", label: "SambaNova", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.sambanova.ai/v1", requiresApiKey: true },
  { id: "fireworks", label: "Fireworks AI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.fireworks.ai/inference/v1", requiresApiKey: true },
  { id: "together", label: "Together AI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.together.xyz/v1", requiresApiKey: true },
  { id: "friendli", label: "Friendli", category: "cloud", apiType: "openai-compatible", baseUrl: "https://inference.friendli.ai/v1", requiresApiKey: true },
  // === Cloud Providers (A-Z) ===
  { id: "302ai", label: "302.AI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.302.ai/v1", requiresApiKey: true },
  { id: "abacus", label: "Abacus", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.abacus.ai/v1", requiresApiKey: true },
  { id: "abliteration", label: "abliteration.ai", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.abliteration.ai/v1", requiresApiKey: true },
  { id: "aihubmix", label: "AIHubMix", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.aihubmix.com/v1", requiresApiKey: true },
  { id: "alibaba", label: "Alibaba (Qwen)", category: "cloud", apiType: "openai-compatible", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", requiresApiKey: true },
  { id: "ambient", label: "Ambient", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.ambient.ai/v1", requiresApiKey: true },
  { id: "anyapi", label: "AnyAPI", category: "gateway", apiType: "openai-compatible", baseUrl: "https://api.anyapi.io/v1", requiresApiKey: true },
  { id: "atomic-chat", label: "Atomic Chat", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.atomic.chat/v1", requiresApiKey: true },
  { id: "auriko", label: "Auriko", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.auriko.com/v1", requiresApiKey: true },
  { id: "bailing", label: "Bailing", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.bailing.ai/v1", requiresApiKey: true },
  { id: "baseten", label: "Baseten", category: "cloud", apiType: "openai-compatible", baseUrl: "https://bridge.baseten.co/v1", requiresApiKey: true },
  { id: "berget", label: "Berget.AI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.berget.ai/v1", requiresApiKey: true },
  { id: "chutes", label: "Chutes", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.chutes.ai/v1", requiresApiKey: true },
  { id: "clarifai", label: "Clarifai", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.clarifai.com/v1", requiresApiKey: true },
  { id: "claudinio", label: "Claudinio", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.claudinio.com/v1", requiresApiKey: true },
  { id: "cloudferro", label: "CloudFerro Sherlock", category: "cloud", apiType: "openai-compatible", baseUrl: "https://sherlock.cloudferro.com/v1", requiresApiKey: true },
  { id: "cohere", label: "Cohere", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.cohere.com/v2", requiresApiKey: true },
  { id: "cortecs", label: "Cortecs", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.cortecs.ai/v1", requiresApiKey: true },
  { id: "crofai", label: "CrofAI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.crofai.com/v1", requiresApiKey: true },
  { id: "drun", label: "D.Run (China)", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.d.run/v1", requiresApiKey: true },
  { id: "deep-infra", label: "Deep Infra", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.deepinfra.com/v1/openai", requiresApiKey: true },
  { id: "digitalocean", label: "DigitalOcean", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.digitalocean.com/v1", requiresApiKey: true },
  { id: "dinference", label: "DInference", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.dinference.com/v1", requiresApiKey: true },
  { id: "evroc", label: "evroc", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.evroc.com/v1", requiresApiKey: true },
  { id: "freemodel", label: "FreeModel", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.freemodel.ai/v1", requiresApiKey: false },
  { id: "frogbot", label: "FrogBot", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.frogbot.ai/v1", requiresApiKey: true },
  { id: "github-models", label: "GitHub Models", category: "cloud", apiType: "openai-compatible", baseUrl: "https://models.inference.ai.azure.com", requiresApiKey: true },
  { id: "gitlab-duo", label: "GitLab Duo", category: "cloud", apiType: "openai-compatible", baseUrl: "", requiresApiKey: true },
  { id: "gmi-cloud", label: "GMI Cloud", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.gmi.ai/v1", requiresApiKey: true },
  { id: "helicone", label: "Helicone", category: "gateway", apiType: "openai-compatible", baseUrl: "https://oai.helicone.ai/v1", requiresApiKey: true },
  { id: "hpc-ai", label: "HPC-AI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.hpc-ai.com/v1", requiresApiKey: true },
  { id: "huggingface", label: "Hugging Face", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api-inference.huggingface.co/v1", requiresApiKey: true },
  { id: "hyperbolic", label: "Hyperbolic", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.hyperbolic.xyz/v1", requiresApiKey: true },
  { id: "iflow", label: "iFlow", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.iflow.ai/v1", requiresApiKey: true },
  { id: "inception", label: "Inception", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.inception.ai/v1", requiresApiKey: true },
  { id: "inceptron", label: "Inceptron", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.inceptron.ai/v1", requiresApiKey: true },
  { id: "inference", label: "Inference", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.inference.net/v1", requiresApiKey: true },
  { id: "ionet", label: "IO.NET", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.io.net/v1", requiresApiKey: true },
  { id: "jiekou", label: "Jiekou.AI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.jiekou.ai/v1", requiresApiKey: true },
  { id: "kenari", label: "Kenari", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.kenari.ai/v1", requiresApiKey: true },
  { id: "kimi", label: "Kimi For Coding", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.moonshot.cn/v1", requiresApiKey: true },
  { id: "kuae", label: "KUAE Cloud", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.kuae.cloud/v1", requiresApiKey: true },
  { id: "lilac", label: "Lilac", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.lilac.ai/v1", requiresApiKey: true },
  { id: "llama", label: "Llama (Meta)", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.llama-api.com/v1", requiresApiKey: true },
  { id: "llm-gateway", label: "LLM Gateway", category: "gateway", apiType: "openai-compatible", baseUrl: "", requiresApiKey: true },
  { id: "llmtr", label: "LLMTR", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.llmtr.com/v1", requiresApiKey: true },
  { id: "longcat", label: "LongCat", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.longcat.ai/v1", requiresApiKey: true },
  { id: "lucidquery", label: "LucidQuery", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.lucidquery.com/v1", requiresApiKey: true },
  { id: "meganova", label: "Meganova", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.meganova.ai/v1", requiresApiKey: true },
  { id: "minimax", label: "MiniMax", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.minimax.chat/v1", requiresApiKey: true },
  { id: "mixlayer", label: "Mixlayer", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.mixlayer.ai/v1", requiresApiKey: true },
  { id: "moark", label: "Moark", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.moark.ai/v1", requiresApiKey: true },
  { id: "modelscope", label: "ModelScope", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.modelscope.cn/v1", requiresApiKey: true },
  { id: "moonshot", label: "Moonshot AI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.moonshot.cn/v1", requiresApiKey: true },
  { id: "morph", label: "Morph", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.morph.so/v1", requiresApiKey: true },
  { id: "nanogpt", label: "NanoGPT", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.nanogpt.com/v1", requiresApiKey: true },
  { id: "near-ai", label: "NEAR AI Cloud", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.near.ai/v1", requiresApiKey: true },
  { id: "nebius", label: "Nebius", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.studio.nebius.ai/v1", requiresApiKey: true },
  { id: "neon", label: "Neon", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.neon.ai/v1", requiresApiKey: true },
  { id: "neuralwatt", label: "Neuralwatt", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.neuralwatt.com/v1", requiresApiKey: true },
  { id: "nova", label: "Nova", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.nova.ai/v1", requiresApiKey: true },
  { id: "novita", label: "NovitaAI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.novita.ai/v3/openai", requiresApiKey: true },
  { id: "nvidia", label: "Nvidia", category: "cloud", apiType: "openai-compatible", baseUrl: "https://integrate.api.nvidia.com/v1", requiresApiKey: true },
  { id: "perplexity", label: "Perplexity", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.perplexity.ai", requiresApiKey: true },
  { id: "poe", label: "Poe", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.poe.com/v1", requiresApiKey: true },
  { id: "poolside", label: "Poolside", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.poolside.ai/v1", requiresApiKey: true },
  { id: "privatemode", label: "Privatemode AI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.privatemode.ai/v1", requiresApiKey: true },
  { id: "qihang", label: "QiHang", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.qihang.ai/v1", requiresApiKey: true },
  { id: "qiniu", label: "Qiniu", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.qiniu.com/v1", requiresApiKey: true },
  { id: "regolo", label: "Regolo AI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.regolo.ai/v1", requiresApiKey: true },
  { id: "requesty", label: "Requesty", category: "gateway", apiType: "openai-compatible", baseUrl: "https://api.requesty.ai/v1", requiresApiKey: true },
  { id: "routing-run", label: "routing.run", category: "gateway", apiType: "openai-compatible", baseUrl: "https://api.routing.run/v1", requiresApiKey: true },
  { id: "sakana", label: "Sakana AI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.sakana.ai/v1", requiresApiKey: true },
  { id: "sap-ai", label: "SAP AI Core", category: "enterprise", apiType: "openai-compatible", baseUrl: "", requiresApiKey: true },
  { id: "sarvam", label: "Sarvam AI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.sarvam.ai/v1", requiresApiKey: true },
  { id: "scaleway", label: "Scaleway", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.scaleway.ai/v1", requiresApiKey: true },
  { id: "siliconflow", label: "SiliconFlow", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.siliconflow.cn/v1", requiresApiKey: true },
  { id: "snowflake", label: "Snowflake Cortex", category: "enterprise", apiType: "openai-compatible", baseUrl: "", requiresApiKey: true },
  { id: "stackit", label: "STACKIT", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.stackit.cloud/v1", requiresApiKey: true },
  { id: "stepfun", label: "StepFun", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.stepfun.com/v1", requiresApiKey: true },
  { id: "subconscious", label: "Subconscious", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.subconscious.ai/v1", requiresApiKey: true },
  { id: "submodel", label: "submodel", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.submodel.ai/v1", requiresApiKey: true },
  { id: "synthetic", label: "Synthetic", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.synthetic.ai/v1", requiresApiKey: true },
  { id: "tencent", label: "Tencent", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.hunyuan.cloud.tencent.com/v1", requiresApiKey: true },
  { id: "the-grid", label: "The Grid AI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.thegrid.ai/v1", requiresApiKey: true },
  { id: "tinfoil", label: "Tinfoil", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.tinfoil.sh/v1", requiresApiKey: true },
  { id: "trustedrouter", label: "TrustedRouter", category: "gateway", apiType: "openai-compatible", baseUrl: "https://api.trustedrouter.ai/v1", requiresApiKey: true },
  { id: "umans", label: "Umans AI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.umans.ai/v1", requiresApiKey: true },
  { id: "upstage", label: "Upstage", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.upstage.ai/v1/solar", requiresApiKey: true },
  { id: "v0", label: "v0", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.v0.dev/v1", requiresApiKey: true },
  { id: "venice", label: "Venice AI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.venice.ai/api/v1", requiresApiKey: true },
  { id: "vercel-ai", label: "Vercel AI Gateway", category: "gateway", apiType: "openai-compatible", baseUrl: "", requiresApiKey: true },
  { id: "vertex", label: "Vertex AI (Google)", category: "enterprise", apiType: "openai-compatible", baseUrl: "", requiresApiKey: true },
  { id: "vivgrid", label: "Vivgrid", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.vivgrid.com/v1", requiresApiKey: true },
  { id: "vultr", label: "Vultr", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.vultrinference.com/v1", requiresApiKey: true },
  { id: "wafer", label: "Wafer", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.wafer.ai/v1", requiresApiKey: true },
  { id: "weights-biases", label: "Weights & Biases", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.wandb.ai/v1", requiresApiKey: true },
  { id: "xiaomi", label: "Xiaomi", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.xiaomi.com/v1", requiresApiKey: true },
  { id: "xpersona", label: "Xpersona", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.xpersona.ai/v1", requiresApiKey: true },
  { id: "zai", label: "Z.AI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.z.ai/v1", requiresApiKey: true },
  { id: "zeldoc", label: "Zeldoc", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.zeldoc.ai/v1", requiresApiKey: true },
  { id: "zenmux", label: "ZenMux", category: "gateway", apiType: "openai-compatible", baseUrl: "https://api.zenmux.ai/v1", requiresApiKey: true },
  { id: "zhipu", label: "Zhipu AI", category: "cloud", apiType: "openai-compatible", baseUrl: "https://open.bigmodel.cn/api/paas/v4", requiresApiKey: true },
  // === Enterprise ===
  { id: "azure", label: "Azure OpenAI", category: "enterprise", apiType: "openai-compatible", baseUrl: "", requiresApiKey: true },
  { id: "azure-cognitive", label: "Azure Cognitive Services", category: "enterprise", apiType: "openai-compatible", baseUrl: "", requiresApiKey: true },
  { id: "aws-bedrock", label: "Amazon Bedrock", category: "enterprise", apiType: "openai-compatible", baseUrl: "", requiresApiKey: true },
  { id: "databricks", label: "Databricks", category: "enterprise", apiType: "openai-compatible", baseUrl: "", requiresApiKey: true },
  { id: "ovhcloud", label: "OVHcloud AI Endpoints", category: "enterprise", apiType: "openai-compatible", baseUrl: "", requiresApiKey: true },
  // === Gateways / Routers ===
  { id: "openrouter", label: "OpenRouter", category: "gateway", apiType: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1", requiresApiKey: true },
  { id: "orcarouter", label: "OrcaRouter", category: "gateway", apiType: "openai-compatible", baseUrl: "https://api.orcarouter.com/v1", requiresApiKey: true },
  { id: "cloudflare", label: "Cloudflare AI Gateway", category: "gateway", apiType: "openai-compatible", baseUrl: "", requiresApiKey: true },
  { id: "cloudflare-workers", label: "Cloudflare Workers AI", category: "gateway", apiType: "openai-compatible", baseUrl: "", requiresApiKey: true },
  { id: "fastrouter", label: "FastRouter", category: "gateway", apiType: "openai-compatible", baseUrl: "https://api.fastrouter.ai/v1", requiresApiKey: true },
  { id: "merge-gateway", label: "Merge Gateway", category: "gateway", apiType: "openai-compatible", baseUrl: "https://api.merge.ai/v1", requiresApiKey: true },
  { id: "kilo-gateway", label: "Kilo Gateway", category: "gateway", apiType: "openai-compatible", baseUrl: "", requiresApiKey: true },
  // === Local Providers ===
  { id: "ollama", label: "Ollama", category: "local", apiType: "ollama", baseUrl: "http://localhost:11434", requiresApiKey: false },
  { id: "ollama-cloud", label: "Ollama Cloud", category: "cloud", apiType: "openai-compatible", baseUrl: "https://api.ollama.com/v1", requiresApiKey: true },
  { id: "lmstudio", label: "LMStudio", category: "local", apiType: "openai-compatible", baseUrl: "http://localhost:1234/v1", requiresApiKey: false },
  { id: "llamacpp", label: "llama.cpp", category: "local", apiType: "openai-compatible", baseUrl: "http://localhost:8080/v1", requiresApiKey: false },
  { id: "vllm", label: "vLLM", category: "local", apiType: "openai-compatible", baseUrl: "http://localhost:8000/v1", requiresApiKey: false },
  { id: "onnx", label: "ONNX Runtime", category: "local", apiType: "onnx", baseUrl: "", requiresApiKey: false },
  // === Internal ===
  { id: "kiro", label: "Kiro Gateway", category: "gateway", apiType: "anthropic", baseUrl: "http://127.0.0.1:8990/anthropic", requiresApiKey: false },
  // === Custom (user provides base URL) ===
  { id: "other", label: "Other (Custom provider)", category: "cloud", apiType: "openai-compatible", baseUrl: "", requiresApiKey: true },
];

/** Get provider definition by ID */
export function getProviderDef(id: string): ProviderDef | undefined {
  return PROVIDER_REGISTRY.find(p => p.id === id);
}

/** Get providers grouped by category */
export function getProvidersByCategory(): Record<ProviderCategory, ProviderDef[]> {
  const result: Record<ProviderCategory, ProviderDef[]> = { cloud: [], gateway: [], local: [], enterprise: [] };
  for (const p of PROVIDER_REGISTRY) { result[p.category].push(p); }
  return result;
}
