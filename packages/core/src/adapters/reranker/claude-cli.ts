import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { EscolhaLlmSchema, type Candidato, type EntradaClassificacao, type EscolhaLlm } from "../../domain/classificacao.js";
import type { Reranker } from "../../ports/reranker.js";
import { montarMensagemRerank, TOOL_ESCOLHER_NCM } from "../../pipeline/prompts/rerank.js";
import { INSTRUCAO_JSON } from "./openai-compat.js";
import { validarEscolha, type MotivoFallback } from "./validar-escolha.js";

/** Executa o binário com o prompt no stdin e devolve stdout/stderr/código de saída. */
export type ExecutarCli = (args: string[], stdin: string, opcoes: { cwd: string; timeoutMs: number }) => Promise<{ codigo: number | null; stdout: string; stderr: string }>;

/* v8 ignore start -- processo real; os testes injetam um executor falso */
const executarClaude: ExecutarCli = (args, stdin, { cwd, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const p = spawn("claude", args, { cwd, timeout: timeoutMs, windowsHide: true });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", reject);
    p.on("close", (codigo) => resolve({ codigo, stdout, stderr }));
    p.stdin.end(stdin);
  });
/* v8 ignore stop */

const SaidaCliSchema = z.object({
  is_error: z.boolean().optional(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
  modelUsage: z.record(z.string(), z.unknown()).optional(),
});

export interface OpcoesClaudeCli {
  /** Alias ou id aceito por `claude --model` (ex.: "haiku", "sonnet", "opus"). */
  modelo?: string;
  executar?: ExecutarCli;
  timeoutMs?: number;
  aoDescartar?: (motivo: MotivoFallback, detalhe: string) => void;
}

/**
 * Reranker via Claude Code em modo não interativo (`claude -p`), usando o plano do usuário em vez da API.
 * Indicado para avaliação e testes locais; em produção, o ClaudeReranker (API) é o caminho.
 *
 * Isolamento: roda numa pasta temporária vazia, sem ferramentas, MCP, settings ou sessão persistida,
 * com o nosso system prompt no lugar do padrão do Claude Code. `--json-schema` valida a saída.
 */
export class ClaudeCliReranker implements Reranker {
  readonly modelo: string;
  /** Modelo efetivamente usado, lido da primeira resposta (ex.: "claude-haiku-4-5"). */
  modeloEfetivo: string | undefined;
  private readonly aliasModelo: string;
  private readonly executar: ExecutarCli;
  private readonly timeoutMs: number;
  private readonly aoDescartar: (motivo: MotivoFallback, detalhe: string) => void;
  private cwd?: string;

  constructor({ modelo = "haiku", executar = executarClaude, timeoutMs = 120_000, aoDescartar = () => {} }: OpcoesClaudeCli = {}) {
    this.aliasModelo = modelo;
    this.modelo = `claude-cli/${modelo}`;
    this.executar = executar;
    this.timeoutMs = timeoutMs;
    this.aoDescartar = aoDescartar;
  }

  async escolher(entrada: EntradaClassificacao, candidatos: Candidato[]): Promise<EscolhaLlm | null> {
    if (candidatos.length === 0) return null;
    this.cwd ??= mkdtempSync(join(tmpdir(), "ncm-claude-cli-"));
    const args = [
      "-p",
      "--model", this.aliasModelo,
      "--output-format", "json",
      "--json-schema", JSON.stringify(TOOL_ESCOLHER_NCM.input_schema),
      "--system-prompt", INSTRUCAO_JSON,
      "--tools", "",
      "--strict-mcp-config",
      "--setting-sources", "",
      "--no-session-persistence",
    ];
    const { codigo, stdout, stderr } = await this.executar(args, montarMensagemRerank(entrada, candidatos), { cwd: this.cwd, timeoutMs: this.timeoutMs });

    let saida: z.infer<typeof SaidaCliSchema>;
    try {
      saida = SaidaCliSchema.parse(JSON.parse(stdout));
    } catch {
      throw new Error(`claude CLI saiu com código ${codigo}: ${(stderr || stdout).slice(0, 300)}`);
    }
    // Limite de uso do plano, autenticação etc.: erro (conta para a parada automática da avaliação).
    if (saida.is_error || codigo !== 0) throw new Error(`claude CLI (${this.aliasModelo}) retornou erro: ${(saida.result ?? stderr).slice(0, 300)}`);
    this.modeloEfetivo ??= Object.keys(saida.modelUsage ?? {})[0];

    const parse = EscolhaLlmSchema.safeParse(saida.structured_output);
    if (!parse.success) {
      this.aoDescartar(saida.structured_output === undefined ? "sem_tool_use" : "schema_invalido", "structured_output ausente ou inválido");
      return null;
    }
    return validarEscolha(parse.data, candidatos, this.aoDescartar);
  }
}
