import { describe, expect, it } from "vitest";
import {
  avaliar,
  Bm25Baseline,
  calcularMetricas,
  desserializarEmbeddings,
  fundirRrf,
  gerarGraficoSvg,
  gerarRelatorio,
  parseDataset,
  serializarEmbeddings,
  subconjuntoRegressao,
  tokenizar,
  type Ncm,
  type Predicao,
  type ResultadoSistema,
} from "../src/index.js";

const p = (esperado: string, ranking: string[], latenciaMs = 10): Predicao => ({ id: esperado, esperado, ranking, latenciaMs });

describe("calcularMetricas", () => {
  const m = calcularMetricas([
    p("64041100", ["64041100", "64041900"], 10),
    p("64041900", ["64041100", "64041900"], 20),
    p("61091000", ["61099000", "a", "b", "c", "d", "e", "f", "g", "h", "i", "61091000"], 30),
    p("04090000", ["85171300"], 40),
  ]);

  it("top-k, MRR e acertos parciais", () => {
    expect(m.n).toBe(4);
    expect(m.top1).toBe(0.25);
    expect(m.top5).toBe(0.5);
    expect(m.top10).toBe(0.5);
    expect(m.mrr).toBeCloseTo((1 + 0.5 + 1 / 11 + 0) / 4);
    expect(m.capituloTop1).toBe(0.75);
    expect(m.posicaoTop1).toBe(0.75);
  });

  it("latência p50/p95", () => {
    expect(m.latenciaP50Ms).toBe(20);
    expect(m.latenciaP95Ms).toBe(40);
  });

  it("agrupa por capítulo do código esperado, ordenado", () => {
    expect(m.porCapitulo.map((c) => c.capitulo)).toEqual(["04", "61", "64"]);
    expect(m.porCapitulo[2]).toMatchObject({ n: 2, top1: 0.5, top5: 1 });
  });

  it("lista vazia não divide por zero", () => {
    const vazio = calcularMetricas([]);
    expect(vazio.top1).toBe(0);
    expect(vazio.latenciaP50Ms).toBe(0);
    expect(calcularMetricas([p("64041100", [])]).capituloTop1).toBe(0);
  });
});

describe("parseDataset", () => {
  it("lê CSV com BOM, CRLF e descrições entre aspas", () => {
    const csv = '﻿id,descricao,ncm\r\n1,Tênis de corrida,64041100\r\n2,"Cabo, HDMI ""2m""",85444200\r\n';
    expect(parseDataset(csv)).toEqual([
      { id: "1", descricao: "Tênis de corrida", ncm: "64041100" },
      { id: "2", descricao: 'Cabo, HDMI "2m"', ncm: "85444200" },
    ]);
  });

  it("rejeita cabeçalho ou linha inválidos", () => {
    expect(() => parseDataset("a,b,c\n")).toThrow(/Cabeçalho/);
    expect(() => parseDataset("id,descricao,ncm\n1,x,6404\n")).toThrow(/Linha 2/);
  });

  it("subconjunto de regressão pega 1 a cada 6", () => {
    const itens = Array.from({ length: 300 }, (_, i) => ({ id: String(i), descricao: "x", ncm: "64041100" }));
    const s = subconjuntoRegressao(itens);
    expect(s).toHaveLength(50);
    expect(s[1]!.id).toBe("6");
  });
});

describe("avaliar", () => {
  it("executa com concorrência, preserva a ordem e reporta progresso", async () => {
    const produtos = [
      { id: "1", descricao: "tenis", ncm: "64041100" },
      { id: "2", descricao: "mel", ncm: "04090000" },
      { id: "3", descricao: "celular", ncm: "85171300" },
    ];
    const progresso: number[] = [];
    const r = await avaliar("fake", async (d) => (d === "mel" ? ["04090000"] : ["00000000"]), produtos, {
      concorrencia: 2,
      aoProgredir: (f) => progresso.push(f),
    });
    expect(r.nome).toBe("fake");
    expect(r.predicoes.map((x) => x.id)).toEqual(["1", "2", "3"]);
    expect(r.predicoes[1]!.descricao).toBe("mel");
    expect(r.metricas.top1).toBeCloseTo(1 / 3);
    expect(progresso).toEqual([1, 2, 3]);
    expect((await avaliar("x", async () => [], produtos)).metricas.n).toBe(3);
  });
});

describe("BM25", () => {
  const ncm = (codigo: string, descricao: string, descricaoCompleta: string): Ncm => ({
    codigo, descricao, descricaoCompleta, capitulo: codigo.slice(0, 2), posicao: codigo.slice(0, 4), subposicao: codigo.slice(0, 6),
  });

  it("tokeniza sem acentos, stopwords e plurais", () => {
    expect(tokenizar("Calçados para Esportes, de borracha")).toEqual(["calcado", "esport", "borracha"]);
    expect(tokenizar("Mel natural 500g")).toEqual(["mel", "natural", "500g"]);
  });

  it("acha por palavra-chave e falha sem sobreposição lexical", () => {
    const b = new Bm25Baseline([
      ncm("64041100", "Calçado para esporte; calçado para tênis", "Calçado > Calçado para esporte; calçado para tênis"),
      ncm("04090000", "Mel natural", "Leite e laticínios; ovos; mel natural > Mel natural"),
      ncm("85171300", "Smartphones", "Aparelhos telefônicos > Smartphones"),
      ncm("61091000", "De algodão", "Camisetas de malha > De algodão"),
    ]);
    expect(b.buscar("mel de abelha puro", 3)[0]).toBe("04090000");
    expect(b.buscar("tênis de corrida", 3)[0]).toBe("64041100");
    expect(b.buscar("celular android", 3)).toEqual([]);
  });
});

describe("fundirRrf", () => {
  it("prioriza quem aparece bem nos dois rankings e respeita o limite", () => {
    expect(fundirRrf([["a", "b", "c"], ["b", "d", "a"]], 3)).toEqual(["b", "a", "d"]);
    expect(fundirRrf([["x"], []], 5)).toEqual(["x"]);
    expect(fundirRrf([["b"], ["a"]], 2)).toEqual(["a", "b"]);
  });
});

describe("arquivo de embeddings int8", () => {
  it("serializa e lê com erro de quantização < 1%", () => {
    const vetores = [[0.6, -0.8, 0], [1, 0, -1]];
    const bytes = serializarEmbeddings({ modelo: "m", dimensao: 3, codigos: ["11111111", "22222222"], vetores });
    expect(bytes.length).toBeLessThan(200);
    const lido = desserializarEmbeddings(bytes);
    expect(lido.modelo).toBe("m");
    expect(lido.codigos).toEqual(["11111111", "22222222"]);
    lido.vetores.flat().forEach((v, i) => expect(Math.abs(v - vetores.flat()[i]!)).toBeLessThan(0.01));
  });

  it("valida entrada", () => {
    expect(() => serializarEmbeddings({ modelo: "m", dimensao: 2, codigos: ["a"], vetores: [] })).toThrow(/tamanhos/);
    expect(() => serializarEmbeddings({ modelo: "m", dimensao: 2, codigos: ["a"], vetores: [[1]] })).toThrow(/dimensão/);
    expect(() => desserializarEmbeddings(new Uint8Array([1, 2, 3]))).toThrow(/cabeçalho/);
  });
});

describe("relatório", () => {
  const resultado = (nome: string, top1: number): ResultadoSistema => {
    const predicoes = [p("64041100", top1 === 1 ? ["64041100"] : ["64041900", "64041100"])];
    predicoes[0]!.descricao = "Tênis de corrida";
    return { nome, predicoes, metricas: calcularMetricas(predicoes) };
  };
  const ctx = {
    data: "2026-09-24",
    tabelaNcm: { ato: "Res. Gecex 926/2026", atualizacao: "Vigente", referencia: "2026-09-23", total: 10515 },
    dataset: { arquivo: "data/eval/produtos-rotulados.csv", total: 1, capitulos: 1, sha256: "abcdef0123456789ffff" },
    modeloEmbedding: "e5",
    modeloLlm: null,
    k: 10,
    resultados: [resultado("BM25", 0), resultado("Vetorial", 1)],
    naoExecutados: [{ nome: "Vetorial + LLM", motivo: "sem ANTHROPIC_API_KEY" }],
    descricaoPorCodigo: () => "Calçado para esporte",
  };

  it("gera markdown com tabela, versões, capítulo e erros", () => {
    const md = gerarRelatorio(ctx);
    expect(md).toContain("| Vetorial | **100.0%** | **100.0%**");
    expect(md).toContain("| Vetorial + LLM | — |");
    expect(md).toContain("> **Vetorial + LLM não executado:** sem ANTHROPIC_API_KEY");
    expect(md).toContain("10.515 códigos");
    expect(md).toContain("sha256 `abcdef0123456789`");
    expect(md).toContain("não utilizado nesta execução");
    expect(md).toContain("## Acurácia por capítulo (Vetorial)");
    expect(md).not.toContain("Exemplo de justificativa");
  });

  it("inclui exemplo do LLM, erros e latência em segundos", () => {
    const lento = resultado("LLM", 0);
    lento.metricas.latenciaP50Ms = 2500;
    const md = gerarRelatorio({
      ...ctx,
      modeloLlm: "claude-opus-5",
      resultados: [lento],
      naoExecutados: [],
      exemploJustificativa: { produto: "Tênis", ncm: "64041100", justificativa: "RGI 1." },
    });
    expect(md).toContain("`claude-opus-5`");
    expect(md).toContain("**Escolha:** 64041100 — Calçado para esporte");
    expect(md).toContain("| Tênis de corrida | 64041100 | 64041900 | 2 |");
    expect(md).toContain("2.5 s");
  });

  it("gera SVG com uma barra por série e sistema", () => {
    const svg = gerarGraficoSvg(ctx.resultados);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.match(/<rect x=/g)).toHaveLength(2 * 2 + 2);
    expect(svg).toContain(">Vetorial<");
    expect(svg).toContain(">100%<");
  });
});
