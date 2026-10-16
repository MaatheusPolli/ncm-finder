import type { ResultadoClassificacao } from "../domain/classificacao.js";

export interface ClassificacaoCache {
  get(hash: string): Promise<ResultadoClassificacao | undefined>;
  set(hash: string, resultado: ResultadoClassificacao): Promise<void>;
}
