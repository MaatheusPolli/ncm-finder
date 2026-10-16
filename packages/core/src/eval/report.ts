import type { ResultadoSistema } from "./run-eval.js";

export interface ContextoRelatorio {
  data: string;
  tabelaNcm: { ato: string; atualizacao: string; referencia: string; total: number };
  dataset: { arquivo: string; total: number; capitulos: number; sha256: string };
  modeloEmbedding: string;
  modeloLlm: string | null;
  k: number;
  resultados: ResultadoSistema[];
  /** Sistemas previstos que não rodaram, com o motivo. */
  naoExecutados: { nome: string; motivo: string }[];
  exemploJustificativa?: { produto: string; ncm: string; justificativa: string };
  notas?: string[];
  descricaoPorCodigo: (codigo: string) => string;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ms = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(1)} s` : `${x.toFixed(0)} ms`);

/** Gráfico de barras agrupadas (top-1 / top-5 por sistema) em SVG autônomo, para o README e o post. */
export function gerarGraficoSvg(resultados: ResultadoSistema[]): string {
  const largura = 640, altura = 360, margem = { topo: 56, dir: 24, base: 56, esq: 48 };
  const areaL = largura - margem.esq - margem.dir, areaA = altura - margem.topo - margem.base;
  const series = [
    { chave: "top1" as const, rotulo: "Top-1", cor: "#2563eb" },
    { chave: "top5" as const, rotulo: "Top-5", cor: "#93c5fd" },
  ];
  const grupo = areaL / Math.max(1, resultados.length);
  const barra = Math.min(56, (grupo * 0.7) / series.length);
  const y = (v: number) => margem.topo + areaA * (1 - v);

  const grade = [0, 0.25, 0.5, 0.75, 1]
    .map((v) => `<line x1="${margem.esq}" x2="${largura - margem.dir}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e7eb"/>` +
      `<text x="${margem.esq - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#6b7280">${v * 100}%</text>`)
    .join("");

  const barras = resultados
    .map((r, i) => {
      const x0 = margem.esq + grupo * i + (grupo - barra * series.length) / 2;
      const bs = series
        .map((s, j) => {
          const v = r.metricas[s.chave];
          const x = x0 + j * barra;
          return `<rect x="${x}" y="${y(v)}" width="${barra - 4}" height="${areaA * v}" rx="3" fill="${s.cor}"/>` +
            `<text x="${x + (barra - 4) / 2}" y="${y(v) - 6}" text-anchor="middle" font-size="12" font-weight="600" fill="#111827">${(v * 100).toFixed(0)}%</text>`;
        })
        .join("");
      return bs + `<text x="${margem.esq + grupo * i + grupo / 2}" y="${altura - margem.base + 22}" text-anchor="middle" font-size="13" fill="#111827">${r.nome}</text>`;
    })
    .join("");

  const legenda = series
    .map((s, i) => `<rect x="${largura - margem.dir - 150 + i * 75}" y="18" width="12" height="12" rx="2" fill="${s.cor}"/>` +
      `<text x="${largura - margem.dir - 134 + i * 75}" y="28" font-size="12" fill="#374151">${s.rotulo}</text>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" width="${largura}" height="${altura}" font-family="system-ui, sans-serif">
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="${margem.esq}" y="30" font-size="16" font-weight="700" fill="#111827">Acurácia na classificação NCM</text>
${legenda}${grade}${barras}
</svg>
`;
}

export function gerarRelatorio(ctx: ContextoRelatorio): string {
  const linhas: string[] = [];
  linhas.push("# Relatório de avaliação — NCM Finder", "");
  linhas.push(`Gerado em ${ctx.data} por \`pnpm eval\`.`, "");
  linhas.push("![Top-1 e Top-5 por sistema](eval-chart.svg)", "");

  linhas.push("## Resultados", "");
  linhas.push("| Sistema | Top-1 | Top-5 | Top-10 | MRR | Capítulo certo (top-1) | Posição certa (top-1) | Latência p50 | p95 |");
  linhas.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of ctx.resultados) {
    const m = r.metricas;
    linhas.push(`| ${r.nome} | **${pct(m.top1)}** | **${pct(m.top5)}** | ${pct(m.top10)} | ${m.mrr.toFixed(3)} | ${pct(m.capituloTop1)} | ${pct(m.posicaoTop1)} | ${ms(m.latenciaP50Ms)} | ${ms(m.latenciaP95Ms)} |`);
  }
  for (const n of ctx.naoExecutados) linhas.push(`| ${n.nome} | — | — | — | — | — | — | — | — |`);
  linhas.push("");
  for (const n of ctx.naoExecutados) linhas.push(`> **${n.nome} não executado:** ${n.motivo}`, "");

  linhas.push("Leitura das colunas:", "");
  linhas.push("- **Top-1**: o primeiro código sugerido é exatamente o NCM correto (8 dígitos).");
  linhas.push("- **Top-5 / Top-10**: o NCM correto aparece entre os 5 / 10 primeiros candidatos.");
  linhas.push("- **MRR**: média de 1/posição do código correto (0 se ausente do ranking).");
  linhas.push("- **Capítulo / Posição certa**: o top-1 acerta ao menos os 2 / 4 primeiros dígitos. Mede erros \"perto\" versus erros grosseiros.");
  linhas.push("");

  linhas.push("## Reprodutibilidade", "");
  linhas.push(`- Tabela NCM: ${ctx.tabelaNcm.ato} (${ctx.tabelaNcm.atualizacao}), vigência de referência ${ctx.tabelaNcm.referencia}, ${ctx.tabelaNcm.total.toLocaleString("pt-BR")} códigos de 8 dígitos.`);
  linhas.push(`- Dataset: \`${ctx.dataset.arquivo}\`: ${ctx.dataset.total} produtos, ${ctx.dataset.capitulos} capítulos, sha256 \`${ctx.dataset.sha256.slice(0, 16)}\`.`);
  linhas.push(`- Embeddings: \`${ctx.modeloEmbedding}\`. Candidatos por consulta: k = ${ctx.k}.`);
  linhas.push(`- LLM de rerank: ${ctx.modeloLlm ? `\`${ctx.modeloLlm}\`` : "não utilizado nesta execução"}.`);
  linhas.push("- BM25: `wink-bm25-text-search` (k1 = 1,2; b = 0,75), campos descrição (peso 2) e descrição completa (peso 1).");
  linhas.push("- Busca exata por cosseno (sem aproximação do HNSW), então o resultado é determinístico.");
  for (const n of ctx.notas ?? []) linhas.push(`- ${n}`);
  linhas.push("");

  if (ctx.exemploJustificativa) {
    const e = ctx.exemploJustificativa;
    linhas.push("## Exemplo de justificativa do LLM", "");
    linhas.push(`**Produto:** ${e.produto}  `, `**Escolha:** ${e.ncm} — ${ctx.descricaoPorCodigo(e.ncm)}`, "");
    linhas.push(`> ${e.justificativa}`, "");
  }

  const melhor = ctx.resultados.reduce((a, b) => (b.metricas.top1 > a.metricas.top1 ? b : a), ctx.resultados[0]!);
  linhas.push(`## Acurácia por capítulo (${melhor.nome})`, "");
  linhas.push("| Capítulo | n | Top-1 | Top-5 |", "|---|---|---|---|");
  for (const m of melhor.metricas.porCapitulo) linhas.push(`| ${m.capitulo} | ${m.n} | ${pct(m.top1)} | ${pct(m.top5)} |`);
  linhas.push("");

  linhas.push(`## Erros de top-1 (${melhor.nome}, primeiros 15)`, "");
  linhas.push("| Produto | Esperado | Sugerido | Posição do correto |", "|---|---|---|---|");
  const erros = melhor.predicoes.filter((p) => p.ranking[0] !== p.esperado).slice(0, 15);
  for (const p of erros) {
    const i = p.ranking.indexOf(p.esperado);
    linhas.push(`| ${p.descricao ?? p.id} | ${p.esperado} | ${p.ranking[0] ?? "—"} | ${i >= 0 ? i + 1 : "fora do top-k"} |`);
  }
  linhas.push("");
  return linhas.join("\n");
}
