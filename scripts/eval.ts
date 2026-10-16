/**
 * pnpm eval [--regressao] [--sem-llm] [--hibrido-llm]
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
  avaliarComLlm,
  CacheRespostasLlm,
  gerarCsvEvidencias,
  gerarMetadados,
  type RespostaLlm,
  type ResultadoAvaliacaoLlm,
  carregarEnv,
  Bm25Baseline,
  criarEmbeddingProvider,
  criarReranker,
  descreverReranker,
  NoopReranker,
  ClaudeCliReranker,
  desserializarEmbeddings,
  fundirCandidatos,
  PROFUNDIDADE_FUSAO,
  gerarGraficoSvg,
  gerarRelatorio,
  MemoryVectorStore,
  normalizarDescricao,
  parseDataset,
  serializarEmbeddings,
  subconjuntoRegressao,
  type Candidato,
  type EmbeddingProvider,
  type Ncm,
  type ResultadoSistema,
} from "../packages/core/src/index.js";

const RAIZ = join(import.meta.dirname, "..");
carregarEnv(join(RAIZ, ".env"));
const K = 10;
const ARQUIVO_DATASET = "data/eval/produtos-rotulados.csv";
const ARQUIVO_LIMIARES = "data/eval/limiares.json";

const { values: flags } = parseArgs({
  options: {
    regressao: { type: "boolean", default: false },
    "sem-llm": { type: "boolean", default: false },
    "hibrido-llm": { type: "boolean", default: false },
  },
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
  // Ordenados por tamanho: cada lote é processado no comprimento do texto mais longo (padding), e o custo
  // da atenção cresce com o quadrado dele. Agrupar textos de tamanho parecido corta o tempo dos modelos grandes.
  const pendentes = itens.filter((i) => !cache.has(i.chave)).sort((a, b) => a.texto.length - b.texto.length);
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
const buscarVetorial = (descricao: string, k = K) => store.buscar(provider.modelo, embConsulta.get(chaveConsulta(descricao))!, k);

// ---------- sistemas ----------
const bm25 = new Bm25Baseline(tabela.ncms);
const lexica = bm25.comoBuscaLexica();
const resultados: ResultadoSistema[] = [];
const naoExecutados: { nome: string; motivo: string }[] = [];

resultados.push(await avaliar("BM25", async (d) => bm25.buscar(normalizarDescricao({ descricao: d }), K), produtos));
resultados.push(await avaliar("Vetorial", async (d) => (await buscarVetorial(d)).map((c) => c.ncm.codigo), produtos));
// Híbrido: mesma função e parâmetros do pipeline de produção (fundirCandidatos, PROFUNDIDADE_FUSAO, C_RRF).
async function buscarHibrido(d: string, k = K): Promise<Candidato[]> {
  const texto = normalizarDescricao({ descricao: d });
  return fundirCandidatos(await buscarVetorial(d, PROFUNDIDADE_FUSAO), lexica.buscar(texto, PROFUNDIDADE_FUSAO), k);
}
resultados.push(await avaliar("Híbrido (RRF)", async (d) => (await buscarHibrido(d)).map((c) => c.ncm.codigo), produtos));

// Candidatos enviados ao LLM: mais que o k exibido sobe o teto do rerank (o LLM só escolhe entre o que recebe).
const K_LLM = Number(process.env.K_LLM ?? K);

const reranker = criarReranker();
const modeloLlm = descreverReranker(reranker);
const notasLlm: string[] = [];
const respostasLlm: Record<string, RespostaLlm[]> = {};
const contagensLlm: Record<string, ResultadoAvaliacaoLlm["contagem"]> = {};
let exemploJustificativa: { produto: string; ncm: string; justificativa: string } | undefined;

// Cache em disco (união a cada gravação, seguro com execuções simultâneas): retoma após limite de cota
// e permite regerar o relatório sem chamar o modelo. Ver CacheRespostasLlm.
const cacheLlm = await CacheRespostasLlm.abrir(join(RAIZ, "data/eval/cache-llm", `${modeloLlm.replace(/[^a-z0-9.-]+/gi, "_")}.json`));

/** Devolve false quando a cota acabou: o sistema não entra no relatório (números parciais distorceriam a média). */
async function rodarComLlm(nome: string, candidatosDe: (d: string) => Promise<Candidato[]>): Promise<boolean> {
  console.log(`${nome} (${modeloLlm})...`);
  const r = await avaliarComLlm({
    nome,
    modelo: modeloLlm,
    reranker,
    produtos,
    candidatosDe,
    cache: cacheLlm,
    concorrencia: Number(process.env.LLM_CONCORRENCIA ?? 4),
    intervaloMs: process.env.LLM_RPM ? 60_000 / Number(process.env.LLM_RPM) : 0,
    aoProgredir: (f, t) => process.stdout.write(`\r  ${f}/${t}`),
    aoErro: (m) => console.error(`\n  erro de API: ${m.slice(0, 160)}`),
  });
  process.stdout.write("\n");
  respostasLlm[nome] = r.respostas;
  contagensLlm[nome] = r.contagem;
  const { doCache, novas, erros, semEscolha } = r.contagem;
  if (!r.resultado) {
    const feitos = doCache + novas;
    console.error(`  erros seguidos: provável fim da cota. ${nome}: ${feitos}/${produtos.length} respondidos (${novas} nesta execução). Rode de novo quando a cota renovar.`);
    naoExecutados.push({ nome, motivo: `interrompido por limite de cota do provedor (${feitos}/${produtos.length} produtos respondidos, salvos em data/eval/cache-llm/); rode \`pnpm eval\` novamente para continuar.` });
    return false;
  }
  exemploJustificativa ??= r.respostas
    .filter((x) => x.escolha?.ncm === x.esperado && x.escolha.confianca >= 0.7)
    .map((x) => ({ produto: x.descricao, ncm: x.esperado, justificativa: x.escolha!.justificativa }))[0];
  notasLlm.push(`${nome}: ${semEscolha} de ${produtos.length} produtos sem escolha válida do LLM (${erros} por erro de API); nesses, vale a ordem dos candidatos. ${doCache} respostas vieram do cache em disco (data/eval/cache-llm/) e ${novas} foram chamadas novas.`);
  resultados.push(r.resultado);
  return true;
}

if (flags.regressao || flags["sem-llm"]) {
  naoExecutados.push({ nome: "Vetorial + LLM", motivo: flags.regressao ? "modo regressão (sem custo de API)." : "execução com --sem-llm." });
} else if (reranker instanceof NoopReranker) {
  naoExecutados.push({ nome: "Vetorial + LLM", motivo: "nenhum LLM configurado (defina ANTHROPIC_API_KEY, GEMINI_API_KEY ou RERANKER=claude-cli e rode `pnpm eval`)." });
} else {
  const completo = await rodarComLlm("Vetorial + LLM", (d) => buscarVetorial(d, K_LLM));
  // Sem cota para o primeiro sistema, não adianta começar o segundo.
  if (flags["hibrido-llm"] && completo) {
    await rodarComLlm("Híbrido + LLM", (d) => buscarHibrido(d, K_LLM));
  }
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
  modeloLlm: !(reranker instanceof NoopReranker) && !flags["sem-llm"] ? modeloLlm : null,
  k: K,
  resultados,
  naoExecutados,
  ...(exemploJustificativa ? { exemploJustificativa } : {}),
  notas: [
    `Candidatos enviados ao LLM por produto: k = ${K_LLM}. Nos sistemas com LLM, o top-10 conta os 10 primeiros do ranking final (escolha do LLM + candidatos restantes na ordem da busca).`,
    ...notasLlm,
    "Latência medida no processo de avaliação: BM25 e busca vetorial em memória, com o embedding da consulta pré-calculado. Nos sistemas com LLM, respostas vindas do cache em disco não incluem o tempo da chamada ao modelo.",
    "Embeddings quantizados em int8 (`data/embeddings/`) para versionamento. O erro de quantização é menor que 1% por componente.",
  ],
  descricaoPorCodigo: (c) => porCodigo.get(c)?.descricao ?? c,
});
await mkdir(join(RAIZ, "report"), { recursive: true });
await writeFile(join(RAIZ, "report/eval.md"), md);
await writeFile(join(RAIZ, "report/eval-chart.svg"), gerarGraficoSvg(resultados));
console.log("Relatório: report/eval.md");

// ---------- evidências ----------
// Uma pasta por execução (data + modelo): previsões produto a produto e metadados, para auditar o relatório.
const dataExecucao = new Date().toISOString().slice(0, 10);
const shaDataset = createHash("sha256").update(csv).digest("hex").slice(0, 8);
const dirEvidencias = join(RAIZ, "report/evidencias", `${dataExecucao}_${modeloLlm.replace(/[^a-z0-9.-]+/gi, "_")}_dataset-${shaDataset}`);
await mkdir(dirEvidencias, { recursive: true });
await writeFile(join(dirEvidencias, "predicoes.csv"), "﻿" + gerarCsvEvidencias(resultados, respostasLlm));
await writeFile(
  join(dirEvidencias, "execucao.json"),
  gerarMetadados({
    data: new Date().toISOString(),
    comando: `pnpm eval ${process.argv.slice(2).join(" ")}`.trim(),
    modeloEmbedding: provider.modelo,
    modeloLlm: reranker instanceof NoopReranker ? null : modeloLlm,
    ...(reranker instanceof ClaudeCliReranker && reranker.modeloEfetivo ? { modeloLlmEfetivo: reranker.modeloEfetivo } : {}),
    kExibido: K,
    kLlm: K_LLM,
    datasetSha256: createHash("sha256").update(csv).digest("hex"),
    tabelaNcm: `${tabela.ato} (${tabela.atualizacao})`,
    contagens: contagensLlm,
    metricas: Object.fromEntries(resultados.map((r) => [r.nome, { top1: r.metricas.top1, top5: r.metricas.top5, top10: r.metricas.top10, mrr: r.metricas.mrr }])),
  }),
);
console.log(`Evidências: ${dirEvidencias.slice(RAIZ.length + 1)}/ (predicoes.csv, execucao.json)`);
