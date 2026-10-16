import { describe, expect, it } from "vitest";
import {
  EntradaClassificacaoSchema,
  EscolhaLlmSchema,
  formatarCodigo,
  hierarquiaDe,
  InvalidNcmCodeError,
  normalizarCodigo,
} from "../src/index.js";

describe("ncm", () => {
  it("hierarquia de 64041100", () => {
    expect(hierarquiaDe("6404.11.00")).toEqual({
      capitulo: "64",
      posicao: "6404",
      subposicao: "640411",
      codigo: "64041100",
    });
  });

  it("formata e normaliza", () => {
    expect(formatarCodigo("64041100")).toBe("6404.11.00");
    expect(normalizarCodigo(" 6404.11.00 ")).toBe("64041100");
  });

  it("rejeita código inválido", () => {
    expect(() => normalizarCodigo("6404")).toThrow(InvalidNcmCodeError);
  });
});

describe("schemas", () => {
  it("valida entrada", () => {
    expect(EntradaClassificacaoSchema.safeParse({ descricao: " tênis " }).data?.descricao).toBe("tênis");
    expect(EntradaClassificacaoSchema.safeParse({ descricao: "a" }).success).toBe(false);
  });

  it("valida escolha do LLM com default de alternativas", () => {
    const r = EscolhaLlmSchema.parse({ ncm: "64041100", confianca: 0.9, justificativa: "calçado esportivo" });
    expect(r.alternativas).toEqual([]);
    expect(EscolhaLlmSchema.safeParse({ ncm: "6404", confianca: 2, justificativa: "" }).success).toBe(false);
  });
});
