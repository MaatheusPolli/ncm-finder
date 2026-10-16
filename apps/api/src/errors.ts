export interface CorpoErro {
  erro: { codigo: string; mensagem: string; detalhes?: unknown };
}

export class ErroHttp extends Error {
  constructor(readonly status: number, readonly codigo: string, mensagem: string) {
    super(mensagem);
  }
}
