import { LocalTransformersProvider } from "./adapters/embeddings/local-transformers.js";
import { VoyageEmbeddingProvider } from "./adapters/embeddings/voyage.js";
import Anthropic from "@anthropic-ai/sdk";
import { ClaudeReranker } from "./adapters/reranker/claude.js";
import { ClaudeCliReranker } from "./adapters/reranker/claude-cli.js";
import { NoopReranker } from "./adapters/reranker/noop.js";
import { OpenAiCompatReranker, PRESETS_LLM } from "./adapters/reranker/openai-compat.js";
import type { EmbeddingProvider } from "./ports/embedding-provider.js";
import type { Reranker } from "./ports/reranker.js";

const CHAVE_POR_PRESET: Record<keyof typeof PRESETS_LLM, string | undefined> = {
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  ollama: undefined,
};

/** Rótulo do reranker para /health e relatórios ("desativado" no modo só vetorial). */
export function descreverReranker(r: Reranker): string {
  return r instanceof ClaudeReranker || r instanceof OpenAiCompatReranker || r instanceof ClaudeCliReranker ? r.modelo : "desativado";
}

/**
 * RERANKER=claude|claude-cli|gemini|groq|openrouter|ollama|openai-compat|noop.
 * claude-cli usa o Claude Code local (`claude -p`, plano do usuário); modelo em CLAUDE_CLI_MODEL (padrão haiku).
 * Sem valor explícito: Claude se houver credencial Anthropic, senão Gemini se houver GEMINI_API_KEY, senão noop.
 * LLM_MODEL e LLM_BASE_URL sobrescrevem o preset (openai-compat exige LLM_BASE_URL).
 */
export function criarReranker(env: Env = process.env, cliente?: ConstructorParameters<typeof ClaudeReranker>[0]["cliente"]): Reranker {
  const tipo =
    env.RERANKER ?? (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN ? "claude" : env.GEMINI_API_KEY ? "gemini" : "noop");
  const avisar = (motivo: string, detalhe: string) => console.warn(`[reranker] resposta descartada: ${motivo} (${detalhe})`);
  if (tipo === "noop") return new NoopReranker();
  if (tipo === "claude-cli") return new ClaudeCliReranker({ ...(env.CLAUDE_CLI_MODEL ? { modelo: env.CLAUDE_CLI_MODEL } : {}), aoDescartar: avisar });
  if (tipo in PRESETS_LLM || tipo === "openai-compat") {
    const preset = tipo in PRESETS_LLM ? PRESETS_LLM[tipo as keyof typeof PRESETS_LLM] : undefined;
    const baseUrl = env.LLM_BASE_URL ?? preset?.baseUrl;
    if (!baseUrl) throw new Error("RERANKER=openai-compat exige LLM_BASE_URL");
    const variavelChave = preset ? CHAVE_POR_PRESET[tipo as keyof typeof PRESETS_LLM] : undefined;
    const apiKey = (variavelChave ? env[variavelChave] : undefined) ?? env.LLM_API_KEY ?? "";
    if (variavelChave && !apiKey) throw new Error(`RERANKER=${tipo} exige ${variavelChave}`);
    return new OpenAiCompatReranker({ baseUrl, apiKey, modelo: env.LLM_MODEL ?? preset?.modelo ?? "", aoDescartar: avisar });
  }
  if (tipo !== "claude") throw new Error(`RERANKER desconhecido: "${tipo}" (use claude, claude-cli, gemini, groq, openrouter, ollama, openai-compat ou noop)`);
  const esforco = env.ANTHROPIC_EFFORT as "low" | "medium" | "high" | "xhigh" | "max" | undefined;
  return new ClaudeReranker({
    cliente: cliente ?? new Anthropic(),
    ...(env.ANTHROPIC_MODEL ? { modelo: env.ANTHROPIC_MODEL } : {}),
    ...(esforco ? { esforco } : {}),
    aoDescartar: avisar,
  });
}

export type Env = Record<string, string | undefined>;

/** EMBEDDING_PROVIDER=voyage (padrão quando há VOYAGE_API_KEY) | local */
export function criarEmbeddingProvider(env: Env = process.env): EmbeddingProvider {
  const tipo = env.EMBEDDING_PROVIDER ?? (env.VOYAGE_API_KEY ? "voyage" : "local");
  switch (tipo) {
    case "voyage":
      return new VoyageEmbeddingProvider({ apiKey: env.VOYAGE_API_KEY ?? "", ...(env.VOYAGE_MODEL ? { modelo: env.VOYAGE_MODEL } : {}) });
    case "local":
      // bge-m3: melhor recuperação medida no dataset (top-10 vetorial 58% vs 40% do e5-small; ver report/eval.md).
      return new LocalTransformersProvider({ modelo: env.LOCAL_EMBEDDING_MODEL ?? "Xenova/bge-m3" });
    default:
      throw new Error(`EMBEDDING_PROVIDER desconhecido: "${tipo}" (use voyage ou local)`);
  }
}

/** Carrega o .env da raiz do repositório, se existir. Variáveis já definidas no ambiente têm prioridade. */
export function carregarEnv(arquivo: string): boolean {
  try {
    process.loadEnvFile(arquivo);
    return true;
  } catch {
    return false;
  }
}
