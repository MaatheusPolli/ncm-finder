import type { Candidato } from "../../domain/classificacao.js";
import type { Ncm } from "../../domain/ncm.js";
import type { VectorStore } from "../../ports/vector-store.js";
import { cosseno } from "./cosine.js";

type Item = { ncm: Ncm; embedding: number[] };

export class MemoryVectorStore implements VectorStore {
  private readonly porModelo = new Map<string, Map<string, Item>>();

  async upsert(modelo: string, itens: Item[]): Promise<void> {
    const m = this.porModelo.get(modelo) ?? new Map<string, Item>();
    for (const item of itens) m.set(item.ncm.codigo, item);
    this.porModelo.set(modelo, m);
  }

  async buscar(modelo: string, consulta: number[], k: number): Promise<Candidato[]> {
    const itens = [...(this.porModelo.get(modelo)?.values() ?? [])];
    return itens
      .map(({ ncm, embedding }) => ({ ncm, score: cosseno(consulta, embedding) }))
      .sort((a, b) => b.score - a.score || a.ncm.codigo.localeCompare(b.ncm.codigo))
      .slice(0, k);
  }

  async codigosIndexados(modelo: string): Promise<Set<string>> {
    return new Set(this.porModelo.get(modelo)?.keys() ?? []);
  }
}
