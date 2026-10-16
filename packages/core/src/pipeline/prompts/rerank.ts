import type { Candidato, EntradaClassificacao } from "../../domain/classificacao.js";
import { formatarCodigo } from "../../domain/ncm.js";

export const NOME_TOOL = "escolher_ncm";

/**
 * Parte fixa do prompt (cacheável): papel + resumo das Regras Gerais de Interpretação do SH.
 * Nada variável aqui — qualquer byte diferente invalida o cache.
 */
export const SYSTEM_RERANK = `Você é um classificador fiscal especialista na Nomenclatura Comum do Mercosul (NCM).
Recebe a descrição de um produto e uma lista de códigos NCM candidatos, cada um com sua hierarquia
(capítulo > posição > subposição > item). Escolha o código mais adequado aplicando as Regras Gerais
de Interpretação do Sistema Harmonizado (RGI):

RGI 1 — Os títulos de seções e capítulos têm valor indicativo; a classificação é determinada pelos
textos das posições e das notas de seção e capítulo.
RGI 2 a) — Artigo incompleto ou desmontado classifica-se como o artigo completo se apresentar as
características essenciais dele. RGI 2 b) — Referência a uma matéria abrange essa matéria misturada
ou associada a outras.
RGI 3 — Quando o produto couber em duas ou mais posições: a) a posição mais específica prevalece
sobre a mais genérica; b) misturas e sortidos classificam-se pela matéria ou artigo que confira a
característica essencial; c) não sendo possível, a posição situada em último lugar na ordem numérica.
RGI 4 — Produtos não enquadráveis classificam-se na posição dos artigos mais semelhantes.
RGI 5 — Estojos e embalagens próprios seguem o artigo que acondicionam.
RGI 6 — Dentro de uma posição, a classificação em subposições segue os mesmos princípios, comparando
apenas subposições do mesmo nível.

Instruções:
- Escolha SOMENTE entre os códigos candidatos fornecidos. Nunca invente um código.
- Compare primeiro o capítulo e a posição (natureza e matéria do produto), depois desça na hierarquia.
- Itens "Outros"/"Outras" só são corretos quando nenhuma subposição irmã específica se aplica.
- Ignore marcas; considere matéria constitutiva, função e uso.
- A justificativa deve ser curta (2 a 4 frases), em português, citando a hierarquia e a RGI aplicada.
- "confianca" vai de 0 a 1. Use valores baixos quando a descrição do produto for ambígua.
- "alternativas" lista até 3 outros candidatos plausíveis, do mais para o menos provável.

Responda sempre chamando a ferramenta ${NOME_TOOL}.`;

export const TOOL_ESCOLHER_NCM = {
  name: NOME_TOOL,
  description: "Registra o código NCM escolhido entre os candidatos, com confiança e justificativa.",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      ncm: { type: "string", description: "Código NCM de 8 dígitos, sem pontos, exatamente como listado nos candidatos." },
      confianca: { type: "number", description: "Confiança entre 0 e 1." },
      justificativa: { type: "string", description: "Justificativa curta baseada na hierarquia e nas RGI." },
      alternativas: {
        type: "array",
        items: { type: "string" },
        description: "Até 3 outros códigos candidatos plausíveis, 8 dígitos sem pontos.",
      },
    },
    required: ["ncm", "confianca", "justificativa", "alternativas"],
    additionalProperties: false,
  },
};

/** Parte variável: produto + candidatos. Vai na mensagem do usuário, depois do cache. */
export function montarMensagemRerank(entrada: EntradaClassificacao, candidatos: Candidato[]): string {
  const produto = [
    `Descrição: ${entrada.descricao}`,
    entrada.marca ? `Marca: ${entrada.marca}` : null,
    entrada.categoria ? `Categoria informada pelo vendedor: ${entrada.categoria}` : null,
  ].filter(Boolean);

  const lista = candidatos.map((c, i) => `${i + 1}. ${c.ncm.codigo} (${formatarCodigo(c.ncm.codigo)}): ${c.ncm.descricaoCompleta}`);

  return `<produto>\n${produto.join("\n")}\n</produto>\n\n<candidatos>\n${lista.join("\n")}\n</candidatos>`;
}
