import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { EscolhaLlm } from "../domain/classificacao.js";

/**
 * Cache em disco das respostas do LLM na avaliação: permite retomar após limite de cota
 * e regerar o relatório sem chamar a API.
 *
 * Cada gravação relê o arquivo e faz a UNIÃO com o que está em memória antes de escrever.
 * Sem isso, duas execuções simultâneas sobrescrevem as respostas uma da outra
 * (aconteceu: ~70 respostas perdidas quando um processo antigo continuou rodando).
 * A escrita é atômica (arquivo temporário + rename) para não deixar JSON truncado se o processo morrer.
 */
export class CacheRespostasLlm {
  private readonly dados: Record<string, EscolhaLlm | null> = {};
  private fila: Promise<void> = Promise.resolve();

  private constructor(private readonly arquivo: string) {}

  static async abrir(arquivo: string): Promise<CacheRespostasLlm> {
    const cache = new CacheRespostasLlm(arquivo);
    Object.assign(cache.dados, await CacheRespostasLlm.ler(arquivo));
    return cache;
  }

  private static async ler(arquivo: string): Promise<Record<string, EscolhaLlm | null>> {
    if (!existsSync(arquivo)) return {};
    return JSON.parse(await readFile(arquivo, "utf8")) as Record<string, EscolhaLlm | null>;
  }

  /** Chave estável: mesmo modelo + mesmo produto + mesmos candidatos (na mesma ordem) = mesma resposta. */
  static chave(modelo: string, descricao: string, codigosCandidatos: string[]): string {
    return createHash("sha256").update(JSON.stringify([modelo, descricao, codigosCandidatos])).digest("hex").slice(0, 24);
  }

  get tamanho(): number {
    return Object.keys(this.dados).length;
  }

  tem(chave: string): boolean {
    return chave in this.dados;
  }

  obter(chave: string): EscolhaLlm | null | undefined {
    return this.dados[chave];
  }

  /** Registra e agenda a gravação (serializada). Erros de API não devem ser registrados: só respostas. */
  registrar(chave: string, escolha: EscolhaLlm | null): Promise<void> {
    this.dados[chave] = escolha;
    return this.gravar();
  }

  /** Aguarda todas as gravações pendentes. */
  aguardar(): Promise<void> {
    return this.fila;
  }

  private gravar(): Promise<void> {
    this.fila = this.fila.then(async () => {
      const noDisco = await CacheRespostasLlm.ler(this.arquivo);
      // União: o que outro processo gravou entra na memória e vice-versa.
      for (const [k, v] of Object.entries(noDisco)) if (!(k in this.dados)) this.dados[k] = v;
      await mkdir(dirname(this.arquivo), { recursive: true });
      const temporario = `${this.arquivo}.${process.pid}.tmp`;
      await writeFile(temporario, JSON.stringify(this.dados, null, 1));
      await rename(temporario, this.arquivo);
    });
    return this.fila;
  }
}
