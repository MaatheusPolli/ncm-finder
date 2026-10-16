import type { Ncm } from "../domain/ncm.js";
import { HierarquiaNcm } from "./build-hierarchy.js";
import type { TabelaNcm } from "./parse-ncm.js";

const SEPARADOR = " > ";

/** Remove ":" final dos níveis agrupadores ("Calçado com sola ...:") para a concatenação ficar legível. */
function semDoisPontos(texto: string): string {
  return texto.replace(/:\s*$/, "");
}

/**
 * Gera os NCMs de 8 dígitos com a descrição completa (pais concatenados).
 * Sem isso, "-- Outros" não tem significado algum para a busca semântica.
 */
export function construirNcms(tabela: TabelaNcm): Ncm[] {
  const hierarquia = new HierarquiaNcm(tabela.nos);
  return hierarquia
    .folhas()
    .map((folha) => {
      const cadeia = [...hierarquia.ancestrais(folha.codigo), folha].map((n) => semDoisPontos(n.descricao));
      return {
        codigo: folha.codigo,
        descricao: folha.descricao,
        descricaoCompleta: cadeia.join(SEPARADOR),
        capitulo: folha.codigo.slice(0, 2),
        posicao: folha.codigo.slice(0, 4),
        subposicao: folha.codigo.slice(0, 6),
        vigenciaInicio: folha.vigenciaInicio,
        vigenciaFim: folha.vigenciaFim,
      };
    })
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}
