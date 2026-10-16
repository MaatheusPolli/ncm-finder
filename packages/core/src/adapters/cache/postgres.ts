import type { Pool } from "pg";
import type { ResultadoClassificacao } from "../../domain/classificacao.js";
import type { ClassificacaoCache } from "../../ports/cache.js";

export class PostgresCache implements ClassificacaoCache {
  constructor(private readonly pool: Pool) {}

  async get(hash: string): Promise<ResultadoClassificacao | undefined> {
    const { rows } = await this.pool.query<{ resultado: ResultadoClassificacao }>(
      "SELECT resultado FROM classificacao_cache WHERE hash = $1",
      [hash],
    );
    return rows[0]?.resultado;
  }

  async set(hash: string, resultado: ResultadoClassificacao): Promise<void> {
    await this.pool.query(
      `INSERT INTO classificacao_cache (hash, entrada, resultado) VALUES ($1, $2, $3)
       ON CONFLICT (hash) DO UPDATE SET resultado = EXCLUDED.resultado, criado_em = now()`,
      [hash, JSON.stringify(resultado.entrada), JSON.stringify(resultado)],
    );
  }
}
