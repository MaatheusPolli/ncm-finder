import { EmbeddingDimensionError } from "../domain/errors.js";
import type { Ncm } from "../domain/ncm.js";
import type { EmbeddingProvider } from "../ports/embedding-provider.js";
import type { VectorStore } from "../ports/vector-store.js";

export interface ResultadoIngestao {
  modelo: string;
  total: number;
  jaIndexados: number;
  gerados: number;
}

export interface OpcoesIngestao {
  tamanhoLote?: number;
  aoProgredir?: (gerados: number, pendentes: number) => void;
}

/**
 * Gera embeddings só para NCMs ainda não indexados neste modelo (idempotente)
 * e grava em lotes, para que uma falha no meio não perca o trabalho anterior.
 */
export async function embedNcms(
  ncms: Ncm[],
  provider: EmbeddingProvider,
  store: VectorStore,
  { tamanhoLote = 128, aoProgredir }: OpcoesIngestao = {},
): Promise<ResultadoIngestao> {
  const indexados = await store.codigosIndexados(provider.modelo);
  const pendentes = ncms.filter((n) => !indexados.has(n.codigo));

  let gerados = 0;
  for (let i = 0; i < pendentes.length; i += tamanhoLote) {
    const lote = pendentes.slice(i, i + tamanhoLote);
    const vetores = await provider.embed(lote.map((n) => n.descricaoCompleta), "document");
    if (vetores.length !== lote.length) throw new Error(`Provider retornou ${vetores.length} vetores para ${lote.length} textos`);
    for (const v of vetores) {
      if (v.length !== provider.dimensao) throw new EmbeddingDimensionError(provider.dimensao, v.length);
    }
    await store.upsert(provider.modelo, lote.map((ncm, j) => ({ ncm, embedding: vetores[j]! })));
    gerados += lote.length;
    aoProgredir?.(gerados, pendentes.length);
  }

  return { modelo: provider.modelo, total: ncms.length, jaIndexados: ncms.length - pendentes.length, gerados };
}
