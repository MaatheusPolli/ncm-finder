import { describe, expect, it, vi } from "vitest";
import {
  criarClassificador,
  hashEntrada,
  LocalTransformersProvider,
  MemoryCache,
  MemoryVectorStore,
  NoopReranker,
  normalizarDescricao,
  reordenar,
  semAcentos,
  type Candidato,
  type EmbeddingProvider,
  type Ncm,
  type Reranker,
} from "../src/index.js";

const ncm = (codigo: string, descricaoCompleta: string): Ncm => ({
  codigo,
  descricao: descricaoCompleta,
  descricaoCompleta,
  capitulo: codigo.slice(0, 2),
  posicao: codigo.slice(0, 4),
  subposicao: codigo.slice(0, 6),
});

/** Embedding de brinquedo: saco de palavras sobre um vocabulário fixo. */
const VOCAB = ["calcado", "tenis", "esporte", "camiseta", "algodao", "mel", "celular", "telefone"];
const fakeEmbeddings: EmbeddingProvider = {
  modelo: "bow-v1",
  dimensao: VOCAB.length,
  embed: async (textos) =>
    textos.map((t) => {
      const s = semAcentos(t.toLowerCase());
      return VOCAB.map((w) => (s.includes(w) ? 1 : 0.01));
    }),
};

async function montarStore() {
  const store = new MemoryVectorStore();
  const itens = [
    ncm("64041100", "Calçado para esporte; calçado para tênis"),
    ncm("61091000", "Camiseta de malha de algodão"),
    ncm("04090000", "Mel natural"),
    ncm("85171300", "Telefone celular smartphone"),
  ];
  const vetores = await fakeEmbeddings.embed(itens.map((i) => i.descricaoCompleta), "document");
  await store.upsert("bow-v1", itens.map((n, i) => ({ ncm: n, embedding: vetores[i]! })));
  return store;
}

describe("normalizarDescricao", () => {
  it("minúsculas, unidades, pontuação de anúncio", () => {
    expect(normalizarDescricao({ descricao: "Mel Puro 500GR!!! ***Oferta***" })).toBe("mel puro 500 g oferta");
    expect(normalizarDescricao({ descricao: "Refrigerante 2L e 350 ML" })).toBe("refrigerante 2 litros e 350 ml");
    expect(normalizarDescricao({ descricao: "Cabo 1,5m 220v 60W 10cm 5mm 2kg" })).toBe("cabo 1,5 m 220 V 60 W 10 cm 5 mm 2 kg");
  });

  it("remove a marca e prefixa a categoria", () => {
    expect(normalizarDescricao({ descricao: "Tênis Nike Revolution corrida", marca: "Nike", categoria: "Calçados" })).toBe(
      "calçados: tênis revolution corrida",
    );
    expect(normalizarDescricao({ descricao: "Tênis corrida", marca: "  " })).toBe("tênis corrida");
  });

  it("marca com caracteres especiais não quebra a regex", () => {
    expect(normalizarDescricao({ descricao: "Shampoo L'Oréal (c++) 200ml", marca: "(c++)" })).toBe("shampoo l'oréal 200 ml");
  });
});

describe("hashEntrada", () => {
  it("ignora acentos/caixa e muda com modo, modelo e k", () => {
    const base = hashEntrada({ descricao: "Tênis" }, "vetorial", "m", 10);
    expect(hashEntrada({ descricao: "TENIS" }, "vetorial", "m", 10)).toBe(base);
    expect(hashEntrada({ descricao: "Tênis" }, "vetorial+llm", "m", 10)).not.toBe(base);
    expect(hashEntrada({ descricao: "Tênis" }, "vetorial", "m2", 10)).not.toBe(base);
    expect(hashEntrada({ descricao: "Tênis" }, "vetorial", "m", 5)).not.toBe(base);
  });
});

describe("reordenar", () => {
  const c = (codigo: string): Candidato => ({ ncm: ncm(codigo, codigo), score: 0 });
  const lista = [c("11111111"), c("22222222"), c("33333333")];

  it("sobe a escolha do LLM e preserva o resto", () => {
    const r = reordenar(lista, { ncm: "33333333", confianca: 1, justificativa: "x", alternativas: [] });
    expect(r.map((x) => x.ncm.codigo)).toEqual(["33333333", "11111111", "22222222"]);
  });

  it("não mexe sem escolha, com escolha já no topo ou fora da lista", () => {
    expect(reordenar(lista, null)).toBe(lista);
    expect(reordenar(lista, { ncm: "11111111", confianca: 1, justificativa: "x", alternativas: [] })).toBe(lista);
    expect(reordenar(lista, { ncm: "99999999", confianca: 1, justificativa: "x", alternativas: [] })).toBe(lista);
  });
});

describe("classificar", () => {
  it("modo vetorial: ordena por similaridade, respeita k, não chama reranker", async () => {
    const reranker = { escolher: vi.fn() };
    const classificar = criarClassificador({ embeddings: fakeEmbeddings, vetores: await montarStore(), reranker });
    const r = await classificar({ descricao: "Tênis de corrida para esporte" }, { modo: "vetorial", k: 2 });
    expect(r.candidatos).toHaveLength(2);
    expect(r.candidatos[0]!.ncm.codigo).toBe("64041100");
    expect(r.escolha).toBeNull();
    expect(r.modeloEmbedding).toBe("bow-v1");
    expect(reranker.escolher).not.toHaveBeenCalled();
  });

  it("modo LLM: escolha do reranker vai para o topo", async () => {
    const reranker: Reranker = {
      escolher: async () => ({ ncm: "61091000", confianca: 0.8, justificativa: "camiseta", alternativas: [] }),
    };
    const classificar = criarClassificador({ embeddings: fakeEmbeddings, vetores: await montarStore(), reranker });
    const r = await classificar({ descricao: "tenis estampado camiseta" });
    expect(r.modo).toBe("vetorial+llm");
    expect(r.escolha?.ncm).toBe("61091000");
    expect(r.candidatos[0]!.ncm.codigo).toBe("61091000");
  });

  it("limita k entre 1 e 50", async () => {
    const vetores = await montarStore();
    const buscar = vi.spyOn(vetores, "buscar");
    const classificar = criarClassificador({ embeddings: fakeEmbeddings, vetores, reranker: new NoopReranker() });
    await classificar({ descricao: "mel" }, { k: 500 });
    await classificar({ descricao: "mel" }, { k: 0 });
    expect(buscar.mock.calls.map((c) => c[2])).toEqual([50, 1]);
  });

  it("sem candidatos não chama o reranker", async () => {
    const reranker = { escolher: vi.fn() };
    const classificar = criarClassificador({ embeddings: fakeEmbeddings, vetores: new MemoryVectorStore(), reranker });
    const r = await classificar({ descricao: "mel" });
    expect(r.candidatos).toEqual([]);
    expect(reranker.escolher).not.toHaveBeenCalled();
  });

  it("usa o cache na segunda chamada", async () => {
    const embed = vi.spyOn(fakeEmbeddings, "embed");
    const classificar = criarClassificador({
      embeddings: fakeEmbeddings, vetores: await montarStore(), reranker: new NoopReranker(), cache: new MemoryCache(),
    });
    embed.mockClear();
    const a = await classificar({ descricao: "Mel natural" });
    const b = await classificar({ descricao: "MEL NATURAL" });
    expect(a.cache).toBe(false);
    expect(b.cache).toBe(true);
    expect(b.candidatos).toEqual(a.candidatos);
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it("valida a entrada", async () => {
    const classificar = criarClassificador({ embeddings: fakeEmbeddings, vetores: new MemoryVectorStore(), reranker: new NoopReranker() });
    await expect(classificar({ descricao: "" })).rejects.toThrow();
  });
});

describe("LocalTransformersProvider", () => {
  it("aplica prefixos e5, carrega o modelo uma vez e devolve listas", async () => {
    const extrator = vi.fn(async (textos: string[]) => ({ tolist: () => textos.map((t) => [t.length]) }));
    const carregar = vi.fn(async () => extrator);
    const p = new LocalTransformersProvider({ carregar });
    expect(p.modelo).toBe("Xenova/multilingual-e5-small");
    expect(p.dimensao).toBe(384);
    expect(await p.embed(["ab"], "query")).toEqual([["query: ab".length]]);
    await p.embed(["ab"], "document");
    expect(extrator.mock.calls[1]![0]).toEqual(["passage: ab"]);
    expect(carregar).toHaveBeenCalledTimes(1);
    expect(await p.embed([], "query")).toEqual([]);
  });
});
