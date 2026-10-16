import { createHash } from "node:crypto";
import type { EntradaClassificacao, ModoClassificacao } from "../domain/classificacao.js";

const UNIDADES: [RegExp, string][] = [
  [/(\d+(?:[.,]\d+)?)\s*(ml|mililitros?)\b/gi, "$1 ml"],
  [/(\d+(?:[.,]\d+)?)\s*(l|lt|litros?)\b/gi, "$1 litros"],
  [/(\d+(?:[.,]\d+)?)\s*(kg|quilos?|kilos?)\b/gi, "$1 kg"],
  [/(\d+(?:[.,]\d+)?)\s*(g|gr|gramas?)\b/gi, "$1 g"],
  [/(\d+(?:[.,]\d+)?)\s*(cm|centimetros?|centímetros?)\b/gi, "$1 cm"],
  [/(\d+(?:[.,]\d+)?)\s*(mm|milimetros?|milímetros?)\b/gi, "$1 mm"],
  [/(\d+(?:[.,]\d+)?)\s*(m|metros?)\b/gi, "$1 m"],
  [/(\d+(?:[.,]\d+)?)\s*(v|volts?)\b/gi, "$1 V"],
  [/(\d+(?:[.,]\d+)?)\s*(w|watts?)\b/gi, "$1 W"],
];

/** Remove acentos para comparação (hash, marca). O texto enviado ao modelo mantém acentos. */
export function semAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "");
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Prepara a descrição do produto para a busca:
 * minúsculas, unidades padronizadas, marca removida (não ajuda a classificar e confunde o embedding),
 * pontuação de anúncio ("!!!", "***") e espaços extras eliminados.
 */
export function normalizarDescricao({ descricao, marca, categoria }: EntradaClassificacao): string {
  let texto = descricao.toLowerCase();
  if (marca) {
    const m = marca.trim().toLowerCase();
    // \b não funciona com acentos nem com marcas que começam/terminam em símbolo ("(c++)")
    if (m) texto = texto.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaparRegex(m)}(?![\\p{L}\\p{N}])`, "giu"), " ");
  }
  for (const [re, sub] of UNIDADES) texto = texto.replace(re, sub);
  texto = texto.replace(/[!*#|_~^"“”]+/g, " ").replace(/\s+/g, " ").trim();
  if (categoria?.trim()) texto = `${categoria.trim().toLowerCase()}: ${texto}`;
  return texto;
}

/** Chave de cache: mesma entrada normalizada + mesmo modo + mesmo modelo = mesmo resultado. */
export function hashEntrada(entrada: EntradaClassificacao, modo: ModoClassificacao, modelo: string, k: number): string {
  const chave = JSON.stringify([semAcentos(normalizarDescricao(entrada)), modo, modelo, k]);
  return createHash("sha256").update(chave).digest("hex");
}
