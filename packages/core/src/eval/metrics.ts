export interface Predicao {
  id: string;
  esperado: string;
  descricao?: string;
  /** Códigos em ordem de preferência (o primeiro é a escolha final). */
  ranking: string[];
  latenciaMs: number;
}

export interface MetricasGrupo {
  n: number;
  top1: number;
  top5: number;
  top10: number;
  mrr: number;
  /** Top-1 acertou ao menos o capítulo (2 dígitos) / a posição (4 dígitos). */
  capituloTop1: number;
  posicaoTop1: number;
}

export interface Metricas extends MetricasGrupo {
  latenciaP50Ms: number;
  latenciaP95Ms: number;
  /** Ordenado por capítulo (array: objetos JS reordenam chaves numéricas como "61" antes de "04"). */
  porCapitulo: (MetricasGrupo & { capitulo: string })[];
}

function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const ordenado = [...valores].sort((a, b) => a - b);
  return ordenado[Math.min(ordenado.length - 1, Math.ceil((p / 100) * ordenado.length) - 1)]!;
}

function agregar(predicoes: Predicao[]): MetricasGrupo {
  const n = predicoes.length;
  if (n === 0) return { n: 0, top1: 0, top5: 0, top10: 0, mrr: 0, capituloTop1: 0, posicaoTop1: 0 };
  let top1 = 0, top5 = 0, top10 = 0, mrr = 0, cap = 0, pos = 0;
  for (const p of predicoes) {
    const i = p.ranking.indexOf(p.esperado);
    if (i === 0) top1++;
    if (i >= 0 && i < 5) top5++;
    if (i >= 0 && i < 10) top10++;
    if (i >= 0) mrr += 1 / (i + 1);
    const primeiro = p.ranking[0] ?? "";
    if (primeiro.slice(0, 2) === p.esperado.slice(0, 2)) cap++;
    if (primeiro.slice(0, 4) === p.esperado.slice(0, 4)) pos++;
  }
  return { n, top1: top1 / n, top5: top5 / n, top10: top10 / n, mrr: mrr / n, capituloTop1: cap / n, posicaoTop1: pos / n };
}

export function calcularMetricas(predicoes: Predicao[]): Metricas {
  const grupos = new Map<string, Predicao[]>();
  for (const p of predicoes) {
    const cap = p.esperado.slice(0, 2);
    grupos.set(cap, [...(grupos.get(cap) ?? []), p]);
  }
  const porCapitulo = [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([capitulo, ps]) => ({ capitulo, ...agregar(ps) }));
  const latencias = predicoes.map((p) => p.latenciaMs);
  return { ...agregar(predicoes), latenciaP50Ms: percentil(latencias, 50), latenciaP95Ms: percentil(latencias, 95), porCapitulo };
}
