import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

const ncm = (codigo: string, descricao: string) => ({
  codigo, descricao, descricaoCompleta: `Calçado, polainas e artigos semelhantes > Calçado com sola de borracha > ${descricao}`,
  capitulo: codigo.slice(0, 2), posicao: codigo.slice(0, 4), subposicao: codigo.slice(0, 6),
});
const resposta = {
  entrada: { descricao: "tênis de corrida" },
  modo: "vetorial+llm",
  candidatos: [{ ncm: ncm("64041900", "Outro"), score: 0.84 }, { ncm: ncm("64041100", "Calçado para esporte"), score: 0.88 }],
  escolha: { ncm: "64041100", confianca: 0.9, justificativa: "Calçado para esporte (RGI 1 e 6).", alternativas: ["64041900"] },
  modeloEmbedding: "Xenova/multilingual-e5-small",
  cache: false,
};
const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

afterEach(cleanup);

async function buscar(fetchFn: typeof fetch, modo?: string) {
  render(<App fetchFn={fetchFn} />);
  fireEvent.change(screen.getByLabelText("Descrição do produto"), { target: { value: "tênis de corrida" } });
  fireEvent.change(screen.getByLabelText("Marca (opcional)"), { target: { value: "Acme" } });
  if (modo) fireEvent.click(screen.getByLabelText(modo));
  fireEvent.click(screen.getByRole("button", { name: "Classificar" }));
}

describe("App", () => {
  it("envia a busca e mostra escolha, justificativa, candidatos e árvore", async () => {
    const f = vi.fn(async () => json(200, resposta));
    await buscar(f as unknown as typeof fetch);
    await screen.findByText(/NCM sugerido/);
    expect(f).toHaveBeenCalledWith("/api/classificar?modo=vetorial%2Bllm", expect.objectContaining({ method: "POST", body: JSON.stringify({ descricao: "tênis de corrida", marca: "Acme" }) }));
    expect(screen.getByText("Calçado para esporte (RGI 1 e 6).")).toBeTruthy();
    expect(screen.getByText(/confiança alta \(90%\)/)).toBeTruthy();
    expect(screen.getByText("Alternativas: 6404.19.00")).toBeTruthy();
    // árvore do escolhido já aberta
    expect(screen.getByLabelText("Hierarquia do NCM 64041100")).toBeTruthy();
    // abre outro candidato
    fireEvent.click(screen.getByText("Outro"));
    expect(screen.getByLabelText("Hierarquia do NCM 64041900")).toBeTruthy();
  });

  it("modo vetorial sem escolha", async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => json(200, { ...resposta, modo: "vetorial", escolha: null, cache: true }));
    await buscar(f as unknown as typeof fetch, "Só vetorial (rápido)");
    await screen.findByText(/do cache/);
    expect(f.mock.calls[0]![0]).toBe("/api/classificar?modo=vetorial");
    expect(screen.queryByText(/NCM sugerido/)).toBeNull();
  });

  it("mostra erro da API", async () => {
    const f = vi.fn(async () => json(422, { erro: { codigo: "LLM_INDISPONIVEL", mensagem: "Modo vetorial+llm indisponível." } }));
    await buscar(f as unknown as typeof fetch);
    expect((await screen.findByRole("alert")).textContent).toBe("Modo vetorial+llm indisponível.");
  });

  it("erro sem corpo JSON", async () => {
    const f = vi.fn(async () => new Response("bad gateway", { status: 502 }));
    await buscar(f as unknown as typeof fetch);
    expect((await screen.findByRole("alert")).textContent).toBe("Erro 502");
  });

  it("não envia descrição curta", async () => {
    const f = vi.fn();
    render(<App fetchFn={f as unknown as typeof fetch} />);
    fireEvent.change(screen.getByLabelText("Descrição do produto"), { target: { value: "a" } });
    expect((screen.getByRole("button", { name: "Classificar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(screen.getByRole("button", { name: "Classificar" }).closest("form")!);
    await waitFor(() => expect(f).not.toHaveBeenCalled());
  });
});
