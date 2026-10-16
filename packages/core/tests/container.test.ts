import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { criarContainer, serializarEmbeddings, type Ncm } from "../src/index.js";

const ncm = (codigo: string, descricao: string): Ncm => ({
  codigo, descricao, descricaoCompleta: descricao, capitulo: codigo.slice(0, 2), posicao: codigo.slice(0, 4), subposicao: codigo.slice(0, 6),
});
// O BM25 exige ao menos 3 documentos para consolidar o índice.
const NCMS = [ncm("04090000", "Mel natural."), ncm("22030000", "Cervejas de malte."), ncm("64041100", "Calçado para esporte")];

async function dirDados(modelo = "Xenova/bge-m3") {
  const dir = await mkdtemp(join(tmpdir(), "ncm-dados-"));
  await mkdir(join(dir, "ncm"));
  await mkdir(join(dir, "embeddings"));
  await writeFile(join(dir, "ncm", "ncm-2026-01-01.json"), JSON.stringify({ ncms: [] }));
  await writeFile(join(dir, "ncm", "ncm-2026-09-23.json"), JSON.stringify({ ncms: NCMS }));
  await writeFile(
    join(dir, "embeddings", "xenova-bge-m3.ncm.int8.bin"),
    serializarEmbeddings({ modelo, dimensao: 2, codigos: NCMS.map((n) => n.codigo), vetores: [[1, 0], [0, 1], [1, 1]] }),
  );
  return dir;
}

describe("criarContainer", () => {
  it("sem banco: arquivos mais recentes, busca híbrida por padrão e reranker desativado sem credencial", async () => {
    const c = await criarContainer(await dirDados(), {});
    expect(c.info).toEqual({ modeloEmbedding: "Xenova/bge-m3", reranker: "desativado", armazenamento: "arquivo", busca: "hibrida" });
    expect(c.llmDisponivel).toBe(false);
    await c.fechar();
  });

  it("BUSCA=vetorial desliga o BM25", async () => {
    expect((await criarContainer(await dirDados(), { BUSCA: "vetorial" })).info.busca).toBe("vetorial");
  });

  it("com credencial Anthropic: LLM disponível", async () => {
    const c = await criarContainer(await dirDados(), { ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "claude-sonnet-5" });
    expect(c.info.reranker).toBe("claude-sonnet-5");
    expect(c.llmDisponivel).toBe(true);
  });

  it("com DATABASE_URL: pgvector (pool só conecta sob demanda), BM25 montado do arquivo de NCMs", async () => {
    const dir = await dirDados();
    const c = await criarContainer(dir, { DATABASE_URL: "postgres://x:y@127.0.0.1:1/z" });
    expect(c.info).toMatchObject({ armazenamento: "pgvector", busca: "hibrida" });
    await c.fechar();
    const v = await criarContainer("/nao/usado", { DATABASE_URL: "postgres://x:y@127.0.0.1:1/z", BUSCA: "vetorial" });
    expect(v.info.busca).toBe("vetorial");
    await v.fechar();
  });

  it("erro claro quando faltam os arquivos", async () => {
    const vazio = await mkdtemp(join(tmpdir(), "ncm-vazio-"));
    await mkdir(join(vazio, "ncm"));
    await expect(criarContainer(vazio, {})).rejects.toThrow(/pnpm ingest/);
  });
});
