export interface EmbeddingProvider {
  /** Identificador versionado do modelo, gravado junto ao vetor (ex.: "voyage-3"). */
  readonly modelo: string;
  readonly dimensao: number;
  /** "query" e "document" permitem modelos assimétricos (e5, voyage input_type). */
  embed(textos: string[], tipo: "query" | "document"): Promise<number[][]>;
}
