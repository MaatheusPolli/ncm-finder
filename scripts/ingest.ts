/**
 * pnpm ingest [--arquivo caminho.json] [--referencia AAAA-MM-DD]
 *
 * 1. Baixa a tabela NCM do Portal Único Siscomex (ou lê um arquivo local).
 * 2. Salva o JSON bruto versionado por data em data/ncm/siscomex-AAAA-MM-DD.json.
 * 3. Gera data/ncm/ncm-AAAA-MM-DD.json com os NCMs de 8 dígitos e descrição enriquecida.
 * 4. Com DATABASE_URL, grava NCMs + embeddings no pgvector (idempotente; EMBEDDING_PROVIDER=voyage|local).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import pg from "pg";
import { construirNcms, criarEmbeddingProvider, embedNcms, parseTabelaNcm, PgVectorStore } from "../packages/core/src/index.js";

const URL_SISCOMEX = "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json";
const DIR = join(import.meta.dirname, "..", "data", "ncm");

const { values } = parseArgs({
  options: {
    arquivo: { type: "string" },
    referencia: { type: "string", default: new Date().toISOString().slice(0, 10) },
    "sem-embeddings": { type: "boolean", default: false },
  },
});
const referencia = values.referencia!;

async function obterTabela(): Promise<unknown> {
  if (values.arquivo) {
    console.log(`Lendo ${values.arquivo}`);
    return JSON.parse(await readFile(values.arquivo, "utf8"));
  }
  console.log(`Baixando ${URL_SISCOMEX}`);
  const resposta = await fetch(URL_SISCOMEX, { signal: AbortSignal.timeout(120_000) });
  if (!resposta.ok) throw new Error(`Siscomex respondeu ${resposta.status}`);
  const json: unknown = await resposta.json();
  const destino = join(DIR, `siscomex-${referencia}.json`);
  await writeFile(destino, JSON.stringify(json));
  console.log(`Tabela bruta salva em ${destino}`);
  return json;
}

await mkdir(DIR, { recursive: true });
const tabela = parseTabelaNcm(await obterTabela(), referencia);
const ncms = construirNcms(tabela);

const saida = join(DIR, `ncm-${referencia}.json`);
await writeFile(
  saida,
  JSON.stringify({ fonte: URL_SISCOMEX, atualizacao: tabela.atualizacao, ato: tabela.ato, referencia, ncms }, null, 1),
);
console.log(`${tabela.nos.length} nós vigentes → ${ncms.length} NCMs de 8 dígitos (${tabela.ato})`);
console.log(`NCMs enriquecidos salvos em ${saida}`);

if (values["sem-embeddings"] || !process.env.DATABASE_URL) {
  console.log("Embeddings pulados (defina DATABASE_URL e rode sem --sem-embeddings para gravar no pgvector).");
} else {
  const provider = criarEmbeddingProvider();
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log(`Gerando embeddings com ${provider.modelo} (${provider.dimensao} dims)`);
    const r = await embedNcms(ncms, provider, new PgVectorStore(pool), {
      tamanhoLote: 64,
      aoProgredir: (g, total) => process.stdout.write(`\r  ${g}/${total}`),
    });
    console.log(`\n${r.gerados} gerados, ${r.jaIndexados} já existiam (${r.modelo})`);
  } finally {
    await pool.end();
  }
}
