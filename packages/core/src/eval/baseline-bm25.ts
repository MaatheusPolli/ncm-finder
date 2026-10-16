import bm25 from "wink-bm25-text-search";
import type { Ncm } from "../domain/ncm.js";
import { semAcentos } from "../pipeline/normalize.js";

const STOPWORDS = new Set(
  "a o as os um uma uns umas de do da dos das em no na nos nas por para com sem ou e que se ao aos à às pelo pela pelos pelas mesmo mesma outros outras outro outra seus suas sua seu tipo tipos".split(" "),
);

/** Tokenização simples para português: sem acentos, sem stopwords, plural reduzido ("calcados" → "calcado"). */
export function tokenizar(texto: string): string[] {
  return semAcentos(texto.toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => (t.length > 4 && t.endsWith("es") && !t.endsWith("ies") ? t.slice(0, -2) : t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

/**
 * Baseline de busca textual: BM25 sobre a descrição do item (peso 2) e a descrição completa (peso 1).
 * É o "estado da arte" de quem classifica com busca por palavra-chave.
 */
export class Bm25Baseline {
  private readonly motor = bm25();

  constructor(ncms: Ncm[]) {
    this.motor.defineConfig({ fldWeights: { descricao: 2, descricaoCompleta: 1 }, bm25Params: { k1: 1.2, b: 0.75 } });
    this.motor.definePrepTasks([tokenizar]);
    for (const n of ncms) this.motor.addDoc({ descricao: n.descricao, descricaoCompleta: n.descricaoCompleta }, n.codigo);
    this.motor.consolidate();
  }

  buscar(consulta: string, k: number): string[] {
    return this.motor.search(consulta, k).map(([codigo]) => codigo);
  }
}
