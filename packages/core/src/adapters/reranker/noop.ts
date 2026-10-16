import type { Reranker } from "../../ports/reranker.js";

/** Modo "somente vetorial": não escolhe, mantém a ordem da busca. */
export class NoopReranker implements Reranker {
  async escolher(): Promise<null> {
    return null;
  }
}
