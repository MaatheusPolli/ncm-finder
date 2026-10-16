import type Anthropic from "@anthropic-ai/sdk";
import { EscolhaLlmSchema, type Candidato, type EntradaClassificacao, type EscolhaLlm } from "../../domain/classificacao.js";
import type { Reranker } from "../../ports/reranker.js";
import { validarEscolha, type MotivoFallback } from "./validar-escolha.js";
import { montarMensagemRerank, NOME_TOOL, SYSTEM_RERANK, TOOL_ESCOLHER_NCM } from "../../pipeline/prompts/rerank.js";

type Esforco = "low" | "medium" | "high" | "xhigh" | "max";

/** Só o que o adapter usa do SDK — facilita o mock nos testes. */
export interface ClienteClaude {
  beta: { messages: { create(params: Anthropic.Beta.MessageCreateParamsNonStreaming): Promise<Anthropic.Beta.BetaMessage> } };
}

export type { MotivoFallback };

export interface OpcoesClaudeReranker {
  cliente: ClienteClaude;
  modelo?: string;
  esforco?: Esforco;
  /** Chamado quando a resposta do LLM não é aproveitável; nunca recebe o prompt (pode conter dados de cliente). */
  aoDescartar?: (motivo: MotivoFallback, detalhe: string) => void;
}

export const MODELO_PADRAO = "claude-opus-5";

/**
 * Reranker com tool use: `strict: true` garante o schema no lado da API; Zod revalida aqui.
 * `tool_choice: auto` (e não forçado) porque modelos mais novos rejeitam tool_choice forçado
 * e ele é incompatível com thinking — a instrução no system prompt pede a tool.
 */
export class ClaudeReranker implements Reranker {
  private readonly cliente: ClienteClaude;
  readonly modelo: string;
  private readonly esforco: Esforco;
  private readonly aoDescartar: (motivo: MotivoFallback, detalhe: string) => void;

  constructor({ cliente, modelo = MODELO_PADRAO, esforco = "medium", aoDescartar = () => {} }: OpcoesClaudeReranker) {
    this.cliente = cliente;
    this.modelo = modelo;
    this.esforco = esforco;
    this.aoDescartar = aoDescartar;
  }

  async escolher(entrada: EntradaClassificacao, candidatos: Candidato[]): Promise<EscolhaLlm | null> {
    if (candidatos.length === 0) return null;

    const resposta = await this.cliente.beta.messages.create({
      model: this.modelo,
      max_tokens: 16000,
      // Recusa de classificador de segurança → a API reexecuta em um modelo de fallback na mesma chamada.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: this.esforco },
      // Cache no prefixo fixo (tools + system); produto e candidatos ficam depois do breakpoint.
      system: [{ type: "text", text: SYSTEM_RERANK, cache_control: { type: "ephemeral" } }],
      tools: [TOOL_ESCOLHER_NCM],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: montarMensagemRerank(entrada, candidatos) }],
    });

    if (resposta.stop_reason === "refusal") {
      this.aoDescartar("recusa", resposta.stop_details?.category ?? "sem categoria");
      return null;
    }

    const bloco = resposta.content.find((b) => b.type === "tool_use" && b.name === NOME_TOOL);
    if (!bloco || bloco.type !== "tool_use") {
      this.aoDescartar("sem_tool_use", `stop_reason=${resposta.stop_reason}`);
      return null;
    }

    const parse = EscolhaLlmSchema.safeParse(bloco.input);
    if (!parse.success) {
      this.aoDescartar("schema_invalido", parse.error.issues.map((i) => i.path.join(".")).join(","));
      return null;
    }

    return validarEscolha(parse.data, candidatos, this.aoDescartar);
  }
}
