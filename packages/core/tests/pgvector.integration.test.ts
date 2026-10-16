import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nomeIndice, PgVectorStore, PostgresCache, type Ncm, type ResultadoClassificacao } from "../src/index.js";

const SCHEMA = readFileSync(new URL("../../../db/schema.sql", import.meta.url), "utf8");

/** Usa DATABASE_URL (CI) ou sobe um pgvector via Testcontainers; sem Docker, pula. */
async function conectar(): Promise<{ url: string; parar: () => Promise<void> } | null> {
  if (process.env.DATABASE_URL) return { url: process.env.DATABASE_URL, parar: async () => {} };
  try {
    const { PostgreSqlContainer } = await import("@testcontainers/postgresql");
    const c = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
    return { url: c.getConnectionUri(), parar: async () => void (await c.stop()) };
  } catch {
    return null;
  }
}

const banco = await conectar();

/** 50 NCMs sintéticos: vetor 3D apontando numa direção proporcional ao índice. */
const ncms: Ncm[] = Array.from({ length: 50 }, (_, i) => {
  const codigo = String(10000000 + i * 1000);
  return {
    codigo,
    descricao: `Item ${i}`,
    descricaoCompleta: `Capítulo > Item ${i}`,
    capitulo: codigo.slice(0, 2),
    posicao: codigo.slice(0, 4),
    subposicao: codigo.slice(0, 6),
    vigenciaInicio: "2022-04-01",
    vigenciaFim: "9999-12-31",
  };
});
const vetor = (i: number) => [Math.cos(i / 20), Math.sin(i / 20), 0.1];

describe.skipIf(!banco)("PgVectorStore (integração)", () => {
  let pool: pg.Pool;
  let store: PgVectorStore;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: banco!.url });
    await pool.query("DROP TABLE IF EXISTS ncm_embedding, classificacao_cache, ncm CASCADE");
    await pool.query(SCHEMA);
    store = new PgVectorStore(pool);
    await store.upsert("teste-3d", ncms.map((ncm, i) => ({ ncm, embedding: vetor(i) })));
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await banco?.parar();
  });

  it("busca vizinhos mais próximos por cosseno", async () => {
    const r = await store.buscar("teste-3d", vetor(25), 3);
    expect(r[0]!.ncm.codigo).toBe(ncms[25]!.codigo);
    expect(r[0]!.score).toBeCloseTo(1, 5);
    expect(new Set(r.slice(1).map((c) => c.ncm.codigo))).toEqual(new Set([ncms[24]!.codigo, ncms[26]!.codigo]));
    expect(r[0]!.ncm.descricaoCompleta).toBe("Capítulo > Item 25");
  });

  it("isola modelos e é idempotente", async () => {
    await store.upsert("outro-2d", [{ ncm: ncms[0]!, embedding: [1, 0] }]);
    await store.upsert("outro-2d", [{ ncm: ncms[0]!, embedding: [0, 1] }]);
    await store.upsert("outro-2d", []);
    expect((await store.codigosIndexados("teste-3d")).size).toBe(50);
    expect([...(await store.codigosIndexados("outro-2d"))]).toEqual([ncms[0]!.codigo]);
    const r = await store.buscar("outro-2d", [0, 1], 5);
    expect(r).toHaveLength(1);
    expect(r[0]!.score).toBeCloseTo(1, 5);
  });

  it("cria índice HNSW parcial por modelo", async () => {
    const { rows } = await pool.query("SELECT indexname FROM pg_indexes WHERE tablename = 'ncm_embedding'");
    const nomes = rows.map((r: { indexname: string }) => r.indexname);
    expect(nomes).toEqual(expect.arrayContaining([nomeIndice("teste-3d"), nomeIndice("outro-2d")]));
  });

  it("faz rollback se a inserção falhar", async () => {
    const invalido = { ...ncms[1]!, codigo: "123" + "x".repeat(10) };
    await expect(store.upsert("teste-3d", [{ ncm: invalido, embedding: [1, 1, 1] }])).rejects.toThrow();
    expect((await store.codigosIndexados("teste-3d")).size).toBe(50);
  });

  it("PostgresCache grava e lê JSON", async () => {
    const cache = new PostgresCache(pool);
    const resultado = { entrada: { descricao: "mel" }, modo: "vetorial", candidatos: [], escolha: null, modeloEmbedding: "m" } as ResultadoClassificacao;
    expect(await cache.get("h1")).toBeUndefined();
    await cache.set("h1", resultado);
    await cache.set("h1", resultado);
    expect(await cache.get("h1")).toEqual(resultado);
  });
});

describe("nomeIndice", () => {
  it("gera identificador seguro", () => {
    expect(nomeIndice("Xenova/multilingual-e5-small")).toBe("ncm_embedding_hnsw_xenova_multilingual_e5_small");
    expect(nomeIndice("x".repeat(100))).toHaveLength(63);
  });
});
