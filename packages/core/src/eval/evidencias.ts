import type { RespostaLlm } from "./avaliar-com-llm.js";
import type { ResultadoSistema } from "./run-eval.js";

const csv = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Uma linha por produto com o top-1 de cada sistema e a escolha/justificativa do LLM.
 * Permite auditar qualquer número do relatório produto a produto.
 */
export function gerarCsvEvidencias(resultados: ResultadoSistema[], respostasLlm: Record<string, RespostaLlm[]>): string {
  const base = resultados[0];
  if (!base) return "";
  const sistemas = resultados.map((r) => r.nome);
  const llms = Object.keys(respostasLlm);
  const cabecalho = [
    "id", "descricao", "esperado",
    ...sistemas.flatMap((s) => [`${s} | top1`, `${s} | acertou`, `${s} | posicao_correto`]),
    ...llms.flatMap((s) => [`${s} | confianca`, `${s} | justificativa`, `${s} | origem`]),
  ];
  const linhas = base.predicoes.map((p, i) => {
    const colunasSistemas = resultados.flatMap((r) => {
      const pred = r.predicoes[i]!;
      const pos = pred.ranking.indexOf(pred.esperado);
      return [pred.ranking[0] ?? "", pred.ranking[0] === pred.esperado ? "sim" : "não", pos >= 0 ? pos + 1 : ""];
    });
    const colunasLlm = llms.flatMap((s) => {
      const r = respostasLlm[s]!.find((x) => x.id === p.id);
      return [r?.escolha?.confianca ?? "", r?.escolha?.justificativa ?? "", r?.origem ?? ""];
    });
    return [p.id, p.descricao ?? "", p.esperado, ...colunasSistemas, ...colunasLlm].map(csv).join(",");
  });
  return [cabecalho.map(csv).join(","), ...linhas].join("\n") + "\n";
}

export interface MetadadosExecucao {
  data: string;
  comando: string;
  modeloEmbedding: string;
  modeloLlm: string | null;
  modeloLlmEfetivo?: string;
  kExibido: number;
  kLlm: number;
  datasetSha256: string;
  tabelaNcm: string;
  contagens: Record<string, { doCache: number; novas: number; erros: number; semEscolha: number }>;
  metricas: Record<string, { top1: number; top5: number; top10: number; mrr: number }>;
}

/** Metadados da execução: o que rodou, com quais versões, e quanto veio do cache vs. chamadas novas. */
export function gerarMetadados(m: MetadadosExecucao): string {
  return JSON.stringify(m, null, 2) + "\n";
}
