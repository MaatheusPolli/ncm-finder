import type { EscolhaLlm } from "@ncm-finder/core";
import { formatarCodigoWeb } from "../format";

export function Justification({ escolha }: { escolha: EscolhaLlm }) {
  const nivel = escolha.confianca >= 0.75 ? "alta" : escolha.confianca >= 0.4 ? "média" : "baixa";
  const cor = { alta: "bg-emerald-100 text-emerald-800", média: "bg-amber-100 text-amber-800", baixa: "bg-red-100 text-red-800" }[nivel];
  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950" aria-label="Escolha do LLM">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          NCM sugerido: <span className="font-mono">{formatarCodigoWeb(escolha.ncm)}</span>
        </h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cor}`}>confiança {nivel} ({Math.round(escolha.confianca * 100)}%)</span>
      </div>
      <p className="mt-2 text-slate-700 dark:text-slate-300">{escolha.justificativa}</p>
      {escolha.alternativas.length > 0 && (
        <p className="mt-2 text-sm text-slate-500">Alternativas: {escolha.alternativas.map(formatarCodigoWeb).join(", ")}</p>
      )}
    </section>
  );
}
