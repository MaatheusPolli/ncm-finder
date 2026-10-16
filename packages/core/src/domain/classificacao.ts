import { z } from "zod";
import { NcmCodigoSchema, type Ncm } from "./ncm.js";

export const EntradaClassificacaoSchema = z.object({
  descricao: z.string().trim().min(2).max(2000),
  marca: z.string().trim().max(200).optional(),
  categoria: z.string().trim().max(200).optional(),
});
export type EntradaClassificacao = z.infer<typeof EntradaClassificacaoSchema>;

export type ModoClassificacao = "vetorial" | "vetorial+llm";

export interface Candidato {
  ncm: Ncm;
  /** Similaridade de cosseno em [-1, 1]. */
  score: number;
}

export const EscolhaLlmSchema = z.object({
  ncm: NcmCodigoSchema,
  confianca: z.number().min(0).max(1),
  justificativa: z.string().min(1),
  alternativas: z.array(NcmCodigoSchema).default([]),
});
export type EscolhaLlm = z.infer<typeof EscolhaLlmSchema>;

export interface ResultadoClassificacao {
  entrada: EntradaClassificacao;
  modo: ModoClassificacao;
  candidatos: Candidato[];
  escolha: EscolhaLlm | null;
  modeloEmbedding: string;
}
