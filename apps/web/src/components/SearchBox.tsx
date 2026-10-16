import { useState, type FormEvent } from "react";
import type { ModoClassificacao } from "@ncm-finder/core";

interface Props {
  carregando: boolean;
  aoBuscar: (entrada: { descricao: string; marca?: string }, modo: ModoClassificacao) => void;
}

export function SearchBox({ carregando, aoBuscar }: Props) {
  const [descricao, setDescricao] = useState("");
  const [marca, setMarca] = useState("");
  const [modo, setModo] = useState<ModoClassificacao>("vetorial+llm");

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (descricao.trim().length < 2) return;
    aoBuscar({ descricao: descricao.trim(), ...(marca.trim() ? { marca: marca.trim() } : {}) }, modo);
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
        Descrição do produto
        <input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="ex.: tênis de corrida masculino com amortecimento"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          autoFocus
        />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
          Marca (opcional)
          <input
            value={marca}
            onChange={(e) => setMarca(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>
        <fieldset className="flex gap-3 text-sm text-slate-700 dark:text-slate-300">
          <legend className="sr-only">Modo</legend>
          {(["vetorial", "vetorial+llm"] as const).map((m) => (
            <label key={m} className="flex items-center gap-1.5">
              <input type="radio" name="modo" checked={modo === m} onChange={() => setModo(m)} />
              {m === "vetorial" ? "Só vetorial (rápido)" : "Vetorial + LLM"}
            </label>
          ))}
        </fieldset>
        <button
          type="submit"
          disabled={carregando || descricao.trim().length < 2}
          className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {carregando ? "Classificando…" : "Classificar"}
        </button>
      </div>
    </form>
  );
}
