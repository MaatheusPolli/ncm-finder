import {
  EntradaClassificacaoSchema,
  type Candidato,
  type EntradaClassificacao,
  type EscolhaLlm,
  type ModoClassificacao,
  type ResultadoClassificacao,
} from "../domain/classificacao.js";
import type { ClassificacaoCache } from "../ports/cache.js";
import type { EmbeddingProvider } from "../ports/embedding-provider.js";
import type { Reranker } from "../ports/reranker.js";
import type { VectorStore } from "../ports/vector-store.js";
import { hashEntrada, normalizarDescricao } from "./normalize.js";

export interface DependenciasClassificador {
  embeddings: EmbeddingProvider;
  vetores: VectorStore;
  reranker: Reranker;
  cache?: ClassificacaoCache;
}

export interface OpcoesClassificacao {
  modo?: ModoClassificacao;
  k?: number;
}

export const K_PADRAO = 10;
export const K_MAXIMO = 50;

/** Coloca o candidato escolhido pelo LLM no topo; os demais mantêm a ordem vetorial. */
export function reordenar(candidatos: Candidato[], escolha: EscolhaLlm | null): Candidato[] {
  if (!escolha) return candidatos;
  const i = candidatos.findIndex((c) => c.ncm.codigo === escolha.ncm);
  if (i <= 0) return candidatos;
  return [candidatos[i]!, ...candidatos.slice(0, i), ...candidatos.slice(i + 1)];
}

/** normalizar → embed → buscar(k) → rerank → montar resposta */
export function criarClassificador(deps: DependenciasClassificador) {
  return async function classificar(
    entradaBruta: EntradaClassificacao,
    { modo = "vetorial+llm", k = K_PADRAO }: OpcoesClassificacao = {},
  ): Promise<ResultadoClassificacao & { cache: boolean }> {
    const entrada = EntradaClassificacaoSchema.parse(entradaBruta);
    const kEfetivo = Math.min(Math.max(1, Math.trunc(k)), K_MAXIMO);
    const hash = hashEntrada(entrada, modo, deps.embeddings.modelo, kEfetivo);

    const emCache = await deps.cache?.get(hash);
    if (emCache) return { ...emCache, cache: true };

    const texto = normalizarDescricao(entrada);
    const [consulta] = await deps.embeddings.embed([texto], "query");
    const candidatos = await deps.vetores.buscar(deps.embeddings.modelo, consulta!, kEfetivo);
    const escolha = modo === "vetorial+llm" && candidatos.length > 0 ? await deps.reranker.escolher(entrada, candidatos) : null;

    const resultado: ResultadoClassificacao = {
      entrada,
      modo,
      candidatos: reordenar(candidatos, escolha),
      escolha,
      modeloEmbedding: deps.embeddings.modelo,
    };
    await deps.cache?.set(hash, resultado);
    return { ...resultado, cache: false };
  };
}

export type Classificador = ReturnType<typeof criarClassificador>;
