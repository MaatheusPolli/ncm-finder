import { formatarCodigo, type Metricas, type ResultadoClassificacao } from "@ncm-finder/core";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function formatarResultado(r: ResultadoClassificacao & { cache?: boolean }): string {
  const linhas: string[] = [];
  if (r.escolha) {
    const escolhido = r.candidatos.find((c) => c.ncm.codigo === r.escolha!.ncm);
    linhas.push(`NCM sugerido: ${formatarCodigo(r.escolha.ncm)}  (confiança ${pct(r.escolha.confianca)})`);
    if (escolhido) linhas.push(`  ${escolhido.ncm.descricaoCompleta}`);
    linhas.push("", `Justificativa: ${r.escolha.justificativa}`, "");
  } else if (r.modo === "vetorial+llm") {
    linhas.push("O LLM não retornou uma escolha válida; exibindo a ordem da busca vetorial.", "");
  }
  linhas.push(`Candidatos (${r.modo}, ${r.modeloEmbedding}${r.cache ? ", cache" : ""}):`);
  r.candidatos.forEach((c, i) => {
    const marca = r.escolha?.ncm === c.ncm.codigo ? "→" : " ";
    linhas.push(`${marca} ${String(i + 1).padStart(2)}. ${formatarCodigo(c.ncm.codigo)}  ${c.score.toFixed(3)}  ${c.ncm.descricao}`);
  });
  if (r.candidatos.length === 0) linhas.push("  (nenhum candidato)");
  return linhas.join("\n");
}

export function formatarMetricas(nome: string, m: Metricas): string {
  return [
    `${nome}: ${m.n} produtos`,
    `  top-1 ${pct(m.top1)}   top-5 ${pct(m.top5)}   top-10 ${pct(m.top10)}   MRR ${m.mrr.toFixed(3)}`,
    `  capítulo certo ${pct(m.capituloTop1)}   posição certa ${pct(m.posicaoTop1)}   latência p50 ${m.latenciaP50Ms.toFixed(0)} ms`,
  ].join("\n");
}
