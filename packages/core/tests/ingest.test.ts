import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  construirNcms,
  dataBrParaIso,
  EmbeddingDimensionError,
  embedNcms,
  HierarquiaNcm,
  limparDescricao,
  MemoryVectorStore,
  parseTabelaNcm,
  type EmbeddingProvider,
} from "../src/index.js";

const amostra: unknown = JSON.parse(readFileSync(new URL("./fixtures/siscomex-amostra.json", import.meta.url), "utf8"));
const REFERENCIA = "2026-09-23";

describe("parseTabelaNcm", () => {
  const tabela = parseTabelaNcm(amostra, REFERENCIA);

  it("lê metadados e normaliza códigos para dígitos", () => {
    expect(tabela.ato).toBe("Resolução Gecex nº 926/2026");
    expect(tabela.nos.map((n) => n.codigo)).toContain("64041100");
    expect(tabela.nos.find((n) => n.codigo === "6404")?.vigenciaInicio).toBe("2022-04-01");
  });

  it("descarta códigos fora de vigência", () => {
    const codigos = tabela.nos.map((n) => n.codigo);
    expect(codigos).not.toContain("64041990");
    expect(codigos).not.toContain("64042000");
  });

  it("rejeita JSON fora do formato", () => {
    expect(() => parseTabelaNcm({ foo: 1 })).toThrow();
  });

  it("usa hoje como referência por padrão", () => {
    expect(parseTabelaNcm(amostra).nos.length).toBeGreaterThan(0);
  });
});

describe("helpers", () => {
  it("converte data", () => {
    expect(dataBrParaIso("31/12/9999")).toBe("9999-12-31");
    expect(() => dataBrParaIso("2022-01-01")).toThrow();
  });

  it("limpa descrição", () => {
    expect(limparDescricao("-- Aves da espécie <i>Gallus  domesticus</i>")).toBe("Aves da espécie Gallus domesticus");
  });
});

describe("HierarquiaNcm", () => {
  const h = new HierarquiaNcm(parseTabelaNcm(amostra, REFERENCIA).nos);

  it("pais de 64041100 são 64, 6404 e 64041", () => {
    expect(h.ancestrais("64041100").map((n) => n.codigo)).toEqual(["64", "6404", "64041"]);
  });

  it("resolve todos os níveis intermediários (item de 7 dígitos)", () => {
    expect(h.ancestrais("01051110").map((n) => n.codigo)).toEqual(["01", "0105", "01051", "010511", "0105111"]);
  });

  it("posição sem subdivisão tem apenas o capítulo como pai", () => {
    expect(h.ancestrais("04090000").map((n) => n.codigo)).toEqual(["04"]);
  });

  it("folhas são só os códigos de 8 dígitos", () => {
    expect(h.folhas().every((n) => n.codigo.length === 8)).toBe(true);
    expect(h.get("64")?.descricao).toMatch(/^Calçado/);
  });
});

describe("construirNcms", () => {
  const ncms = construirNcms(parseTabelaNcm(amostra, REFERENCIA));

  it("gera um NCM por código de 8 dígitos vigente, ordenado", () => {
    expect(ncms.map((n) => n.codigo)).toEqual(["01051110", "04090000", "64041100", "64041900"]);
  });

  it("concatena a hierarquia na descrição completa", () => {
    const outro = ncms.find((n) => n.codigo === "64041900")!;
    expect(outro.descricao).toBe("Outro");
    expect(outro.descricaoCompleta).toBe(
      "Calçado, polainas e artigos semelhantes; suas partes. > " +
        "Calçado com sola exterior de borracha, plástico, couro natural ou reconstituído e parte superior de matérias têxteis. > " +
        "Calçado com sola exterior de borracha ou de plástico > Outro",
    );
    expect(outro).toMatchObject({ capitulo: "64", posicao: "6404", subposicao: "640419" });
  });
});

describe("embedNcms", () => {
  const ncms = construirNcms(parseTabelaNcm(amostra, REFERENCIA));
  const fakeProvider = (dimensao = 3): EmbeddingProvider & { embed: ReturnType<typeof vi.fn> } => ({
    modelo: "fake-v1",
    dimensao,
    embed: vi.fn(async (textos: string[]) => textos.map((t) => [t.length, 1, 0])),
  });

  it("gera em lotes e é idempotente", async () => {
    const store = new MemoryVectorStore();
    const provider = fakeProvider();
    const progresso: number[] = [];

    const r1 = await embedNcms(ncms, provider, store, { tamanhoLote: 3, aoProgredir: (g) => progresso.push(g) });
    expect(r1).toEqual({ modelo: "fake-v1", total: 4, jaIndexados: 0, gerados: 4 });
    expect(provider.embed).toHaveBeenCalledTimes(2);
    expect(provider.embed).toHaveBeenCalledWith(expect.any(Array), "document");
    expect(progresso).toEqual([3, 4]);

    const r2 = await embedNcms(ncms, provider, store);
    expect(r2).toMatchObject({ jaIndexados: 4, gerados: 0 });
    expect(provider.embed).toHaveBeenCalledTimes(2);
  });

  it("rejeita dimensão errada", async () => {
    await expect(embedNcms(ncms, fakeProvider(1024), new MemoryVectorStore())).rejects.toThrow(EmbeddingDimensionError);
  });

  it("rejeita quantidade de vetores diferente da de textos", async () => {
    const provider = { modelo: "x", dimensao: 3, embed: async () => [[1, 2, 3]] };
    await expect(embedNcms(ncms, provider, new MemoryVectorStore())).rejects.toThrow(/1 vetores para 4 textos/);
  });
});
