import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  carregarEnv,
  criarReranker,
  descreverReranker,
  INSTRUCAO_JSON,
  NoopReranker,
  OpenAiCompatReranker,
  type Candidato,
} from "../src/index.js";

const candidato = (codigo: string): Candidato => ({
  ncm: { codigo, descricao: codigo, descricaoCompleta: `Calçado > ${codigo}`, capitulo: codigo.slice(0, 2), posicao: codigo.slice(0, 4), subposicao: codigo.slice(0, 6) },
  score: 0.8,
});
const CANDIDATOS = [candidato("64041100"), candidato("64041900")];
const chat = (content: string | null, status = 200, headers: Record<string, string> = {}) =>
  new Response(status === 200 ? JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }) : "erro", { status, headers });

function montar(respostas: Response[]) {
  const f = vi.fn(async (_url: string, _init?: RequestInit) => respostas.shift()!);
  const esperas: number[] = [];
  const descartes: string[] = [];
  const r = new OpenAiCompatReranker({
    baseUrl: "https://x.test/v1/", apiKey: "k", modelo: "m-free", fetch: f as unknown as typeof fetch,
    esperar: async (ms) => void esperas.push(ms), aoDescartar: (m) => descartes.push(m),
  });
  return { r, f, esperas, descartes };
}

describe("OpenAiCompatReranker", () => {
  it("envia JSON mode com prompt fixo + candidatos e valida a escolha", async () => {
    const { r, f } = montar([chat('{"ncm":"64041100","confianca":0.9,"justificativa":"RGI 1","alternativas":["64041900","99999999"]}')]);
    expect(await r.escolher({ descricao: "tênis" }, CANDIDATOS)).toEqual({ ncm: "64041100", confianca: 0.9, justificativa: "RGI 1", alternativas: ["64041900"] });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://x.test/v1/chat/completions");
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer k");
    const corpo = JSON.parse(init!.body as string);
    expect(corpo).toMatchObject({ model: "m-free", temperature: 0, response_format: { type: "json_object" } });
    expect(corpo.messages[0].content).toBe(INSTRUCAO_JSON);
    expect(INSTRUCAO_JSON).not.toContain("ferramenta escolher_ncm");
    expect(corpo.messages[1].content).toContain("tênis");
  });

  it("aceita JSON dentro de bloco ```json", async () => {
    const { r } = montar([chat('```json\n{"ncm":"64041900","confianca":0.5,"justificativa":"x","alternativas":[]}\n```')]);
    expect((await r.escolher({ descricao: "x" }, CANDIDATOS))?.ncm).toBe("64041900");
  });

  it("descarta JSON inválido, schema inválido e conteúdo nulo", async () => {
    const { r, descartes } = montar([chat("acho que é 6404"), chat('{"ncm":"6404"}'), chat(null)]);
    expect(await r.escolher({ descricao: "x" }, CANDIDATOS)).toBeNull();
    expect(await r.escolher({ descricao: "x" }, CANDIDATOS)).toBeNull();
    expect(await r.escolher({ descricao: "x" }, CANDIDATOS)).toBeNull();
    expect(descartes).toEqual(["sem_tool_use", "schema_invalido", "sem_tool_use"]);
  });

  it("código fora dos candidatos cai no fallback compartilhado", async () => {
    const { r, descartes } = montar([chat('{"ncm":"12345678","confianca":0.9,"justificativa":"x","alternativas":["64041900"]}')]);
    expect(await r.escolher({ descricao: "x" }, CANDIDATOS)).toMatchObject({ ncm: "64041900", confianca: 0.3 });
    expect(descartes).toEqual(["fora_dos_candidatos"]);
  });

  it("retenta 429/5xx com backoff (respeitando retry-after) e depois desiste", async () => {
    const ok = '{"ncm":"64041100","confianca":1,"justificativa":"x","alternativas":[]}';
    const a = montar([chat(null, 429, { "retry-after": "7" }), chat(null, 503), chat(ok)]);
    expect((await a.r.escolher({ descricao: "x" }, CANDIDATOS))?.ncm).toBe("64041100");
    expect(a.esperas).toEqual([7000, 4000]);

    const b = montar(Array.from({ length: 5 }, () => chat(null, 429)));
    await expect(b.r.escolher({ descricao: "x" }, CANDIDATOS)).rejects.toThrow(/m-free\) respondeu 429/);
    expect(b.f).toHaveBeenCalledTimes(5);

    const c = montar([chat(null, 400)]);
    await expect(c.r.escolher({ descricao: "x" }, CANDIDATOS)).rejects.toThrow(/400/);
    expect(c.f).toHaveBeenCalledTimes(1);
  });

  it("sem candidatos não chama; sem chave não manda Authorization; espera padrão real", async () => {
    const { r, f } = montar([]);
    expect(await r.escolher({ descricao: "x" }, [])).toBeNull();
    expect(f).not.toHaveBeenCalled();

    vi.useFakeTimers();
    const g = vi.fn(async (_u: string, _i?: RequestInit) => (g.mock.calls.length === 1 ? chat(null, 500) : chat('{"ncm":"64041100","confianca":1,"justificativa":"x","alternativas":[]}')));
    const local = new OpenAiCompatReranker({ baseUrl: "http://127.0.0.1:11434/v1", apiKey: "", modelo: "qwen", fetch: g as unknown as typeof fetch });
    const p = local.escolher({ descricao: "x" }, CANDIDATOS);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await p)?.ncm).toBe("64041100");
    expect(g.mock.calls[0]![1]!.headers).not.toHaveProperty("authorization");
    vi.useRealTimers();
  });
});

describe("criarReranker com provedores OpenAI-compatíveis", () => {
  afterEach(() => vi.restoreAllMocks());

  it("Gemini automático quando só há GEMINI_API_KEY; Claude tem prioridade", () => {
    const g = criarReranker({ GEMINI_API_KEY: "g" });
    expect(g).toBeInstanceOf(OpenAiCompatReranker);
    expect(descreverReranker(g)).toBe("gemini-3.8-flash");
    expect(descreverReranker(criarReranker({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" }))).toBe("claude-opus-5");
    expect(descreverReranker(new NoopReranker())).toBe("desativado");
  });

  it("presets, LLM_MODEL, ollama sem chave e openai-compat genérico", () => {
    expect(descreverReranker(criarReranker({ RERANKER: "groq", GROQ_API_KEY: "q", LLM_MODEL: "qwen-x" }))).toBe("qwen-x");
    expect(criarReranker({ RERANKER: "ollama" })).toBeInstanceOf(OpenAiCompatReranker);
    expect(criarReranker({ RERANKER: "openai-compat", LLM_BASE_URL: "http://h/v1", LLM_MODEL: "x" })).toBeInstanceOf(OpenAiCompatReranker);
  });

  it("erros de configuração claros", () => {
    expect(() => criarReranker({ RERANKER: "openrouter" })).toThrow(/OPENROUTER_API_KEY/);
    expect(() => criarReranker({ RERANKER: "openai-compat" })).toThrow(/LLM_BASE_URL/);
    expect(() => criarReranker({ RERANKER: "xyz" })).toThrow(/gemini/);
  });

  it("aviso padrão de descarte vai para console.warn sem o prompt", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = criarReranker({ GEMINI_API_KEY: "g" }) as OpenAiCompatReranker;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(chat("não é json"));
    expect(await r.escolher({ descricao: "produto secreto" }, CANDIDATOS)).toBeNull();
    expect(warn.mock.calls[0]![0]).toMatch(/^\[reranker\] resposta descartada: sem_tool_use/);
    expect(warn.mock.calls[0]![0]).not.toContain("produto secreto");
  });
});

describe("carregarEnv", () => {
  it("lê o arquivo sem sobrescrever o ambiente e ignora arquivo ausente", async () => {
    const dir = await mkdtemp(join(tmpdir(), "env-"));
    await writeFile(join(dir, ".env"), "NCM_TESTE_A=do-arquivo\nNCM_TESTE_B=do-arquivo\n");
    process.env.NCM_TESTE_B = "do-ambiente";
    expect(carregarEnv(join(dir, ".env"))).toBe(true);
    expect(process.env.NCM_TESTE_A).toBe("do-arquivo");
    expect(process.env.NCM_TESTE_B).toBe("do-ambiente");
    expect(carregarEnv(join(dir, "nao-existe"))).toBe(false);
    delete process.env.NCM_TESTE_A;
    delete process.env.NCM_TESTE_B;
  });
});
