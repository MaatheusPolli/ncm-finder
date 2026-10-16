import { z } from "zod";

/** Formato do JSON publicado pelo Portal Único Siscomex (classif/api/publico/nomenclatura/download/json). */
const NomenclaturaSchema = z.object({
  Codigo: z.string(),
  Descricao: z.string(),
  Data_Inicio: z.string(),
  Data_Fim: z.string(),
});

export const TabelaSiscomexSchema = z.object({
  Data_Ultima_Atualizacao_NCM: z.string(),
  Ato: z.string(),
  Nomenclaturas: z.array(NomenclaturaSchema),
});
export type TabelaSiscomex = z.infer<typeof TabelaSiscomexSchema>;

/** Um nó da nomenclatura em qualquer nível (2 a 8 dígitos). */
export interface NoNcm {
  /** Somente dígitos: "64", "6404", "64041", "640411", "6404111", "64041100". */
  codigo: string;
  descricao: string;
  vigenciaInicio: string;
  vigenciaFim: string;
}

export interface TabelaNcm {
  atualizacao: string;
  ato: string;
  nos: NoNcm[];
}

/** "01/04/2022" → "2022-04-01" */
export function dataBrParaIso(data: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data.trim());
  if (!m) throw new Error(`Data inválida na tabela NCM: "${data}"`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Remove tags HTML (ex.: <i>Gallus domesticus</i>), traços de nível e espaços extras. */
export function limparDescricao(descricao: string): string {
  return descricao
    .replace(/<[^>]+>/g, "")
    .replace(/^[\s-–]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Converte o JSON oficial em nós normalizados, mantendo apenas os vigentes na data de referência.
 * @param referencia data ISO (AAAA-MM-DD); por padrão, hoje.
 */
export function parseTabelaNcm(json: unknown, referencia = new Date().toISOString().slice(0, 10)): TabelaNcm {
  const tabela = TabelaSiscomexSchema.parse(json);
  const nos: NoNcm[] = [];
  for (const n of tabela.Nomenclaturas) {
    const vigenciaInicio = dataBrParaIso(n.Data_Inicio);
    const vigenciaFim = dataBrParaIso(n.Data_Fim);
    if (vigenciaInicio > referencia || vigenciaFim < referencia) continue;
    nos.push({ codigo: n.Codigo.replace(/\D/g, ""), descricao: limparDescricao(n.Descricao), vigenciaInicio, vigenciaFim });
  }
  return { atualizacao: tabela.Data_Ultima_Atualizacao_NCM, ato: tabela.Ato, nos };
}
