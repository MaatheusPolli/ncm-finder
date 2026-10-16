import { z } from "zod";
import { InvalidNcmCodeError } from "./errors.js";

export const NcmCodigoSchema = z.string().regex(/^\d{8}$/);

export interface Ncm {
  codigo: string;
  descricao: string;
  /** Descrição concatenando os níveis pais (capítulo > posição > subposição > item). */
  descricaoCompleta: string;
  capitulo: string;
  posicao: string;
  subposicao: string;
  vigenciaInicio?: string;
  vigenciaFim?: string;
}

export interface NcmHierarquia {
  capitulo: string;
  posicao: string;
  subposicao: string;
  codigo: string;
}

/** Remove pontuação ("6404.11.00" → "64041100") e valida 8 dígitos. */
export function normalizarCodigo(codigo: string): string {
  const limpo = codigo.replace(/\D/g, "");
  if (!NcmCodigoSchema.safeParse(limpo).success) throw new InvalidNcmCodeError(codigo);
  return limpo;
}

export function hierarquiaDe(codigo: string): NcmHierarquia {
  const c = normalizarCodigo(codigo);
  return { capitulo: c.slice(0, 2), posicao: c.slice(0, 4), subposicao: c.slice(0, 6), codigo: c };
}

export function formatarCodigo(codigo: string): string {
  const c = normalizarCodigo(codigo);
  return `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6, 8)}`;
}
