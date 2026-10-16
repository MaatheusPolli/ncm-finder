import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { criarContainer, serializarEmbeddings } from "../src/index.js";

async function dirDados(modelo = "Xenova/multilingual-e5-small") {
  const dir = await mkdtemp(join(tmpdir(), "ncm-dados-"));
  await mkdir(join(dir, "ncm"));
  await mkdir(join(dir, "embeddings"));
  const ncm = { codigo: "04090000", descricao: "Mel natural.", descricaoCompleta: "Mel natural.", capitulo: "04", posicao: "0409", subposicao: "040900" };
  await writeFile(join(dir, "ncm", "ncm-2026-01-01.json"), JSON.stringify({ ncms: [] }));
  await writeFile(join(dir, "ncm", "ncm-2026-09-23.json"), JSON.stringify({ ncms: [ncm] }));
  await writeFile(
    join(dir, "embeddings", "xenova-multilingual-e5-small.ncm.int8.bin"),
    serializarEmbeddings({ modelo, dimensao: 2, codigos: ["04090000"], vetores: [[1, 0]] }),
  );
  return dir;
}

describe("criarContainer", () => {
  it("sem banco: carrega os arquivos mais recentes e usa reranker desativado sem credencial", async () => {
    const c = await criarContainer(await dirDados(), {});
    expect(c.info).toEqual({ modeloEmbedding: "Xenova/multilingual-e5-small", reranker: "desativado", armazenamento: "arquivo" });
    expect(c.llmDisponivel).toBe(false);
    await c.fechar();
  });

  it("com credencial Anthropic: LLM disponível", async () => {
    const c = await criarContainer(await dirDados(), { ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "claude-sonnet-5" });
    expect(c.info.reranker).toBe("claude-sonnet-5");
    expect(c.llmDisponivel).toBe(true);
  });

  it("com DATABASE_URL: pgvector (pool só conecta sob demanda)", async () => {
    const c = await criarContainer("/nao/usado", { DATABASE_URL: "postgres://x:y@127.0.0.1:1/z" });
    expect(c.info.armazenamento).toBe("pgvector");
    await c.fechar();
  });

  it("erro claro quando faltam os arquivos", async () => {
    const vazio = await mkdtemp(join(tmpdir(), "ncm-vazio-"));
    await mkdir(join(vazio, "ncm"));
    await expect(criarContainer(vazio, {})).rejects.toThrow(/pnpm ingest/);
  });
});
