export class NcmFinderError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidNcmCodeError extends NcmFinderError {
  constructor(codigo: string) {
    super(`Código NCM inválido: "${codigo}" (esperado 8 dígitos)`, "INVALID_NCM_CODE");
  }
}

export class EmbeddingDimensionError extends NcmFinderError {
  constructor(expected: number, received: number) {
    super(`Dimensão do embedding incompatível: esperado ${expected}, recebido ${received}`, "EMBEDDING_DIMENSION");
  }
}
