import { readFile } from "node:fs/promises";
import type { Ncm } from "../../domain/ncm.js";
import { desserializarEmbeddings } from "../../eval/embedding-file.js";
import { MemoryVectorStore } from "./memory.js";

/**
 * Monta um VectorStore em memória a partir dos arquivos versionados
 * (data/ncm/ncm-*.json + data/embeddings/*.ncm.int8.bin): API e CLI rodam sem Postgres.
 */
export async function carregarStoreDeArquivos(arquivoNcm: string, arquivoEmbeddings: string) {
  const { ncms } = JSON.parse(await readFile(arquivoNcm, "utf8")) as { ncms: Ncm[] };
  const emb = desserializarEmbeddings(new Uint8Array(await readFile(arquivoEmbeddings)));
  const porCodigo = new Map(ncms.map((n) => [n.codigo, n]));
  const itens = emb.codigos.flatMap((c, i) => {
    const ncm = porCodigo.get(c);
    return ncm ? [{ ncm, embedding: emb.vetores[i]! }] : [];
  });
  const store = new MemoryVectorStore();
  await store.upsert(emb.modelo, itens);
  return { store, modelo: emb.modelo, total: itens.length };
}
