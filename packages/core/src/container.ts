import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { MemoryCache } from "./adapters/cache/memory.js";
import { PostgresCache } from "./adapters/cache/postgres.js";
import { NoopReranker } from "./adapters/reranker/noop.js";
import { carregarStoreDeArquivos } from "./adapters/vector/arquivo.js";
import { PgVectorStore } from "./adapters/vector/pgvector.js";
import { criarEmbeddingProvider, criarReranker, descreverReranker, type Env } from "./config.js";
import type { Ncm } from "./domain/ncm.js";
import { Bm25Baseline } from "./eval/baseline-bm25.js";
import { criarClassificador, type Classificador } from "./pipeline/classify.js";

export interface Container {
  classificar: Classificador;
  info: { modeloEmbedding: string; reranker: string; armazenamento: "pgvector" | "arquivo"; busca: "hibrida" | "vetorial" };
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
 * Sem banco: NCMs e embeddings dos arquivos versionados em dirDados (a pasta data/ do repositório);
 * o modelo de embedding precisa ser o mesmo usado para gerar os arquivos.
 * BUSCA=hibrida (padrão: BM25 + vetorial por RRF, índice BM25 montado do data/ncm/ncm-*.json) | vetorial.
 */
export async function criarContainer(dirDados: string, env: Env = process.env): Promise<Container> {
  const embeddings = criarEmbeddingProvider(env);
  const reranker = criarReranker(env);
  const busca = env.BUSCA === "vetorial" ? "vetorial" : "hibrida";
  const base = { modeloEmbedding: embeddings.modelo, reranker: descreverReranker(reranker), busca } as const;
  const llmDisponivel = !(reranker instanceof NoopReranker);
  const arquivoNcm = () => env.NCM_ARQUIVO ?? ultimoArquivo(join(dirDados, "ncm"), /^ncm-\d{4}-\d{2}-\d{2}\.json$/);
  const lexicaDe = (ncms: Ncm[]) => (busca === "hibrida" ? { lexica: new Bm25Baseline(ncms).comoBuscaLexica() } : {});

  if (env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
    const lexica = busca === "hibrida" ? lexicaDe((JSON.parse(await readFile(arquivoNcm(), "utf8")) as { ncms: Ncm[] }).ncms) : {};
    return {
      classificar: criarClassificador({ embeddings, vetores: new PgVectorStore(pool), reranker, cache: new PostgresCache(pool), ...lexica }),
      info: { ...base, armazenamento: "pgvector" },
      llmDisponivel,
      fechar: () => pool.end(),
    };
  }

  const slug = embeddings.modelo.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const { store, ncms } = await carregarStoreDeArquivos(arquivoNcm(), env.EMBEDDINGS_ARQUIVO ?? join(dirDados, "embeddings", `${slug}.ncm.int8.bin`));
  return {
    classificar: criarClassificador({ embeddings, vetores: store, reranker, cache: new MemoryCache(), ...lexicaDe(ncms) }),
    info: { ...base, armazenamento: "arquivo" },
    llmDisponivel,
    fechar: async () => {},
  };
}
