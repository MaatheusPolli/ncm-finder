CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS ncm (
  codigo CHAR(8) PRIMARY KEY,
  descricao TEXT NOT NULL,
  descricao_completa TEXT NOT NULL,
  capitulo CHAR(2) NOT NULL,
  posicao CHAR(4) NOT NULL,
  subposicao CHAR(6) NOT NULL,
  vigencia_inicio DATE,
  vigencia_fim DATE
);

-- Sem dimensão fixa: cada modelo (voyage-3 = 1024, multilingual-e5-small = 384) convive na mesma tabela.
-- O PgVectorStore cria um índice HNSW parcial por modelo, com cast para a dimensão dele.
CREATE TABLE IF NOT EXISTS ncm_embedding (
  codigo CHAR(8) REFERENCES ncm ON DELETE CASCADE,
  modelo TEXT NOT NULL,
  embedding VECTOR NOT NULL,
  PRIMARY KEY (codigo, modelo)
);

CREATE TABLE IF NOT EXISTS classificacao_cache (
  hash TEXT PRIMARY KEY,
  entrada JSONB NOT NULL,
  resultado JSONB NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
