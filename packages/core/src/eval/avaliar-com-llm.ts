import type { Candidato, EscolhaLlm } from "../domain/classificacao.js";
import type { Reranker } from "../ports/reranker.js";
import { reordenar } from "../pipeline/classify.js";
import { CacheRespostasLlm } from "./cache-respostas.js";
import { avaliar, type ProdutoRotulado, type ResultadoSistema } from "./run-eval.js";

/** O que o LLM respondeu para um produto: base dos arquivos de evidência. */
export interface RespostaLlm {
  id: string;
  descricao: string;
  esperado: string;
  candidatos: string[];
  escolha: EscolhaLlm | null;
  origem: "cache" | "api" | "erro" | "pulado";
}

export interface OpcoesAvaliarComLlm {
  nome: string;
  /** Rótulo estável do modelo (entra na chave do cache). */
  modelo: string;
  reranker: Reranker;
  produtos: ProdutoRotulado[];
  candidatosDe: (descricao: string) => Promise<Candidato[]>;
  cache: CacheRespostasLlm;
  concorrencia?: number;
  /** Intervalo mínimo entre chamadas (ms), para caber no limite por minuto do provedor. */
  intervaloMs?: number;
  /** Erros de API seguidos que indicam cota esgotada. */
  limiteErrosSeguidos?: number;
  esperar?: (ms: number) => Promise<void>;
  aoProgredir?: (feitos: number, total: number) => void;
  aoErro?: (mensagem: string) => void;
}

export interface ResultadoAvaliacaoLlm {
  /** Ausente quando interrompido: métricas parciais distorceriam a comparação. */
  resultado?: ResultadoSistema;
  interrompido: boolean;
  respostas: RespostaLlm[];
  contagem: { doCache: number; novas: number; erros: number; semEscolha: number };
}

/**
 * Avalia um sistema "candidatos + LLM": consulta o cache antes de chamar o modelo, respeita o ritmo
 * configurado e para de chamar após N erros seguidos (fim de cota), preservando o que já foi respondido.
 */
export async function avaliarComLlm(o: OpcoesAvaliarComLlm): Promise<ResultadoAvaliacaoLlm> {
  const limite = o.limiteErrosSeguidos ?? 3;
  const intervalo = o.intervaloMs ?? 0;
  const esperar = o.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const contagem = { doCache: 0, novas: 0, erros: 0, semEscolha: 0 };
  const respostas = new Map<string, RespostaLlm>();
  let errosSeguidos = 0;
  let interrompido = false;
  let proximaChamada = 0;

  async function aguardarVez() {
    if (!intervalo) return;
    const agora = Date.now();
    const minha = Math.max(agora, proximaChamada);
    proximaChamada = minha + intervalo;
    if (minha > agora) await esperar(minha - agora);
  }

  const porDescricao = new Map(o.produtos.map((p) => [p.descricao, p]));
  const resultado = await avaliar(
    o.nome,
    async (descricao) => {
      const produto = porDescricao.get(descricao)!;
      const candidatos = await o.candidatosDe(descricao);
      const codigos = candidatos.map((c) => c.ncm.codigo);
      const chave = CacheRespostasLlm.chave(o.modelo, descricao, codigos);
      let escolha: EscolhaLlm | null = null;
      let origem: RespostaLlm["origem"];

      if (o.cache.tem(chave)) {
        escolha = o.cache.obter(chave)!;
        origem = "cache";
        contagem.doCache++;
      } else if (interrompido) {
        origem = "pulado";
      } else {
        try {
          await aguardarVez();
          escolha = await o.reranker.escolher({ descricao }, candidatos);
          await o.cache.registrar(chave, escolha);
          origem = "api";
          contagem.novas++;
          errosSeguidos = 0;
        } catch (erro) {
          origem = "erro";
          contagem.erros++;
          errosSeguidos++;
          o.aoErro?.((erro as Error).message.slice(0, 200));
          if (errosSeguidos >= limite) interrompido = true;
        }
      }
      if (!escolha) contagem.semEscolha++;
      respostas.set(produto.id, { id: produto.id, descricao, esperado: produto.ncm, candidatos: codigos, escolha, origem });
      return reordenar(candidatos, escolha).map((c) => c.ncm.codigo);
    },
    o.produtos,
    { concorrencia: o.concorrencia ?? 1, ...(o.aoProgredir ? { aoProgredir: o.aoProgredir } : {}) },
  );
  await o.cache.aguardar();

  const lista = o.produtos.map((p) => respostas.get(p.id)!);
  return interrompido ? { interrompido, respostas: lista, contagem } : { resultado, interrompido, respostas: lista, contagem };
}
