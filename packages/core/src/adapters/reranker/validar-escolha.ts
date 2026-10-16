import type { Candidato, EscolhaLlm } from "../../domain/classificacao.js";

export type MotivoFallback = "sem_tool_use" | "schema_invalido" | "fora_dos_candidatos" | "recusa";

/**
 * Garante que a escolha do LLM está entre os candidatos. Código inventado → melhor alternativa
 * válida com confiança reduzida; sem alternativa válida → null (fica a ordem vetorial).
 */
export function validarEscolha(
  escolha: EscolhaLlm,
  candidatos: Candidato[],
  aoDescartar: (motivo: MotivoFallback, detalhe: string) => void,
): EscolhaLlm | null {
  const validos = new Set(candidatos.map((c) => c.ncm.codigo));
  const alternativas = escolha.alternativas.filter((a) => validos.has(a) && a !== escolha.ncm).slice(0, 3);

  if (validos.has(escolha.ncm)) return { ...escolha, alternativas };

  aoDescartar("fora_dos_candidatos", escolha.ncm);
  const [primeira, ...resto] = alternativas;
  if (!primeira) return null;
  return {
    ncm: primeira,
    confianca: Math.min(escolha.confianca, 0.3),
    justificativa: `O modelo sugeriu ${escolha.ncm}, que não está entre os candidatos; usada a alternativa válida mais provável. ${escolha.justificativa}`,
    alternativas: resto,
  };
}
