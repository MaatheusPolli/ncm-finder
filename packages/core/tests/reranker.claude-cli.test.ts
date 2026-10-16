import { describe, expect, it, vi } from "vitest";
import { ClaudeCliReranker, criarReranker, descreverReranker, INSTRUCAO_JSON, TOOL_ESCOLHER_NCM, type Candidato, type ExecutarCli } from "../src/index.js";

const candidato = (codigo: string): Candidato => ({
  ncm: { codigo, descricao: codigo, descricaoCompleta: `Calçado > ${codigo}`, capitulo: "64", posicao: codigo.slice(0, 4), subposicao: codigo.slice(0, 6) },
  score: 0.8,
});
const CANDIDATOS = [candidato("64041100"), candidato("64041900")];
const saida = (obj: unknown, codigo: number | null = 0) => ({ codigo, stdout: JSON.stringify(obj), stderr: "" });
const ok = (structured_output: unknown) =>
  saida({ type: "result", is_error: false, result: JSON.stringify(structured_output), structured_output, modelUsage: { "claude-haiku-4-5": {} } });

function montar(...respostas: Awaited<ReturnType<ExecutarCli>>[]) {
  const executar = vi.fn<ExecutarCli>(async () => respostas.shift()!);
  const descartes: string[] = [];
  return { r: new ClaudeCliReranker({ executar, aoDescartar: (m) => descartes.push(m) }), executar, descartes };
}

describe("ClaudeCliReranker", () => {
  it("chama claude -p isolado, com schema e system prompt próprios, e valida a escolha", async () => {
    const { r, executar } = montar(ok({ ncm: "64041100", confianca: 0.8, justificativa: "RGI 1", alternativas: ["64041900", "11111111"] }));
    expect(await r.escolher({ descricao: "tênis" }, CANDIDATOS)).toEqual({ ncm: "64041100", confianca: 0.8, justificativa: "RGI 1", alternativas: ["64041900"] });
    const [args, stdin, opcoes] = executar.mock.calls[0]!;
    const valor = (flag: string) => args[args.indexOf(flag) + 1];
    expect(args[0]).toBe("-p");
    expect(valor("--model")).toBe("haiku");
    expect(valor("--output-format")).toBe("json");
    expect(JSON.parse(valor("--json-schema")!)).toEqual(TOOL_ESCOLHER_NCM.input_schema);
    expect(valor("--system-prompt")).toBe(INSTRUCAO_JSON);
    expect(valor("--tools")).toBe("");
    expect(args).toEqual(expect.arrayContaining(["--strict-mcp-config", "--no-session-persistence"]));
    expect(stdin).toContain("tênis");
    expect(opcoes.cwd).toMatch(/ncm-claude-cli-/);
    expect(opcoes.timeoutMs).toBe(120_000);
    expect(r.modelo).toBe("claude-cli/haiku");
    expect(r.modeloEfetivo).toBe("claude-haiku-4-5");
  });

  it("reaproveita a pasta temporária entre chamadas", async () => {
    const escolha = { ncm: "64041100", confianca: 1, justificativa: "x", alternativas: [] };
    const { r, executar } = montar(ok(escolha), ok(escolha));
    await r.escolher({ descricao: "a" }, CANDIDATOS);
    await r.escolher({ descricao: "b" }, CANDIDATOS);
    expect(executar.mock.calls[0]![2].cwd).toBe(executar.mock.calls[1]![2].cwd);
  });

  it("erro do CLI (limite do plano, saída não JSON, código != 0) vira exceção", async () => {
    const limite = montar(saida({ is_error: true, result: "Claude usage limit reached" }, 1));
    await expect(limite.r.escolher({ descricao: "x" }, CANDIDATOS)).rejects.toThrow(/usage limit/);

    const lixo = montar({ codigo: 1, stdout: "", stderr: "command not found" });
    await expect(lixo.r.escolher({ descricao: "x" }, CANDIDATOS)).rejects.toThrow(/código 1: command not found/);

    const semFlag = montar(saida({ result: "ok" }, 2));
    await expect(semFlag.r.escolher({ descricao: "x" }, CANDIDATOS)).rejects.toThrow(/retornou erro/);
  });

  it("descarta structured_output ausente ou inválido; fallback fora dos candidatos", async () => {
    const { r, descartes } = montar(
      saida({ is_error: false, result: "texto" }),
      ok({ ncm: "6404" }),
      ok({ ncm: "99999999", confianca: 0.9, justificativa: "x", alternativas: ["64041900"] }),
    );
    expect(await r.escolher({ descricao: "x" }, CANDIDATOS)).toBeNull();
    expect(await r.escolher({ descricao: "x" }, CANDIDATOS)).toBeNull();
    expect((await r.escolher({ descricao: "x" }, CANDIDATOS))?.ncm).toBe("64041900");
    expect(descartes).toEqual(["sem_tool_use", "schema_invalido", "fora_dos_candidatos"]);
  });

  it("sem candidatos não chama o CLI; config por RERANKER=claude-cli", async () => {
    const { r, executar } = montar();
    expect(await r.escolher({ descricao: "x" }, [])).toBeNull();
    expect(executar).not.toHaveBeenCalled();
    expect(descreverReranker(criarReranker({ RERANKER: "claude-cli" }))).toBe("claude-cli/haiku");
    expect(descreverReranker(criarReranker({ RERANKER: "claude-cli", CLAUDE_CLI_MODEL: "sonnet" }))).toBe("claude-cli/sonnet");
    expect(new ClaudeCliReranker({ modelo: "opus" }).modelo).toBe("claude-cli/opus");
  });
});
