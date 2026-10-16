import { describe, expect, it, vi } from "vitest";
import { VoyageEmbeddingProvider } from "../src/index.js";

const resposta = (status: number, corpo: unknown) =>
  new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status });

describe("VoyageEmbeddingProvider", () => {
  it("exige api key", () => {
    expect(() => new VoyageEmbeddingProvider({ apiKey: "" })).toThrow(/VOYAGE_API_KEY/);
  });

  it("envia modelo e input_type e reordena pelo index", async () => {
    const f = vi.fn(async () =>
      resposta(200, { data: [{ index: 1, embedding: [2] }, { index: 0, embedding: [1] }] }),
    );
    const p = new VoyageEmbeddingProvider({ apiKey: "k", fetch: f });
    expect(p.modelo).toBe("voyage-3");
    expect(p.dimensao).toBe(1024);

    expect(await p.embed(["a", "b"], "query")).toEqual([[1], [2]]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.voyageai.com/v1/embeddings");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
    expect(JSON.parse(init.body as string)).toEqual({ input: ["a", "b"], model: "voyage-3", input_type: "query" });
  });

  it("não chama a API para lista vazia", async () => {
    const f = vi.fn();
    expect(await new VoyageEmbeddingProvider({ apiKey: "k", fetch: f }).embed([], "document")).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("propaga erro HTTP", async () => {
    const p = new VoyageEmbeddingProvider({ apiKey: "k", fetch: async () => resposta(429, "rate limited") });
    await expect(p.embed(["a"], "document")).rejects.toThrow(/429: rate limited/);
  });
});
