import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { avaliar, parseDataset, type Container, type ModoClassificacao } from "@ncm-finder/core";
import { Command, InvalidArgumentError, Option } from "commander";
import { formatarMetricas, formatarResultado } from "./formatar.js";

export const RAIZ = join(import.meta.dirname, "..", "..", "..");

export interface DependenciasCli {
  criarContainer: () => Promise<Container>;
  escrever: (texto: string) => void;
  executarScript: (script: string, args: string[]) => number;
}

function inteiro(valor: string): number {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new InvalidArgumentError("k deve ser um inteiro entre 1 e 50.");
  return n;
}

const opcaoModo = () => new Option("-m, --modo <modo>", "vetorial ou vetorial+llm").choices(["vetorial", "vetorial+llm"]);

/** Com LLM quando há credencial; senão, vetorial — para a CLI funcionar sem configurar nada. */
function modoEfetivo(pedido: string | undefined, container: Container): ModoClassificacao {
  if (pedido) return pedido as ModoClassificacao;
  return container.llmDisponivel ? "vetorial+llm" : "vetorial";
}

export function criarPrograma(deps: DependenciasCli): Command {
  const programa = new Command("ncm").description("Classificador de produtos por NCM (embeddings + LLM)").showHelpAfterError();

  programa
    .command("classificar")
    .description('Sugere NCMs para um produto. Ex.: ncm classificar "tênis de corrida masculino"')
    .argument("<descricao>", "descrição do produto")
    .addOption(opcaoModo())
    .option("-k <k>", "número de candidatos", inteiro, 10)
    .option("--marca <marca>", "marca (é removida antes da busca)")
    .option("--categoria <categoria>", "categoria informada pelo vendedor")
    .option("--json", "saída em JSON")
    .action(async (descricao: string, o: { modo?: string; k: number; marca?: string; categoria?: string; json?: boolean }) => {
      const container = await deps.criarContainer();
      try {
        const modo = modoEfetivo(o.modo, container);
        if (modo === "vetorial+llm" && !container.llmDisponivel) {
          programa.error("Modo vetorial+llm requer ANTHROPIC_API_KEY. Use --modo vetorial.", { exitCode: 2 });
        }
        const entrada = { descricao, ...(o.marca ? { marca: o.marca } : {}), ...(o.categoria ? { categoria: o.categoria } : {}) };
        const r = await container.classificar(entrada, { modo, k: o.k });
        deps.escrever(o.json ? JSON.stringify(r, null, 2) : formatarResultado(r));
      } finally {
        await container.fechar();
      }
    });

  programa
    .command("avaliar")
    .description("Mede top-1/top-5/MRR em um CSV rotulado (id,descricao,ncm)")
    .argument("<dataset>", "caminho do CSV")
    .addOption(opcaoModo())
    .option("-k <k>", "número de candidatos", inteiro, 10)
    .action(async (arquivo: string, o: { modo?: string; k: number }) => {
      const produtos = parseDataset(await readFile(arquivo, "utf8"));
      const container = await deps.criarContainer();
      try {
        const modo = modoEfetivo(o.modo, container);
        const r = await avaliar(
          modo,
          async (descricao) => (await container.classificar({ descricao }, { modo, k: o.k })).candidatos.map((c) => c.ncm.codigo),
          produtos,
          { concorrencia: modo === "vetorial+llm" ? 4 : 1 },
        );
        deps.escrever(formatarMetricas(r.nome, r.metricas));
      } finally {
        await container.fechar();
      }
    });

  programa
    .command("ingerir")
    .description("Baixa a tabela NCM do Siscomex, enriquece e (com DATABASE_URL) grava embeddings no pgvector")
    .option("--arquivo <caminho>", "usar um JSON do Siscomex local em vez de baixar")
    .option("--referencia <data>", "data de vigência AAAA-MM-DD")
    .action((o: { arquivo?: string; referencia?: string }) => {
      const args = [...(o.arquivo ? ["--arquivo", o.arquivo] : []), ...(o.referencia ? ["--referencia", o.referencia] : [])];
      const codigo = deps.executarScript("scripts/ingest.ts", args);
      if (codigo !== 0) programa.error("Falha na ingestão.", { exitCode: codigo });
    });

  return programa;
}

export function executarScriptTsx(script: string, args: string[]): number {
  const r = spawnSync("pnpm", ["exec", "tsx", script, ...args], { cwd: RAIZ, stdio: "inherit", shell: process.platform === "win32" });
  return r.status ?? 1;
}
