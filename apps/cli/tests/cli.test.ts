import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Container, ResultadoClassificacao } from "@ncm-finder/core";
import { describe, expect, it, vi } from "vitest";
import { formatarResultado } from "../src/formatar.js";
import { criarPrograma } from "../src/program.js";

const candidato = (codigo: string, descricao: string, score: number) => ({
  ncm: { codigo, descricao, descricaoCompleta: `Calçado > ${descricao}`, capitulo: codigo.slice(0, 2), posicao: codigo.slice(0, 4), subposicao: codigo.slice(0, 6) },
  score,
});
const resultadoLlm: ResultadoClassificacao = {
  entrada: { descricao: "tênis" },
  modo: "vetorial+llm",
  candidatos: [candidato("64041100", "Calçado para esporte", 0.9), candidato("64041900", "Outro", 0.8)],
  escolha: { ncm: "64041100", confianca: 0.93, justificativa: "Calçado esportivo (RGI 1).", alternativas: [] },
  modeloEmbedding: "e5",
};

function montar(llmDisponivel = true, resultado: ResultadoClassificacao = resultadoLlm) {
  const saida: string[] = [];
  const classificar = vi.fn(async () => ({ ...resultado, cache: false }));
  const fechar = vi.fn(async () => {});
  const container: Container = { classificar, llmDisponivel, fechar, info: { modeloEmbedding: "e5", reranker: "x", armazenamento: "arquivo" } };
  const executarScript = vi.fn(() => 0);
  const programa = criarPrograma({ criarContainer: async () => container, escrever: (t) => saida.push(t), executarScript });
  for (const c of [programa, ...programa.commands]) c.exitOverride().configureOutput({ writeErr: () => {}, writeOut: () => {} });
  const rodar = (...args: string[]) => programa.parseAsync(["node", "ncm", ...args]);
  return { rodar, saida, classificar, fechar, executarScript };
}

describe("ncm classificar", () => {
  it("usa LLM por padrão quando disponível e imprime escolha + candidatos", async () => {
    const { rodar, saida, classificar, fechar } = montar();
    await rodar("classificar", "tênis de corrida", "--marca", "Acme", "-k", "5");
    expect(classificar).toHaveBeenCalledWith({ descricao: "tênis de corrida", marca: "Acme" }, { modo: "vetorial+llm", k: 5 });
    expect(saida[0]).toContain("NCM sugerido: 6404.11.00  (confiança 93.0%)");
    expect(saida[0]).toContain("Justificativa: Calçado esportivo (RGI 1).");
    expect(saida[0]).toMatch(/→  1\. 6404\.11\.00  0\.900  Calçado para esporte/);
    expect(fechar).toHaveBeenCalled();
  });

  it("cai para vetorial sem credencial e aceita --json e --categoria", async () => {
    const { rodar, saida, classificar } = montar(false, { ...resultadoLlm, modo: "vetorial", escolha: null });
    await rodar("classificar", "mel", "--json", "--categoria", "Alimentos");
    expect(classificar).toHaveBeenCalledWith({ descricao: "mel", categoria: "Alimentos" }, { modo: "vetorial", k: 10 });
    expect(JSON.parse(saida[0]!).modo).toBe("vetorial");
  });

  it("erro se pedir LLM sem credencial; valida k e modo", async () => {
    const semLlm = montar(false);
    await expect(semLlm.rodar("classificar", "mel", "--modo", "vetorial+llm")).rejects.toMatchObject({ exitCode: 2 });
    await expect(montar().rodar("classificar", "mel", "-k", "0")).rejects.toThrow(/k deve ser/);
    await expect(montar().rodar("classificar", "mel", "--modo", "bm25")).rejects.toThrow();
  });
});

describe("ncm avaliar", () => {
  it("lê o CSV e imprime métricas", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cli-"));
    const csv = join(dir, "d.csv");
    await writeFile(csv, "id,descricao,ncm\n1,Tênis,64041100\n2,Chinelo,64022000\n");
    const { rodar, saida, classificar } = montar();
    await rodar("avaliar", csv, "--modo", "vetorial");
    expect(classificar).toHaveBeenCalledTimes(2);
    expect(saida[0]).toContain("vetorial: 2 produtos");
    expect(saida[0]).toContain("top-1 50.0%");
  });
});

describe("ncm ingerir", () => {
  it("repassa argumentos ao script e propaga falha", async () => {
    const ok = montar();
    await ok.rodar("ingerir", "--arquivo", "x.json", "--referencia", "2026-09-23");
    expect(ok.executarScript).toHaveBeenCalledWith("scripts/ingest.ts", ["--arquivo", "x.json", "--referencia", "2026-09-23"]);

    const falha = montar();
    falha.executarScript.mockReturnValue(3);
    await expect(falha.rodar("ingerir")).rejects.toMatchObject({ exitCode: 3 });
  });
});

describe("formatarResultado", () => {
  it("mensagens para LLM sem escolha e sem candidatos", () => {
    const t = formatarResultado({ ...resultadoLlm, escolha: null, candidatos: [], cache: true });
    expect(t).toContain("O LLM não retornou uma escolha válida");
    expect(t).toContain("(nenhum candidato)");
    expect(t).toContain(", cache");
  });
});
