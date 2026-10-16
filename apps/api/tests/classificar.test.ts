import type { ResultadoClassificacao } from "@ncm-finder/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { criarApp } from "../src/app.js";
import type { Container } from "@ncm-finder/core";

const resultado: ResultadoClassificacao & { cache: boolean } = {
  entrada: { descricao: "Tênis de corrida" },
  modo: "vetorial",
  candidatos: [
    {
      ncm: { codigo: "64041100", descricao: "Calçado para esporte", descricaoCompleta: "Calçado > Calçado para esporte", capitulo: "64", posicao: "6404", subposicao: "640411" },
      score: 0.87,
    },
  ],
  escolha: null,
  modeloEmbedding: "m",
  cache: false,
};

function montar(parcial: Partial<Container> = {}) {
  const classificar = vi.fn(async () => resultado);
  const container: Container = {
    classificar,
    info: { modeloEmbedding: "m", reranker: "claude-opus-5", armazenamento: "arquivo" },
    llmDisponivel: true,
    fechar: async () => {},
    ...parcial,
  };
  return { app: criarApp(container), classificar };
}

describe("API", () => {
  afterEach(() => vi.restoreAllMocks());

  it("GET /health", async () => {
    const { app } = montar();
    const r = await app.inject({ method: "GET", url: "/health" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: "ok", modeloEmbedding: "m", reranker: "claude-opus-5", armazenamento: "arquivo" });
  });

  it("POST /classificar com defaults (modo vetorial+llm, k=10)", async () => {
    const { app, classificar } = montar();
    const r = await app.inject({ method: "POST", url: "/classificar", payload: { descricao: "Tênis de corrida", marca: "Acme" } });
    expect(r.statusCode).toBe(200);
    expect(r.json().candidatos[0].ncm.codigo).toBe("64041100");
    expect(classificar).toHaveBeenCalledWith({ descricao: "Tênis de corrida", marca: "Acme" }, { modo: "vetorial+llm", k: 10 });
  });

  it("aceita modo e k pela query string", async () => {
    const { app, classificar } = montar();
    await app.inject({ method: "POST", url: "/classificar?modo=vetorial&k=5", payload: { descricao: "mel" } });
    expect(classificar).toHaveBeenCalledWith({ descricao: "mel" }, { modo: "vetorial", k: 5 });
  });

  it("400 padronizado para corpo e query inválidos", async () => {
    const { app, classificar } = montar();
    const corpo = await app.inject({ method: "POST", url: "/classificar", payload: { descricao: "" } });
    expect(corpo.statusCode).toBe(400);
    expect(corpo.json().erro.codigo).toBe("ENTRADA_INVALIDA");
    expect(corpo.json().erro.detalhes[0].campo).toBe("body.descricao");

    const query = await app.inject({ method: "POST", url: "/classificar?k=999", payload: { descricao: "mel" } });
    expect(query.statusCode).toBe(400);
    expect(query.json().erro.detalhes[0].campo).toBe("querystring.k");
    expect(classificar).not.toHaveBeenCalled();
  });

  it("400 para JSON malformado", async () => {
    const { app } = montar();
    const r = await app.inject({ method: "POST", url: "/classificar", headers: { "content-type": "application/json" }, payload: "{oops" });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro.mensagem).toBeTruthy();
  });

  it("422 quando o modo LLM não está configurado", async () => {
    const { app } = montar({ llmDisponivel: false });
    const r = await app.inject({ method: "POST", url: "/classificar", payload: { descricao: "mel" } });
    expect(r.statusCode).toBe(422);
    expect(r.json()).toEqual({ erro: { codigo: "LLM_INDISPONIVEL", mensagem: expect.stringContaining("modo=vetorial") } });
  });

  it("500 genérico sem vazar detalhes internos", async () => {
    const { app } = montar({ classificar: vi.fn(async () => { throw new Error("conexão com o banco caiu: senha=xyz"); }) });
    const r = await app.inject({ method: "POST", url: "/classificar?modo=vetorial", payload: { descricao: "mel" } });
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ erro: { codigo: "ERRO_INTERNO", mensagem: "Erro interno ao classificar." } });
  });
});
