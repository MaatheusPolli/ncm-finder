import { describe, expect, it } from "vitest";
import {
  cosseno,
  EmbeddingDimensionError,
  MemoryCache,
  MemoryVectorStore,
  NoopReranker,
  type Ncm,
  type ResultadoClassificacao,
} from "../src/index.js";

const ncm = (codigo: string): Ncm => ({
  codigo,
  descricao: codigo,
  descricaoCompleta: codigo,
  capitulo: codigo.slice(0, 2),
  posicao: codigo.slice(0, 4),
  subposicao: codigo.slice(0, 6),
});

describe("cosseno", () => {
  it("calcula similaridade", () => {
    expect(cosseno([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosseno([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosseno([0, 0], [1, 0])).toBe(0);
  });

  it("falha com dimensões diferentes", () => {
    expect(() => cosseno([1], [1, 2])).toThrow(EmbeddingDimensionError);
  });
});

describe("MemoryVectorStore", () => {
  it("busca top-k ordenado e isola por modelo", async () => {
    const s = new MemoryVectorStore();
    await s.upsert("m1", [
      { ncm: ncm("64041100"), embedding: [1, 0] },
      { ncm: ncm("61091000"), embedding: [0, 1] },
      { ncm: ncm("64039990"), embedding: [0.9, 0.1] },
    ]);
    const r = await s.buscar("m1", [1, 0], 2);
    expect(r.map((c) => c.ncm.codigo)).toEqual(["64041100", "64039990"]);
    expect(await s.buscar("m2", [1, 0], 2)).toEqual([]);
    expect([...(await s.codigosIndexados("m1"))].sort()).toEqual(["61091000", "64039990", "64041100"]);
    expect((await s.codigosIndexados("m2")).size).toBe(0);
  });
});

describe("NoopReranker e MemoryCache", () => {
  it("noop retorna null", async () => {
    expect(await new NoopReranker().escolher()).toBeNull();
  });

  it("cache guarda e recupera", async () => {
    const c = new MemoryCache();
    const r = { modo: "vetorial" } as ResultadoClassificacao;
    expect(await c.get("h")).toBeUndefined();
    await c.set("h", r);
    expect(await c.get("h")).toBe(r);
  });
});
