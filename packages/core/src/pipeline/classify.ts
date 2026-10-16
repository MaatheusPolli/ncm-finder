import {
  EntradaClassificacaoSchema,
  type Candidato,
  type EntradaClassificacao,
  type EscolhaLlm,
  type ModoClassificacao,
  type ResultadoClassificacao,
} from "../domain/classificacao.js";
import type { BuscaLexica } from "../ports/busca-lexica.js";
import type { ClassificacaoCache } from "../ports/cache.js";
import type { EmbeddingProvider } from "../ports/embedding-provider.js";
import type { Reranker } from "../ports/reranker.js";
import type { VectorStore } from "../ports/vector-store.js";
import { fundirRrf } from "./fusion.js";
import { hashEntrada, normalizarDescricao } from "./normalize.js";

export interface DependenciasClassificador {
  embeddings: EmbeddingProvider;
  vetores: VectorStore;
  reranker: Reranker;
  cache?: ClassificacaoCache;
  /** Com busca léxica, os candidatos vêm da fusão BM25 + vetorial (RRF), não só da vetorial. */
  lexica?: BuscaLexica;
}

/** Profundidade de cada ranking antes da fusão e constante do RRF, escolhidas na avaliação (ver report/eval.md). */
export const PROFUNDIDADE_FUSAO = 50;
export const C_RRF = 10;

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

/**
 * Funde vetorial e BM25 por RRF. O score exibido continua sendo o cosseno (0 para quem só veio do BM25),
 * porque é o único comparável entre consultas.
 */
export function fundirCandidatos(vetoriais: Candidato[], lexicos: Candidato["ncm"][], k: number): Candidato[] {
  const porCodigo = new Map<string, Candidato>(lexicos.map((ncm) => [ncm.codigo, { ncm, score: 0 }]));
  for (const c of vetoriais) porCodigo.set(c.ncm.codigo, c);
  const ordem = fundirRrf([vetoriais.map((c) => c.ncm.codigo), lexicos.map((n) => n.codigo)], k, C_RRF);
  return ordem.map((codigo) => porCodigo.get(codigo)!);
}

/** normalizar → embed → buscar(k) [+ BM25 e fusão] → rerank → montar resposta */
export function criarClassificador(deps: DependenciasClassificador) {
  // A busca faz parte da identidade do resultado: híbrida e vetorial não compartilham cache.
  const assinaturaBusca = deps.lexica ? `${deps.embeddings.modelo}+bm25` : deps.embeddings.modelo;
  return async function classificar(
    entradaBruta: EntradaClassificacao,
    { modo = "vetorial+llm", k = K_PADRAO }: OpcoesClassificacao = {},
  ): Promise<ResultadoClassificacao & { cache: boolean }> {
    const entrada = EntradaClassificacaoSchema.parse(entradaBruta);
    const kEfetivo = Math.min(Math.max(1, Math.trunc(k)), K_MAXIMO);
    const hash = hashEntrada(entrada, modo, assinaturaBusca, kEfetivo);

    const emCache = await deps.cache?.get(hash);
    if (emCache) return { ...emCache, cache: true };

    const texto = normalizarDescricao(entrada);
    const [consulta] = await deps.embeddings.embed([texto], "query");
    const candidatos = deps.lexica
      ? fundirCandidatos(
          await deps.vetores.buscar(deps.embeddings.modelo, consulta!, PROFUNDIDADE_FUSAO),
          deps.lexica.buscar(texto, PROFUNDIDADE_FUSAO),
          kEfetivo,
        )
      : await deps.vetores.buscar(deps.embeddings.modelo, consulta!, kEfetivo);
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
