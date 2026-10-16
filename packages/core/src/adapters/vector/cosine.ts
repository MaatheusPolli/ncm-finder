import { EmbeddingDimensionError } from "../../domain/errors.js";

export function cosseno(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new EmbeddingDimensionError(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}
