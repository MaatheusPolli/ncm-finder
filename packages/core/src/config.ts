import { LocalTransformersProvider } from "./adapters/embeddings/local-transformers.js";
import { VoyageEmbeddingProvider } from "./adapters/embeddings/voyage.js";
import Anthropic from "@anthropic-ai/sdk";
import { ClaudeReranker } from "./adapters/reranker/claude.js";
import { NoopReranker } from "./adapters/reranker/noop.js";
import type { EmbeddingProvider } from "./ports/embedding-provider.js";
import type { Reranker } from "./ports/reranker.js";

/**
 * RERANKER=claude|noop. Sem valor explícito, usa Claude quando há credencial no ambiente
 * (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN); caso contrário, só o modo vetorial funciona.
 */
export function criarReranker(env: Env = process.env, cliente?: ConstructorParameters<typeof ClaudeReranker>[0]["cliente"]): Reranker {
  const tipo = env.RERANKER ?? (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN ? "claude" : "noop");
  if (tipo === "noop") return new NoopReranker();
  if (tipo !== "claude") throw new Error(`RERANKER desconhecido: "${tipo}" (use claude ou noop)`);
  const esforco = env.ANTHROPIC_EFFORT as "low" | "medium" | "high" | "xhigh" | "max" | undefined;
  return new ClaudeReranker({
    cliente: cliente ?? new Anthropic(),
    ...(env.ANTHROPIC_MODEL ? { modelo: env.ANTHROPIC_MODEL } : {}),
    ...(esforco ? { esforco } : {}),
    aoDescartar: (motivo, detalhe) => console.warn(`[reranker] resposta descartada: ${motivo} (${detalhe})`),
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
      return new LocalTransformersProvider(env.LOCAL_EMBEDDING_MODEL ? { modelo: env.LOCAL_EMBEDDING_MODEL } : {});
    default:
      throw new Error(`EMBEDDING_PROVIDER desconhecido: "${tipo}" (use voyage ou local)`);
  }
}
