import type { Candidato, EntradaClassificacao, EscolhaLlm } from "../domain/classificacao.js";

export interface Reranker {
  escolher(entrada: EntradaClassificacao, candidatos: Candidato[]): Promise<EscolhaLlm | null>;
}
