import type { Candidato } from "../domain/classificacao.js";
import type { Ncm } from "../domain/ncm.js";

export interface VectorStore {
  upsert(modelo: string, itens: { ncm: Ncm; embedding: number[] }[]): Promise<void>;
  buscar(modelo: string, consulta: number[], k: number): Promise<Candidato[]>;
  /** Códigos que já têm embedding para o modelo — permite ingestão idempotente. */
  codigosIndexados(modelo: string): Promise<Set<string>>;
}
