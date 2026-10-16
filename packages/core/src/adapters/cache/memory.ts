import type { ResultadoClassificacao } from "../../domain/classificacao.js";
import type { ClassificacaoCache } from "../../ports/cache.js";

export class MemoryCache implements ClassificacaoCache {
  private readonly dados = new Map<string, ResultadoClassificacao>();

  async get(hash: string): Promise<ResultadoClassificacao | undefined> {
    return this.dados.get(hash);
  }

  async set(hash: string, resultado: ResultadoClassificacao): Promise<void> {
    this.dados.set(hash, resultado);
  }
}
