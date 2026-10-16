import { useState } from "react";
import type { Candidato } from "@ncm-finder/core";
import { formatarCodigoWeb } from "../format";
import { NcmTree } from "./NcmTree";

interface Props {
  candidatos: Candidato[];
  escolhido: string | null;
}

export function CandidateList({ candidatos, escolhido }: Props) {
  const [aberto, setAberto] = useState<string | null>(escolhido ?? candidatos[0]?.ncm.codigo ?? null);
  if (candidatos.length === 0) return <p className="text-slate-500">Nenhum candidato encontrado.</p>;

  return (
    <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
      {candidatos.map((c, i) => {
        const expandido = aberto === c.ncm.codigo;
        return (
          <li key={c.ncm.codigo} className={c.ncm.codigo === escolhido ? "bg-blue-50/60 dark:bg-blue-950/40" : ""}>
            <button
              type="button"
              onClick={() => setAberto(expandido ? null : c.ncm.codigo)}
              aria-expanded={expandido}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <span className="w-6 text-right text-sm text-slate-400">{i + 1}</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{formatarCodigoWeb(c.ncm.codigo)}</span>
              <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{c.ncm.descricao}</span>
              {c.ncm.codigo === escolhido && <span className="rounded bg-blue-600 px-1.5 py-0.5 text-xs font-medium text-white">LLM</span>}
              <span className="hidden w-24 sm:block" title={`similaridade ${c.score.toFixed(3)}`}>
                <span className="block h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                  <span className="block h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.max(0, Math.min(1, c.score)) * 100}%` }} />
                </span>
              </span>
              <span className="w-12 text-right font-mono text-xs text-slate-500">{c.score.toFixed(3)}</span>
            </button>
            {expandido && (
              <div className="px-4 pb-4 pl-13">
                <NcmTree ncm={c.ncm} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
