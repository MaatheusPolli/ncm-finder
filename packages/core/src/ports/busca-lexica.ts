import type { Ncm } from "../domain/ncm.js";

/** Busca por palavra-chave (BM25), combinada com a vetorial na busca híbrida. */
export interface BuscaLexica {
  buscar(texto: string, k: number): Ncm[];
}
