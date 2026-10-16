/**
 * Reciprocal Rank Fusion (Cormack et al., 2009): score(d) = Σ 1 / (c + posição de d no ranking i).
 * Combina rankings de naturezas diferentes (BM25 × cosseno) sem precisar calibrar escalas de score.
 */
export function fundirRrf(rankings: string[][], limite: number, c = 60): string[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((codigo, i) => scores.set(codigo, (scores.get(codigo) ?? 0) + 1 / (c + i + 1)));
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limite)
    .map(([codigo]) => codigo);
}
