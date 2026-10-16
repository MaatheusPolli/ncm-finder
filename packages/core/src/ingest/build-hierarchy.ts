import type { NoNcm } from "./parse-ncm.js";

/** Índice dos nós por código, usado para resolver os pais de um NCM de 8 dígitos. */
export class HierarquiaNcm {
  private readonly porCodigo: Map<string, NoNcm>;

  constructor(nos: NoNcm[]) {
    this.porCodigo = new Map(nos.map((n) => [n.codigo, n]));
  }

  get(codigo: string): NoNcm | undefined {
    return this.porCodigo.get(codigo);
  }

  /**
   * Ancestrais do capítulo até o pai imediato. Cada nível é um prefixo de dígitos do código;
   * níveis inexistentes (ex.: posição sem subdivisão, "0205.00.00") são simplesmente pulados.
   */
  ancestrais(codigo: string): NoNcm[] {
    const resultado: NoNcm[] = [];
    for (let tamanho = 2; tamanho < codigo.length; tamanho++) {
      const no = this.porCodigo.get(codigo.slice(0, tamanho));
      if (no) resultado.push(no);
    }
    return resultado;
  }

  /** NCMs classificáveis: apenas os códigos completos de 8 dígitos. */
  folhas(): NoNcm[] {
    return [...this.porCodigo.values()].filter((n) => n.codigo.length === 8);
  }
}
