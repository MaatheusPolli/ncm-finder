import type { Pool } from "pg";
import type { Candidato } from "../../domain/classificacao.js";
import type { Ncm } from "../../domain/ncm.js";
import type { VectorStore } from "../../ports/vector-store.js";

type Item = { ncm: Ncm; embedding: number[] };

const literal = (v: number[]) => `[${v.join(",")}]`;

/** Nome de índice seguro derivado do modelo ("voyage-3" → "ncm_embedding_hnsw_voyage_3"). */
export function nomeIndice(modelo: string): string {
  return `ncm_embedding_hnsw_${modelo.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`.slice(0, 63);
}

export class PgVectorStore implements VectorStore {
  private readonly indicesProntos = new Set<string>();

  constructor(private readonly pool: Pool) {}

  async upsert(modelo: string, itens: Item[]): Promise<void> {
    if (itens.length === 0) return;
    const cliente = await this.pool.connect();
    try {
      await cliente.query("BEGIN");
      for (const { ncm } of itens) {
        await cliente.query(
          `INSERT INTO ncm (codigo, descricao, descricao_completa, capitulo, posicao, subposicao, vigencia_inicio, vigencia_fim)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (codigo) DO UPDATE SET descricao = EXCLUDED.descricao, descricao_completa = EXCLUDED.descricao_completa,
             vigencia_inicio = EXCLUDED.vigencia_inicio, vigencia_fim = EXCLUDED.vigencia_fim`,
          [ncm.codigo, ncm.descricao, ncm.descricaoCompleta, ncm.capitulo, ncm.posicao, ncm.subposicao, ncm.vigenciaInicio ?? null, ncm.vigenciaFim ?? null],
        );
      }
      await cliente.query(
        `INSERT INTO ncm_embedding (codigo, modelo, embedding)
         SELECT c, $1, e::vector FROM unnest($2::text[], $3::text[]) AS t(c, e)
         ON CONFLICT (codigo, modelo) DO UPDATE SET embedding = EXCLUDED.embedding`,
        [modelo, itens.map((i) => i.ncm.codigo), itens.map((i) => literal(i.embedding))],
      );
      await cliente.query("COMMIT");
    } catch (erro) {
      await cliente.query("ROLLBACK");
      throw erro;
    } finally {
      cliente.release();
    }
    await this.garantirIndice(modelo, itens[0]!.embedding.length);
  }

  /** HNSW parcial por modelo: a coluna não tem dimensão fixa, então o índice faz o cast. */
  async garantirIndice(modelo: string, dimensao: number): Promise<void> {
    if (this.indicesProntos.has(modelo)) return;
    const modeloSql = modelo.replace(/'/g, "''");
    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS ${nomeIndice(modelo)} ON ncm_embedding
       USING hnsw ((embedding::vector(${Math.trunc(dimensao)})) vector_cosine_ops) WHERE modelo = '${modeloSql}'`,
    );
    this.indicesProntos.add(modelo);
  }

  async buscar(modelo: string, consulta: number[], k: number): Promise<Candidato[]> {
    const dim = Math.trunc(consulta.length);
    const { rows } = await this.pool.query<{
      codigo: string; descricao: string; descricao_completa: string;
      capitulo: string; posicao: string; subposicao: string; distancia: number;
    }>(
      `SELECT n.codigo, n.descricao, n.descricao_completa, n.capitulo, n.posicao, n.subposicao,
              (e.embedding::vector(${dim}) <=> $1::vector(${dim})) AS distancia
       FROM ncm_embedding e JOIN ncm n USING (codigo)
       WHERE e.modelo = $2
       ORDER BY e.embedding::vector(${dim}) <=> $1::vector(${dim})
       LIMIT $3`,
      [literal(consulta), modelo, k],
    );
    return rows.map((r) => ({
      ncm: {
        codigo: r.codigo, descricao: r.descricao, descricaoCompleta: r.descricao_completa,
        capitulo: r.capitulo, posicao: r.posicao, subposicao: r.subposicao,
      },
      score: 1 - Number(r.distancia),
    }));
  }

  async codigosIndexados(modelo: string): Promise<Set<string>> {
    const { rows } = await this.pool.query<{ codigo: string }>("SELECT codigo FROM ncm_embedding WHERE modelo = $1", [modelo]);
    return new Set(rows.map((r) => r.codigo));
  }
}
