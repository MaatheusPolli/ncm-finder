import { z } from "zod";
import type { EmbeddingProvider } from "../../ports/embedding-provider.js";

const RespostaVoyageSchema = z.object({
  data: z.array(z.object({ index: z.number(), embedding: z.array(z.number()) })),
});

export interface OpcoesVoyage {
  apiKey: string;
  modelo?: string;
  dimensao?: number;
  url?: string;
  fetch?: typeof fetch;
}

/** Adapter para a API de embeddings da Voyage AI (https://docs.voyageai.com/reference/embeddings-api). */
export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly modelo: string;
  readonly dimensao: number;
  private readonly apiKey: string;
  private readonly url: string;
  private readonly fetch: typeof fetch;

  constructor({ apiKey, modelo = "voyage-3", dimensao = 1024, url = "https://api.voyageai.com/v1/embeddings", fetch: f = (url, init) => globalThis.fetch(url, init) }: OpcoesVoyage) {
    if (!apiKey) throw new Error("VOYAGE_API_KEY não configurada");
    this.apiKey = apiKey;
    this.modelo = modelo;
    this.dimensao = dimensao;
    this.url = url;
    this.fetch = f;
  }

  async embed(textos: string[], tipo: "query" | "document"): Promise<number[][]> {
    if (textos.length === 0) return [];
    const resposta = await this.fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ input: textos, model: this.modelo, input_type: tipo }),
    });
    if (!resposta.ok) {
      throw new Error(`Voyage AI respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`);
    }
    const { data } = RespostaVoyageSchema.parse(await resposta.json());
    return [...data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}
