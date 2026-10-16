import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { carregarStoreDeArquivos, serializarEmbeddings, type Ncm } from "../src/index.js";

const ncm = (codigo: string): Ncm => ({
  codigo, descricao: codigo, descricaoCompleta: codigo, capitulo: codigo.slice(0, 2), posicao: codigo.slice(0, 4), subposicao: codigo.slice(0, 6),
});

describe("carregarStoreDeArquivos", () => {
  it("junta NCMs e embeddings e ignora códigos que saíram da tabela", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ncm-"));
    await writeFile(join(dir, "ncm.json"), JSON.stringify({ ncms: [ncm("11111111"), ncm("22222222")] }));
    await writeFile(
      join(dir, "emb.bin"),
      serializarEmbeddings({ modelo: "m", dimensao: 2, codigos: ["11111111", "22222222", "99999999"], vetores: [[1, 0], [0, 1], [1, 1]] }),
    );
    const { store, modelo, total } = await carregarStoreDeArquivos(join(dir, "ncm.json"), join(dir, "emb.bin"));
    expect(modelo).toBe("m");
    expect(total).toBe(2);
    expect((await store.buscar("m", [0, 1], 1))[0]!.ncm.codigo).toBe("22222222");
  });
});
