/**
 * pnpm eval [--regressao] [--sem-llm]
 *
 * Compara BM25, busca vetorial e vetorial + LLM no dataset rotulado e grava report/eval.md + report/eval-chart.svg.
 *
 * Embeddings (NCMs e consultas) ficam em cache int8 em data/embeddings/, versionados: a regressão do CI
 * roda sem baixar o modelo. Se o cache não existir, são gerados com o EmbeddingProvider configurado
 * (padrão sem VOYAGE_API_KEY: multilingual-e5-small local).
 *
 * --regressao: só o subconjunto fixo de 50 produtos, sem LLM; falha se top-5 cair abaixo de data/eval/limiares.json.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  avaliar,
  Bm25Baseline,
  ClaudeReranker,
  criarEmbeddingProvider,
  criarReranker,
  desserializarEmbeddings,
  fundirRrf,
  gerarGraficoSvg,
  gerarRelatorio,
  MemoryVectorStore,
  normalizarDescricao,
  parseDataset,
  reordenar,
  serializarEmbeddings,
  subconjuntoRegressao,
  type EmbeddingProvider,
  type Ncm,
  type ResultadoSistema,
} from "../packages/core/src/index.js";

const RAIZ = join(import.meta.dirname, "..");
const K = 10;
const ARQUIVO_DATASET = "data/eval/produtos-rotulados.csv";
const ARQUIVO_LIMIARES = "data/eval/limiares.json";

const { values: flags } = parseArgs({
  options: { regressao: { type: "boolean", default: false }, "sem-llm": { type: "boolean", default: false } },
});

// ---------- dados ----------
const arquivosNcm = (await readdir(join(RAIZ, "data/ncm"))).filter((f) => /^ncm-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const arquivoNcm = arquivosNcm.at(-1);
if (!arquivoNcm) throw new Error("Nenhum data/ncm/ncm-*.json. Rode `pnpm ingest` antes.");
const tabela = JSON.parse(await readFile(join(RAIZ, "data/ncm", arquivoNcm), "utf8")) as {
  ato: string; atualizacao: string; referencia: string; ncms: Ncm[];
};
const porCodigo = new Map(tabela.ncms.map((n) => [n.codigo, n]));

const csv = await readFile(join(RAIZ, ARQUIVO_DATASET), "utf8");
const todos = parseDataset(csv);
const produtos = flags.regressao ? subconjuntoRegressao(todos) : todos;
const faltando = produtos.filter((p) => !porCodigo.has(p.ncm));
if (faltando.length) throw new Error(`NCMs do dataset fora da tabela vigente: ${faltando.map((p) => `${p.id}:${p.ncm}`).join(", ")}`);
console.log(`${produtos.length} produtos, ${tabela.ncms.length} NCMs (${arquivoNcm})`);

// ---------- embeddings em cache ----------
const provider = criarEmbeddingProvider();
const slug = provider.modelo.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const dirEmb = join(RAIZ, "data/embeddings");
await mkdir(dirEmb, { recursive: true });

async function carregarOuGerar(arquivo: string, itens: { chave: string; texto: string }[], tipo: "query" | "document", provedor: EmbeddingProvider) {
  const caminho = join(dirEmb, arquivo);
  const cache = new Map<string, number[]>();
  if (existsSync(caminho)) {
    const lido = desserializarEmbeddings(new Uint8Array(await readFile(caminho)));
    lido.codigos.forEach((c, i) => cache.set(c, lido.vetores[i]!));
  }
  const pendentes = itens.filter((i) => !cache.has(i.chave));
  if (pendentes.length) {
    console.log(`Gerando ${pendentes.length} embeddings (${tipo}) com ${provedor.modelo}...`);
    for (let i = 0; i < pendentes.length; i += 64) {
      const lote = pendentes.slice(i, i + 64);
      const vetores = await provedor.embed(lote.map((l) => l.texto), tipo);
      lote.forEach((l, j) => cache.set(l.chave, vetores[j]!));
      process.stdout.write(`\r  ${Math.min(i + 64, pendentes.length)}/${pendentes.length}`);
    }
    process.stdout.write("\n");
    const codigos = [...cache.keys()].sort();
    await writeFile(caminho, serializarEmbeddings({ modelo: provedor.modelo, dimensao: provedor.dimensao, codigos, vetores: codigos.map((c) => cache.get(c)!) }));
  }
  return cache;
}

const chaveConsulta = (descricao: string) => createHash("sha256").update(normalizarDescricao({ descricao })).digest("hex").slice(0, 16);

const embNcm = await carregarOuGerar(`${slug}.ncm.int8.bin`, tabela.ncms.map((n) => ({ chave: n.codigo, texto: n.descricaoCompleta })), "document", provider);
const embConsulta = await carregarOuGerar(
  `${slug}.consultas.int8.bin`,
  todos.map((p) => ({ chave: chaveConsulta(p.descricao), texto: normalizarDescricao({ descricao: p.descricao }) })),
  "query",
  provider,
);

const store = new MemoryVectorStore();
await store.upsert(provider.modelo, tabela.ncms.map((ncm) => ({ ncm, embedding: embNcm.get(ncm.codigo)! })));
const buscarVetorial = (descricao: string) => store.buscar(provider.modelo, embConsulta.get(chaveConsulta(descricao))!, K);

// ---------- sistemas ----------
const bm25 = new Bm25Baseline(tabela.ncms);
const resultados: ResultadoSistema[] = [];
const naoExecutados: { nome: string; motivo: string }[] = [];

resultados.push(await avaliar("BM25", async (d) => bm25.buscar(normalizarDescricao({ descricao: d }), K), produtos));
resultados.push(await avaliar("Vetorial", async (d) => (await buscarVetorial(d)).map((c) => c.ncm.codigo), produtos));
// Híbrido: RRF sobre os top-50 de cada método (profundidade maior que k para a fusão ter material).
resultados.push(
  await avaliar(
    "Híbrido (RRF)",
    async (d) => {
      const vetorial = (await store.buscar(provider.modelo, embConsulta.get(chaveConsulta(d))!, 50)).map((c) => c.ncm.codigo);
      return fundirRrf([bm25.buscar(normalizarDescricao({ descricao: d }), 50), vetorial], K);
    },
    produtos,
  ),
);

const reranker = criarReranker();
let exemploJustificativa: { produto: string; ncm: string; justificativa: string } | undefined;
if (flags.regressao || flags["sem-llm"]) {
  naoExecutados.push({ nome: "Vetorial + LLM", motivo: flags.regressao ? "modo regressão (sem custo de API)." : "execução com --sem-llm." });
} else if (!(reranker instanceof ClaudeReranker)) {
  naoExecutados.push({ nome: "Vetorial + LLM", motivo: "sem credencial da Anthropic no ambiente (defina ANTHROPIC_API_KEY e rode `pnpm eval`)." });
} else {
  console.log(`Rerank com ${reranker.modelo}...`);
  resultados.push(
    await avaliar(
      "Vetorial + LLM",
      async (descricao) => {
        const candidatos = await buscarVetorial(descricao);
        const escolha = await reranker.escolher({ descricao }, candidatos);
        if (escolha && escolha.ncm === todos.find((p) => p.descricao === descricao)?.ncm && !exemploJustificativa) {
          exemploJustificativa = { produto: descricao, ncm: escolha.ncm, justificativa: escolha.justificativa };
        }
        return reordenar(candidatos, escolha).map((c) => c.ncm.codigo);
      },
      produtos,
      { concorrencia: 4, aoProgredir: (f, t) => process.stdout.write(`\r  ${f}/${t}`) },
    ),
  );
  process.stdout.write("\n");
}

for (const r of resultados) {
  const m = r.metricas;
  console.log(`${r.nome.padEnd(16)} top1 ${(m.top1 * 100).toFixed(1)}%  top5 ${(m.top5 * 100).toFixed(1)}%  mrr ${m.mrr.toFixed(3)}`);
}

// ---------- regressão ----------
if (flags.regressao) {
  const limiares = JSON.parse(await readFile(join(RAIZ, ARQUIVO_LIMIARES), "utf8")) as Record<string, { top5: number } | undefined>;
  const falhas = resultados.filter((r) => limiares[r.nome] && r.metricas.top5 < limiares[r.nome]!.top5);
  for (const f of falhas) console.error(`REGRESSÃO: ${f.nome} top-5 ${(f.metricas.top5 * 100).toFixed(1)}% < limiar ${(limiares[f.nome]!.top5 * 100).toFixed(1)}%`);
  process.exit(falhas.length ? 1 : 0);
}

// ---------- relatório ----------
const md = gerarRelatorio({
  data: new Date().toISOString().slice(0, 10),
  tabelaNcm: { ato: tabela.ato, atualizacao: tabela.atualizacao, referencia: tabela.referencia, total: tabela.ncms.length },
  dataset: {
    arquivo: ARQUIVO_DATASET,
    total: produtos.length,
    capitulos: new Set(produtos.map((p) => p.ncm.slice(0, 2))).size,
    sha256: createHash("sha256").update(csv).digest("hex"),
  },
  modeloEmbedding: provider.modelo,
  modeloLlm: reranker instanceof ClaudeReranker && !flags["sem-llm"] ? reranker.modelo : null,
  k: K,
  resultados,
  naoExecutados,
  ...(exemploJustificativa ? { exemploJustificativa } : {}),
  notas: [
    "Latência medida no processo de avaliação: BM25 e busca vetorial em memória, com o embedding da consulta pré-calculado. A latência do LLM inclui a chamada à API.",
    "Embeddings quantizados em int8 (`data/embeddings/`) para versionamento. O erro de quantização é menor que 1% por componente.",
  ],
  descricaoPorCodigo: (c) => porCodigo.get(c)?.descricao ?? c,
});
await mkdir(join(RAIZ, "report"), { recursive: true });
await writeFile(join(RAIZ, "report/eval.md"), md);
await writeFile(join(RAIZ, "report/eval-chart.svg"), gerarGraficoSvg(resultados));
console.log("Relatório: report/eval.md");
