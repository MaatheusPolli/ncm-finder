import { useState } from "react";
import type { ModoClassificacao } from "@ncm-finder/core";
import { classificar, type Resultado } from "./api";
import { CandidateList } from "./components/CandidateList";
import { Justification } from "./components/Justification";
import { SearchBox } from "./components/SearchBox";

export function App({ fetchFn = fetch }: { fetchFn?: typeof fetch }) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function buscar(entrada: { descricao: string; marca?: string }, modo: ModoClassificacao) {
    setCarregando(true);
    setErro(null);
    try {
      setResultado(await classificar(entrada, modo, fetchFn));
    } catch (e) {
      setResultado(null);
      setErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-10">
        <header>
          <h1 className="text-2xl font-bold">NCM Finder</h1>
          <p className="text-slate-600 dark:text-slate-400">
            Descreva o produto e receba os códigos NCM mais prováveis: busca semântica, com escolha e justificativa do Claude.
          </p>
        </header>

        <SearchBox carregando={carregando} aoBuscar={buscar} />

        {erro && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
            {erro}
          </p>
        )}

        {resultado && (
          <>
            {resultado.escolha && <Justification escolha={resultado.escolha} />}
            {resultado.modo === "vetorial+llm" && !resultado.escolha && (
              <p className="text-sm text-amber-700">O LLM não retornou uma escolha válida; exibindo a ordem da busca vetorial.</p>
            )}
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Candidatos · {resultado.modeloEmbedding}
                {resultado.cache ? " · do cache" : ""}
              </h2>
              <CandidateList key={resultado.candidatos.map((c) => c.ncm.codigo).join()} candidatos={resultado.candidatos} escolhido={resultado.escolha?.ncm ?? null} />
            </section>
          </>
        )}

        <footer className="pt-4 text-xs text-slate-500">
          Sugestão automatizada: confirme a classificação fiscal com um profissional antes de emitir documentos.
        </footer>
      </main>
    </div>
  );
}
