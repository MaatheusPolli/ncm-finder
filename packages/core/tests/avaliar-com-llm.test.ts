import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  avaliarComLlm,
  CacheRespostasLlm,
  calcularMetricas,
  gerarCsvEvidencias,
  gerarMetadados,
  type Candidato,
  type EscolhaLlm,
  type Reranker,
  type ResultadoSistema,
} from "../src/index.js";

const tmp = () => mkdtemp(join(tmpdir(), "cache-llm-"));
const escolha = (ncm: string, justificativa = "RGI 1"): EscolhaLlm => ({ ncm, confianca: 0.9, justificativa, alternativas: [] });
const candidato = (codigo: string): Candidato => ({
  ncm: { codigo, descricao: codigo, descricaoCompleta: codigo, capitulo: codigo.slice(0, 2), posicao: codigo.slice(0, 4), subposicao: codigo.slice(0, 6) },
  score: 0.5,
});

describe("CacheRespostasLlm", () => {
  it("persiste, relê e distingue chave por modelo, produto e candidatos", async () => {
    const arq = join(await tmp(), "sub", "m.json");
    const a = await CacheRespostasLlm.abrir(arq);
    const k = CacheRespostasLlm.chave("m", "tênis", ["64041100", "64041900"]);
    expect(CacheRespostasLlm.chave("m", "tênis", ["64041900", "64041100"])).not.toBe(k);
    expect(CacheRespostasLlm.chave("outro", "tênis", ["64041100", "64041900"])).not.toBe(k);
    await a.registrar(k, escolha("64041100"));
    await a.registrar("k-null", null);

    const b = await CacheRespostasLlm.abrir(arq);
    expect(b.tamanho).toBe(2);
    expect(b.obter(k)?.ncm).toBe("64041100");
    expect(b.tem("k-null")).toBe(true);
    expect(b.obter("k-null")).toBeNull();
  });

  it("REGRESSÃO: dois processos gravando o mesmo arquivo não apagam as respostas um do outro", async () => {
    const arq = join(await tmp(), "m.json");
    const p1 = await CacheRespostasLlm.abrir(arq);
    const p2 = await CacheRespostasLlm.abrir(arq);
    // Intercalado, como duas execuções concorrentes do pnpm eval.
    for (let i = 0; i < 20; i++) {
      await p1.registrar(`p1-${i}`, escolha("11111111"));
      await p2.registrar(`p2-${i}`, escolha("22222222"));
    }
    const final = JSON.parse(await readFile(arq, "utf8")) as Record<string, EscolhaLlm>;
    expect(Object.keys(final)).toHaveLength(40);
    expect((await CacheRespostasLlm.abrir(arq)).tamanho).toBe(40);
  });

  it("gravações disparadas sem await ficam serializadas e completas", async () => {
    const arq = join(await tmp(), "m.json");
    const c = await CacheRespostasLlm.abrir(arq);
    for (let i = 0; i < 25; i++) void c.registrar(`k${i}`, null);
    await c.aguardar();
    expect(Object.keys(JSON.parse(await readFile(arq, "utf8")))).toHaveLength(25);
  });
});

describe("avaliarComLlm", () => {
  const produtos = [
    { id: "1", descricao: "tênis de corrida", ncm: "64041100" },
    { id: "2", descricao: "chinelo de borracha", ncm: "64022000" },
    { id: "3", descricao: "mel", ncm: "04090000" },
  ];
  const candidatosDe = async (d: string) =>
    d === "mel" ? [candidato("17019900"), candidato("04090000")] : [candidato("64041900"), candidato("64041100"), candidato("64022000")];

  it("usa o cache antes de chamar, grava as novas e reordena pela escolha", async () => {
    const cache = await CacheRespostasLlm.abrir(join(await tmp(), "m.json"));
    await cache.registrar(CacheRespostasLlm.chave("m", "mel", ["17019900", "04090000"]), escolha("04090000"));
    const reranker: Reranker = { escolher: vi.fn(async (e) => escolha(e.descricao.startsWith("tênis") ? "64041100" : "64022000")) };

    const r = await avaliarComLlm({ nome: "X + LLM", modelo: "m", reranker, produtos, candidatosDe, cache });
    expect(r.interrompido).toBe(false);
    expect(r.contagem).toEqual({ doCache: 1, novas: 2, erros: 0, semEscolha: 0 });
    expect(reranker.escolher).toHaveBeenCalledTimes(2);
    expect(r.resultado!.metricas.top1).toBe(1);
    expect(r.respostas.map((x) => x.origem)).toEqual(["api", "api", "cache"]);
    expect(r.respostas[0]).toMatchObject({ id: "1", esperado: "64041100", candidatos: ["64041900", "64041100", "64022000"] });
    expect(cache.tamanho).toBe(3);

    // Segunda execução: tudo do cache, nenhuma chamada.
    const r2 = await avaliarComLlm({ nome: "X + LLM", modelo: "m", reranker, produtos, candidatosDe, cache });
    expect(r2.contagem.doCache).toBe(3);
    expect(reranker.escolher).toHaveBeenCalledTimes(2);
  });

  it("para após N erros seguidos (fim de cota), não publica métricas parciais e não grava erros no cache", async () => {
    const cache = await CacheRespostasLlm.abrir(join(await tmp(), "m.json"));
    const erros: string[] = [];
    const reranker: Reranker = { escolher: vi.fn(async () => { throw new Error("You've hit your session limit"); }) };
    const r = await avaliarComLlm({ nome: "X", modelo: "m", reranker, produtos, candidatosDe, cache, limiteErrosSeguidos: 2, aoErro: (m) => erros.push(m) });
    expect(r.interrompido).toBe(true);
    expect(r.resultado).toBeUndefined();
    expect(reranker.escolher).toHaveBeenCalledTimes(2);
    expect(r.respostas.map((x) => x.origem)).toEqual(["erro", "erro", "pulado"]);
    expect(erros[0]).toMatch(/session limit/);
    expect(cache.tamanho).toBe(0);
  });

  it("um erro isolado não interrompe; LLM sem escolha conta como semEscolha", async () => {
    const cache = await CacheRespostasLlm.abrir(join(await tmp(), "m.json"));
    let n = 0;
    const reranker: Reranker = {
      escolher: async () => {
        n++;
        if (n === 1) throw new Error("503");
        return n === 2 ? null : escolha("04090000");
      },
    };
    const r = await avaliarComLlm({ nome: "X", modelo: "m", reranker, produtos, candidatosDe, cache });
    expect(r.interrompido).toBe(false);
    expect(r.contagem).toEqual({ doCache: 0, novas: 2, erros: 1, semEscolha: 2 });
  });

  it("respeita o intervalo entre chamadas", async () => {
    const cache = await CacheRespostasLlm.abrir(join(await tmp(), "m.json"));
    const esperas: number[] = [];
    const reranker: Reranker = { escolher: async () => null };
    await avaliarComLlm({ nome: "X", modelo: "m", reranker, produtos, candidatosDe, cache, intervaloMs: 60_000, esperar: async (ms) => void esperas.push(ms) });
    expect(esperas).toHaveLength(2);
    esperas.forEach((ms) => expect(ms).toBeGreaterThan(50_000));
  });

  it("intervalo padrão usa setTimeout real", async () => {
    vi.useFakeTimers();
    const cache = await CacheRespostasLlm.abrir(join(await tmp(), "m.json"));
    const p = avaliarComLlm({ nome: "X", modelo: "m", reranker: { escolher: async () => null }, produtos: produtos.slice(0, 2), candidatosDe, cache, intervaloMs: 1000 });
    await vi.advanceTimersByTimeAsync(5000);
    expect((await p).contagem.novas).toBe(2);
    vi.useRealTimers();
  });
});

describe("evidências", () => {
  const resultado = (nome: string, rankings: string[][]): ResultadoSistema => {
    const predicoes = rankings.map((ranking, i) => ({ id: String(i + 1), descricao: i ? "mel" : 'Cabo "HDMI", 2m', esperado: ["85444200", "04090000"][i]!, ranking, latenciaMs: 1 }));
    return { nome, predicoes, metricas: calcularMetricas(predicoes) };
  };

  it("CSV com top-1, acerto, posição do correto e justificativa do LLM, escapando aspas e vírgulas", () => {
    const csv = gerarCsvEvidencias(
      [resultado("BM25", [["11111111", "85444200"], []]), resultado("Híbrido + LLM", [["85444200"], ["04090000"]])],
      {
        "Híbrido + LLM": [
          { id: "1", descricao: "x", esperado: "85444200", candidatos: [], escolha: escolha("85444200", "Cabo, com conectores"), origem: "api" },
          { id: "2", descricao: "mel", esperado: "04090000", candidatos: [], escolha: null, origem: "cache" },
        ],
      },
    );
    const [cab, l1, l2] = csv.trim().split("\n");
    expect(cab).toBe("id,descricao,esperado,BM25 | top1,BM25 | acertou,BM25 | posicao_correto,Híbrido + LLM | top1,Híbrido + LLM | acertou,Híbrido + LLM | posicao_correto,Híbrido + LLM | confianca,Híbrido + LLM | justificativa,Híbrido + LLM | origem");
    expect(l1).toBe('1,"Cabo ""HDMI"", 2m",85444200,11111111,não,2,85444200,sim,1,0.9,"Cabo, com conectores",api');
    expect(l2).toBe("2,mel,04090000,,não,,04090000,sim,1,,,cache");
    expect(gerarCsvEvidencias([], {})).toBe("");
  });

  it("metadados em JSON", () => {
    const m = JSON.parse(gerarMetadados({
      data: "2026-09-27", comando: "pnpm eval", modeloEmbedding: "Xenova/bge-m3", modeloLlm: "claude-cli/haiku", kExibido: 10, kLlm: 20,
      datasetSha256: "abc", tabelaNcm: "Res. 926", contagens: {}, metricas: {},
    }));
    expect(m.kLlm).toBe(20);
  });
});
