import { describe, expect, it } from "vitest";
import { criarEmbeddingProvider, LocalTransformersProvider, VoyageEmbeddingProvider } from "../src/index.js";

describe("criarEmbeddingProvider", () => {
  it("usa voyage quando há chave", () => {
    const p = criarEmbeddingProvider({ VOYAGE_API_KEY: "k" });
    expect(p).toBeInstanceOf(VoyageEmbeddingProvider);
    expect(criarEmbeddingProvider({ VOYAGE_API_KEY: "k", VOYAGE_MODEL: "voyage-3-large" }).modelo).toBe("voyage-3-large");
  });

  it("cai para local sem chave", () => {
    expect(criarEmbeddingProvider({})).toBeInstanceOf(LocalTransformersProvider);
    expect(criarEmbeddingProvider({}).modelo).toBe("Xenova/bge-m3");
    expect(criarEmbeddingProvider({ EMBEDDING_PROVIDER: "local", LOCAL_EMBEDDING_MODEL: "Xenova/bge-m3" }).dimensao).toBe(1024);
    expect(() => criarEmbeddingProvider({ EMBEDDING_PROVIDER: "local", LOCAL_EMBEDDING_MODEL: "x/y" })).toThrow(/sem perfil conhecido/);
  });

  it("valida o tipo e a chave", () => {
    expect(() => criarEmbeddingProvider({ EMBEDDING_PROVIDER: "openai" })).toThrow(/desconhecido/);
    expect(() => criarEmbeddingProvider({ EMBEDDING_PROVIDER: "voyage" })).toThrow(/VOYAGE_API_KEY/);
  });
});
