import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  ClaudeReranker,
  criarReranker,
  montarMensagemRerank,
  NoopReranker,
  SYSTEM_RERANK,
  TOOL_ESCOLHER_NCM,
  type Candidato,
  type ClienteClaude,
} from "../src/index.js";

const candidato = (codigo: string, descricaoCompleta: string): Candidato => ({
  ncm: { codigo, descricao: descricaoCompleta, descricaoCompleta, capitulo: codigo.slice(0, 2), posicao: codigo.slice(0, 4), subposicao: codigo.slice(0, 6) },
  score: 0.8,
});
const CANDIDATOS = [
  candidato("64041100", "Calçado > Sola de borracha > Calçado para esporte"),
  candidato("64041900", "Calçado > Sola de borracha > Outro"),
  candidato("64029990", "Calçado > Outros calçados > Outros"),
];
const ENTRADA = { descricao: "Tênis de corrida masculino", marca: "Acme", categoria: "Calçados" };

function mensagem(parcial: Partial<Anthropic.Beta.BetaMessage>): Anthropic.Beta.BetaMessage {
  return { stop_reason: "tool_use", stop_details: null, content: [], ...parcial } as unknown as Anthropic.Beta.BetaMessage;
}
const toolUse = (input: unknown, name = "escolher_ncm") => ({ type: "tool_use", id: "t1", name, input });

function montar(resposta: Anthropic.Beta.BetaMessage) {
  const create = vi.fn(async (_p: Anthropic.Beta.MessageCreateParamsNonStreaming) => resposta);
  const cliente: ClienteClaude = { beta: { messages: { create } } };
  const descartes: string[] = [];
  const reranker = new ClaudeReranker({ cliente, aoDescartar: (m) => descartes.push(m) });
  return { create, reranker, descartes };
}

describe("montarMensagemRerank", () => {
  it("inclui produto, marca, categoria e candidatos numerados com código formatado", () => {
    const m = montarMensagemRerank(ENTRADA, CANDIDATOS);
    expect(m).toContain("Descrição: Tênis de corrida masculino");
    expect(m).toContain("Marca: Acme");
    expect(m).toContain("Categoria informada pelo vendedor: Calçados");
    expect(m).toContain("1. 64041100 (6404.11.00): Calçado > Sola de borracha > Calçado para esporte");
    expect(montarMensagemRerank({ descricao: "x" }, [])).not.toContain("Marca");
  });
});

describe("ClaudeReranker", () => {
  it("monta a requisição: modelo, tool strict, system cacheado, fallbacks, conteúdo variável na mensagem", async () => {
    const { create, reranker } = montar(
      mensagem({ content: [toolUse({ ncm: "64041100", confianca: 0.9, justificativa: "RGI 1", alternativas: [] })] as never }),
    );
    await reranker.escolher(ENTRADA, CANDIDATOS);
    const p = create.mock.calls[0]![0];
    expect(p.model).toBe("claude-opus-5");
    expect(p.tools).toEqual([TOOL_ESCOLHER_NCM]);
    expect(TOOL_ESCOLHER_NCM.strict).toBe(true);
    expect(p.tool_choice).toEqual({ type: "auto" });
    expect(p.system).toEqual([{ type: "text", text: SYSTEM_RERANK, cache_control: { type: "ephemeral" } }]);
    expect(p.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(p.fallbacks).toBe("default");
    expect(p.output_config).toEqual({ effort: "medium" });
    // System fixo não contém nada do produto (senão o cache nunca acerta)
    expect(SYSTEM_RERANK).not.toContain("Tênis");
    expect(p.messages[0]!.content).toContain("Tênis de corrida masculino");
  });

  it("devolve a escolha validada e filtra alternativas inválidas/duplicadas", async () => {
    const { reranker } = montar(
      mensagem({
        content: [
          { type: "text", text: "Analisando..." },
          toolUse({ ncm: "64041100", confianca: 0.92, justificativa: "Calçado para esporte (RGI 1 e 6).", alternativas: ["64041900", "99999999", "64041100"] }),
        ] as never,
      }),
    );
    expect(await reranker.escolher(ENTRADA, CANDIDATOS)).toEqual({
      ncm: "64041100", confianca: 0.92, justificativa: "Calçado para esporte (RGI 1 e 6).", alternativas: ["64041900"],
    });
  });

  it("fallback: código fora dos candidatos usa a melhor alternativa válida com confiança reduzida", async () => {
    const { reranker, descartes } = montar(
      mensagem({ content: [toolUse({ ncm: "64039990", confianca: 0.9, justificativa: "x", alternativas: ["64041900", "64029990"] })] as never }),
    );
    const r = await reranker.escolher(ENTRADA, CANDIDATOS);
    expect(r?.ncm).toBe("64041900");
    expect(r?.confianca).toBe(0.3);
    expect(r?.alternativas).toEqual(["64029990"]);
    expect(r?.justificativa).toMatch(/64039990.*não está entre os candidatos/);
    expect(descartes).toEqual(["fora_dos_candidatos"]);
  });

  it("fallback: código fora dos candidatos e sem alternativa válida → null", async () => {
    const { reranker } = montar(mensagem({ content: [toolUse({ ncm: "64039990", confianca: 0.9, justificativa: "x", alternativas: [] })] as never }));
    expect(await reranker.escolher(ENTRADA, CANDIDATOS)).toBeNull();
  });

  it("null quando não há tool_use, schema inválido ou recusa", async () => {
    const semTool = montar(mensagem({ stop_reason: "end_turn", content: [{ type: "text", text: "Acho que 6404" }] as never }));
    expect(await semTool.reranker.escolher(ENTRADA, CANDIDATOS)).toBeNull();
    expect(semTool.descartes).toEqual(["sem_tool_use"]);

    const outraTool = montar(mensagem({ content: [toolUse({}, "outra")] as never }));
    expect(await outraTool.reranker.escolher(ENTRADA, CANDIDATOS)).toBeNull();

    const invalido = montar(mensagem({ content: [toolUse({ ncm: "6404", confianca: 3, justificativa: "" })] as never }));
    expect(await invalido.reranker.escolher(ENTRADA, CANDIDATOS)).toBeNull();
    expect(invalido.descartes).toEqual(["schema_invalido"]);

    const recusa = montar(mensagem({ stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: null } as never }));
    expect(await recusa.reranker.escolher(ENTRADA, CANDIDATOS)).toBeNull();
    expect(recusa.descartes).toEqual(["recusa"]);
  });

  it("não chama a API sem candidatos", async () => {
    const { create, reranker } = montar(mensagem({}));
    expect(await reranker.escolher(ENTRADA, [])).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("aceita modelo e esforço customizados e aoDescartar padrão silencioso", async () => {
    const create = vi.fn(async () => mensagem({ stop_reason: "end_turn", content: [] }));
    const r = new ClaudeReranker({ cliente: { beta: { messages: { create } } }, modelo: "claude-sonnet-5", esforco: "low" });
    expect(await r.escolher(ENTRADA, CANDIDATOS)).toBeNull();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-sonnet-5", output_config: { effort: "low" } }));
  });
});

describe("criarReranker", () => {
  const cliente: ClienteClaude = { beta: { messages: { create: vi.fn() } } };

  it("noop sem credencial, claude com credencial ou RERANKER=claude", () => {
    expect(criarReranker({})).toBeInstanceOf(NoopReranker);
    expect(criarReranker({ ANTHROPIC_API_KEY: "k" }, cliente)).toBeInstanceOf(ClaudeReranker);
    const r = criarReranker({ RERANKER: "claude", ANTHROPIC_MODEL: "claude-sonnet-5", ANTHROPIC_EFFORT: "high" }, cliente);
    expect((r as ClaudeReranker).modelo).toBe("claude-sonnet-5");
    expect(criarReranker({ ANTHROPIC_API_KEY: "k", RERANKER: "noop" })).toBeInstanceOf(NoopReranker);
  });

  it("valida o tipo", () => {
    expect(() => criarReranker({ RERANKER: "gpt" })).toThrow(/desconhecido/);
  });

  it("aoDescartar padrão loga só o motivo", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const create = vi.fn(async () => mensagem({ stop_reason: "end_turn", content: [] }));
    await criarReranker({ RERANKER: "claude" }, { beta: { messages: { create } } }).escolher(ENTRADA, CANDIDATOS);
    expect(warn).toHaveBeenCalledWith("[reranker] resposta descartada: sem_tool_use (stop_reason=end_turn)");
    warn.mockRestore();
  });
});
