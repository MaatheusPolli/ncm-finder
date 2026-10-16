import type { Ncm } from "@ncm-finder/core";

/** Hierarquia capítulo > posição > … > item, a partir da descrição completa gerada na ingestão. */
export function NcmTree({ ncm }: { ncm: Ncm }) {
  const niveis = ncm.descricaoCompleta.split(" > ");
  return (
    <ol className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400" aria-label={`Hierarquia do NCM ${ncm.codigo}`}>
      {niveis.map((nivel, i) => (
        <li key={i} style={{ paddingLeft: `${i * 14}px` }} className={i === niveis.length - 1 ? "font-medium text-slate-900 dark:text-slate-100" : ""}>
          <span className="mr-1 text-slate-400">{i === 0 ? "▸" : "└"}</span>
          {i === 0 && <span className="mr-1 font-mono text-xs text-slate-500">Cap. {ncm.capitulo}</span>}
          {nivel}
        </li>
      ))}
    </ol>
  );
}
