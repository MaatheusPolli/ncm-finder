import type { EmbeddingProvider } from "../../ports/embedding-provider.js";

type Pooling = "mean" | "cls";
type Extrator = (textos: string[], opcoes: { pooling: Pooling; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

interface PerfilModelo {
  dimensao: number;
  pooling: Pooling;
  prefixoConsulta: string;
  prefixoDocumento: string;
}

/**
 * Cada família tem seu jeito de gerar o vetor: e5 exige os prefixos "query: "/"passage: " e usa média;
 * bge-m3 (denso) usa o token CLS e dispensa prefixo. Usar o perfil errado degrada a busca em silêncio.
 */
const E5 = { pooling: "mean", prefixoConsulta: "query: ", prefixoDocumento: "passage: " } as const;
export const PERFIS_LOCAIS: Record<string, PerfilModelo> = {
  "Xenova/multilingual-e5-small": { ...E5, dimensao: 384 },
  "Xenova/multilingual-e5-base": { ...E5, dimensao: 768 },
  "Xenova/multilingual-e5-large": { ...E5, dimensao: 1024 },
  "Xenova/bge-m3": { dimensao: 1024, pooling: "cls", prefixoConsulta: "", prefixoDocumento: "" },
};

export interface OpcoesLocal {
  modelo?: string;
  /** Obrigatório para modelos fora de PERFIS_LOCAIS. */
  perfil?: PerfilModelo;
  /** Injetável nos testes para não baixar o modelo. */
  carregar?: (modelo: string) => Promise<Extrator>;
}

/* v8 ignore next 4 -- carrega o modelo real (120 MB a 600 MB); exercitado pelo pnpm eval, não pelos testes */
async function carregarPipeline(modelo: string): Promise<Extrator> {
  const { pipeline } = await import("@huggingface/transformers");
  return (await pipeline("feature-extraction", modelo, { dtype: "q8" })) as unknown as Extrator;
}

/** Embeddings offline (custo zero) via ONNX. */
export class LocalTransformersProvider implements EmbeddingProvider {
  readonly modelo: string;
  readonly dimensao: number;
  private readonly perfil: PerfilModelo;
  private extrator?: Promise<Extrator>;
  private readonly carregar: (modelo: string) => Promise<Extrator>;

  constructor({ modelo = "Xenova/multilingual-e5-small", perfil, carregar = carregarPipeline }: OpcoesLocal = {}) {
    const p = perfil ?? PERFIS_LOCAIS[modelo];
    if (!p) throw new Error(`Modelo local sem perfil conhecido: "${modelo}". Use um de ${Object.keys(PERFIS_LOCAIS).join(", ")} ou informe o perfil.`);
    this.modelo = modelo;
    this.perfil = p;
    this.dimensao = p.dimensao;
    this.carregar = carregar;
  }

  async embed(textos: string[], tipo: "query" | "document"): Promise<number[][]> {
    if (textos.length === 0) return [];
    this.extrator ??= this.carregar(this.modelo);
    const prefixo = tipo === "query" ? this.perfil.prefixoConsulta : this.perfil.prefixoDocumento;
    const saida = await (await this.extrator)(textos.map((t) => prefixo + t), { pooling: this.perfil.pooling, normalize: true });
    return saida.tolist();
  }
}
