import type { EmbeddingProvider } from "../../ports/embedding-provider.js";

type Extrator = (textos: string[], opcoes: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

export interface OpcoesLocal {
  modelo?: string;
  dimensao?: number;
  /** Injetável nos testes para não baixar o modelo. */
  carregar?: (modelo: string) => Promise<Extrator>;
}

/* v8 ignore next 4 -- carrega o modelo real (~120 MB); exercitado pelo pnpm eval, não pelos testes */
async function carregarPipeline(modelo: string): Promise<Extrator> {
  const { pipeline } = await import("@huggingface/transformers");
  return (await pipeline("feature-extraction", modelo, { dtype: "q8" })) as unknown as Extrator;
}

/**
 * Embeddings offline (custo zero) com multilingual-e5 via ONNX.
 * Os modelos e5 exigem os prefixos "query: " e "passage: ".
 */
export class LocalTransformersProvider implements EmbeddingProvider {
  readonly modelo: string;
  readonly dimensao: number;
  private extrator?: Promise<Extrator>;
  private readonly carregar: (modelo: string) => Promise<Extrator>;

  constructor({ modelo = "Xenova/multilingual-e5-small", dimensao = 384, carregar = carregarPipeline }: OpcoesLocal = {}) {
    this.modelo = modelo;
    this.dimensao = dimensao;
    this.carregar = carregar;
  }

  async embed(textos: string[], tipo: "query" | "document"): Promise<number[][]> {
    if (textos.length === 0) return [];
    this.extrator ??= this.carregar(this.modelo);
    const prefixo = tipo === "query" ? "query: " : "passage: ";
    const saida = await (await this.extrator)(textos.map((t) => prefixo + t), { pooling: "mean", normalize: true });
    return saida.tolist();
  }
}
