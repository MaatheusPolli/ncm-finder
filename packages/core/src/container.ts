import { readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { ClaudeReranker } from "./adapters/reranker/claude.js";
import { NoopReranker } from "./adapters/reranker/noop.js";
import { MemoryCache } from "./adapters/cache/memory.js";
import { PostgresCache } from "./adapters/cache/postgres.js";
import { carregarStoreDeArquivos } from "./adapters/vector/arquivo.js";
import { PgVectorStore } from "./adapters/vector/pgvector.js";
import { criarEmbeddingProvider, criarReranker, type Env } from "./config.js";
import { criarClassificador, type Classificador } from "./pipeline/classify.js";

export interface Container {
  classificar: Classificador;
  info: { modeloEmbedding: string; reranker: string; armazenamento: "pgvector" | "arquivo" };
  llmDisponivel: boolean;
  fechar: () => Promise<void>;
}

function ultimoArquivo(dir: string, padrao: RegExp): string {
  const nome = readdirSync(dir).filter((f) => padrao.test(f)).sort().at(-1);
  if (!nome) throw new Error(`Nenhum arquivo ${padrao} em ${dir}. Rode \`pnpm ingest\` e \`pnpm eval\`.`);
  return join(dir, nome);
}

/**
 * Com DATABASE_URL: pgvector + cache no Postgres.
 * Sem banco: NCMs e embeddings dos arquivos versionados em dirDados (a pasta data/ do repositório) (o modelo precisa ser o mesmo das consultas).
 */
export async function criarContainer(dirDados: string, env: Env = process.env): Promise<Container> {
  const embeddings = criarEmbeddingProvider(env);
  const reranker = criarReranker(env);
  const rotuloReranker = reranker instanceof ClaudeReranker ? reranker.modelo : "desativado";

  if (env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
    return {
      classificar: criarClassificador({ embeddings, vetores: new PgVectorStore(pool), reranker, cache: new PostgresCache(pool) }),
      info: { modeloEmbedding: embeddings.modelo, reranker: rotuloReranker, armazenamento: "pgvector" },
      llmDisponivel: !(reranker instanceof NoopReranker),
      fechar: () => pool.end(),
    };
  }

  const slug = embeddings.modelo.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const { store } = await carregarStoreDeArquivos(
    env.NCM_ARQUIVO ?? ultimoArquivo(join(dirDados, "ncm"), /^ncm-\d{4}-\d{2}-\d{2}\.json$/),
    env.EMBEDDINGS_ARQUIVO ?? join(dirDados, "embeddings", `${slug}.ncm.int8.bin`),
  );
  return {
    classificar: criarClassificador({ embeddings, vetores: store, reranker, cache: new MemoryCache() }),
    info: { modeloEmbedding: embeddings.modelo, reranker: rotuloReranker, armazenamento: "arquivo" },
    llmDisponivel: !(reranker instanceof NoopReranker),
    fechar: async () => {},
  };
}
