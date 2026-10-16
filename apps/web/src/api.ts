import type { ModoClassificacao, ResultadoClassificacao } from "@ncm-finder/core";

export type Resultado = ResultadoClassificacao & { cache: boolean };

export class ErroApi extends Error {
  constructor(readonly status: number, readonly codigo: string, mensagem: string) {
    super(mensagem);
  }
}

export async function classificar(
  entrada: { descricao: string; marca?: string },
  modo: ModoClassificacao,
  fetchFn: typeof fetch = fetch,
): Promise<Resultado> {
  const resposta = await fetchFn(`/api/classificar?modo=${encodeURIComponent(modo)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(entrada),
  });
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new ErroApi(resposta.status, corpo?.erro?.codigo ?? "ERRO", corpo?.erro?.mensagem ?? `Erro ${resposta.status}`);
  }
  return corpo as Resultado;
}
