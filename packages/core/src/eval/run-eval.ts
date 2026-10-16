import { normalizarCodigo } from "../domain/ncm.js";
import { calcularMetricas, type Metricas, type Predicao } from "./metrics.js";

export interface ProdutoRotulado {
  id: string;
  descricao: string;
  ncm: string;
}

/** Lê o CSV do dataset (id,descricao,ncm). Descrições podem vir entre aspas com vírgulas e "" escapado. */
export function parseDataset(csv: string): ProdutoRotulado[] {
  const linhas = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const [cabecalho, ...dados] = linhas;
  if (cabecalho?.trim() !== "id,descricao,ncm") throw new Error(`Cabeçalho inesperado no dataset: "${cabecalho}"`);
  return dados.map((linha, i) => {
    const m = /^([^,]+),(?:"((?:[^"]|"")*)"|([^"]*)),(\d{8})$/.exec(linha.trim());
    if (!m) throw new Error(`Linha ${i + 2} inválida no dataset: ${linha}`);
    return { id: m[1]!, descricao: (m[2]?.replace(/""/g, '"') ?? m[3]!).trim(), ncm: normalizarCodigo(m[4]!) };
  });
}

/** Subconjunto fixo e determinístico para o teste de regressão do CI (1 a cada 6 → 50 de 300). */
export function subconjuntoRegressao(produtos: ProdutoRotulado[]): ProdutoRotulado[] {
  return produtos.filter((_, i) => i % 6 === 0);
}

/** Um sistema avaliado recebe a descrição e devolve o ranking de códigos. */
export type Sistema = (descricao: string) => Promise<string[]>;

export interface ResultadoSistema {
  nome: string;
  metricas: Metricas;
  predicoes: Predicao[];
}

export async function avaliar(
  nome: string,
  sistema: Sistema,
  produtos: ProdutoRotulado[],
  { concorrencia = 1, aoProgredir }: { concorrencia?: number; aoProgredir?: (feitos: number, total: number) => void } = {},
): Promise<ResultadoSistema> {
  const predicoes: Predicao[] = new Array(produtos.length);
  let proximo = 0;
  let feitos = 0;
  async function trabalhador() {
    while (proximo < produtos.length) {
      const i = proximo++;
      const p = produtos[i]!;
      const inicio = performance.now();
      const ranking = await sistema(p.descricao);
      predicoes[i] = { id: p.id, descricao: p.descricao, esperado: p.ncm, ranking, latenciaMs: performance.now() - inicio };
      aoProgredir?.(++feitos, produtos.length);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concorrencia) }, trabalhador));
  return { nome, metricas: calcularMetricas(predicoes), predicoes };
}
