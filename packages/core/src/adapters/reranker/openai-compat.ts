import { z } from "zod";
import { EscolhaLlmSchema, type Candidato, type EntradaClassificacao, type EscolhaLlm } from "../../domain/classificacao.js";
import type { Reranker } from "../../ports/reranker.js";
import { montarMensagemRerank, SYSTEM_RERANK } from "../../pipeline/prompts/rerank.js";
import { validarEscolha, type MotivoFallback } from "./validar-escolha.js";

/**
 * Provedores que expõem /chat/completions no formato OpenAI: Gemini, Groq, OpenRouter, Ollama…
 * Usa JSON mode (e não tool calling), que é o recurso com suporte mais uniforme entre eles.
 */
export const PRESETS_LLM = {
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", modelo: "gemini-3.8-flash" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", modelo: "llama-3.3-70b-versatile" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", modelo: "meta-llama/llama-3.3-70b-instruct:free" },
  ollama: { baseUrl: "http://127.0.0.1:11434/v1", modelo: "qwen2.5:7b" },
} as const;

/** O system prompt do Claude pede a tool; aqui a mesma escolha vai como JSON. */
export const INSTRUCAO_JSON = `${SYSTEM_RERANK.replace(/\n*Responda sempre chamando a ferramenta.*$/s, "")}

Responda SOMENTE com um objeto JSON, sem texto antes ou depois, no formato:
{"ncm": "<8 dígitos>", "confianca": <0 a 1>, "justificativa": "<texto>", "alternativas": ["<8 dígitos>", ...]}`;

const RespostaChatSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }), finish_reason: z.string().nullable().optional() })).min(1),
});

export interface OpcoesOpenAiCompat {
  baseUrl: string;
  apiKey: string;
  modelo: string;
  fetch?: typeof fetch;
  /** Tentativas extras em 429/5xx (limites de plano gratuito), com espera exponencial. */
  tentativas?: number;
  esperar?: (ms: number) => Promise<void>;
  aoDescartar?: (motivo: MotivoFallback, detalhe: string) => void;
}

export class OpenAiCompatReranker implements Reranker {
  readonly modelo: string;
  private readonly url: string;
  private readonly apiKey: string;
  private readonly fetch: typeof fetch;
  private readonly tentativas: number;
  private readonly esperar: (ms: number) => Promise<void>;
  private readonly aoDescartar: (motivo: MotivoFallback, detalhe: string) => void;

  constructor(o: OpcoesOpenAiCompat) {
    this.url = `${o.baseUrl.replace(/\/$/, "")}/chat/completions`;
    this.apiKey = o.apiKey;
    this.modelo = o.modelo;
    // Resolvido na chamada (não no construtor) para respeitar mocks/polyfills aplicados depois.
    this.fetch = o.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.tentativas = o.tentativas ?? 4;
    this.esperar = o.esperar ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.aoDescartar = o.aoDescartar ?? (() => {});
  }

  async escolher(entrada: EntradaClassificacao, candidatos: Candidato[]): Promise<EscolhaLlm | null> {
    if (candidatos.length === 0) return null;
    const corpo = JSON.stringify({
      model: this.modelo,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: INSTRUCAO_JSON },
        { role: "user", content: montarMensagemRerank(entrada, candidatos) },
      ],
    });

    let resposta: Response | undefined;
    for (let tentativa = 0; ; tentativa++) {
      resposta = await this.fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
        body: corpo,
      });
      const retentavel = resposta.status === 429 || resposta.status >= 500;
      if (!retentavel || tentativa >= this.tentativas) break;
      const retryAfter = Number(resposta.headers.get("retry-after"));
      await this.esperar(retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** tentativa);
    }
    if (!resposta.ok) {
      throw new Error(`LLM (${this.modelo}) respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`);
    }

    const { choices } = RespostaChatSchema.parse(await resposta.json());
    const texto = choices[0]!.message.content ?? "";
    let json: unknown;
    try {
      // Alguns modelos embrulham em ```json ... ``` mesmo em JSON mode.
      json = JSON.parse(texto.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
    } catch {
      this.aoDescartar("sem_tool_use", `JSON inválido (finish_reason=${choices[0]!.finish_reason ?? "?"})`);
      return null;
    }
    const parse = EscolhaLlmSchema.safeParse(json);
    if (!parse.success) {
      this.aoDescartar("schema_invalido", parse.error.issues.map((i) => i.path.join(".")).join(","));
      return null;
    }
    return validarEscolha(parse.data, candidatos, this.aoDescartar);
  }
}
