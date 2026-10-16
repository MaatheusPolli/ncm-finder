# NCM Finder — Planejamento do Projeto

> Classificador de produtos por NCM (Nomenclatura Comum do Mercosul) usando embeddings + busca vetorial + LLM para desempate, com avaliação de acurácia mensurável.

## 1. Visão geral

### Problema
Todo produto vendido no Brasil precisa de um código NCM de 8 dígitos, que define tributação. A tabela tem mais de 10 mil códigos com descrições técnicas ("Outros — dos tipos utilizados em..."). Classificar errado gera multa e imposto incorreto. Hoje isso é feito manualmente ou com busca por palavra-chave, que falha porque "tênis de corrida" não contém a palavra "calçado".

### Solução
Um serviço que recebe nome/descrição do produto e retorna os NCMs mais prováveis com justificativa:
1. **Busca semântica**: descrição do produto → embedding → top-k NCMs por similaridade de cosseno (pgvector ou índice local).
2. **Reranking com LLM**: Claude recebe o produto + os top-k candidatos e escolhe o mais adequado, explicando com base na hierarquia (capítulo → posição → subposição).
3. **Avaliação**: dataset rotulado de produtos reais → métricas top-1, top-5 e acurácia por capítulo, com comparação contra baseline de busca textual (BM25).

Entregáveis: API REST, CLI, mini UI React e relatório de avaliação.

### Objetivos de portfólio
- Aplicar o conteúdo da pós em IA (embeddings, RAG, LLM-as-reranker, avaliação).
- Mostrar rigor: métricas, baseline, dataset versionado — não só "chamei a API".
- Unir IA ao domínio fiscal do currículo.
- Post no LinkedIn: gráfico "BM25 vs embeddings vs embeddings + LLM".

### Fora de escopo (v1)
- Fine-tuning de modelo.
- CEST, exceções de TIPI, NCM por estado.
- Multi-idioma.

## 2. Requisitos

### Funcionais
| ID | Requisito |
|----|-----------|
| RF01 | Ingestão da tabela NCM oficial (CSV/JSON do Siscomex) com hierarquia (capítulo, posição, subposição, item). |
| RF02 | Enriquecimento de cada NCM com texto de contexto (descrição completa concatenando os níveis pais). |
| RF03 | Geração e persistência de embeddings dos NCMs (batch, idempotente, versionado por modelo). |
| RF04 | `POST /classificar` → `{ descricao, marca?, categoria? }` → top-k candidatos com score + escolha do LLM + justificativa. |
| RF05 | Modo "somente vetorial" (rápido/barato) e modo "vetorial + LLM" (preciso). |
| RF06 | CLI: `ncm classificar "tênis de corrida masculino"` e `ncm avaliar dataset.csv`. |
| RF07 | UI: campo de busca, lista de candidatos com árvore hierárquica e justificativa. |
| RF08 | Script de avaliação gerando `report/eval.md` com métricas e matriz por capítulo. |
| RF09 | Cache de classificações por hash da descrição. |

### Não funcionais
- Busca vetorial < 100 ms para 10k vetores.
- Custo: modo LLM usa prompt caching e limita candidatos a k=10.
- Reprodutibilidade: seed, versão do modelo de embedding e do dataset registradas no relatório.
- Cobertura ≥ 85% (excluindo chamadas reais a APIs, que são mockadas).

## 3. Arquitetura

```
┌──────────────┐  ┌──────────────┐
│ apps/web     │  │ apps/cli     │
└──────┬───────┘  └──────┬───────┘
       └────────┬────────┘
        ┌───────▼────────┐
        │ apps/api       │  Fastify
        └───────┬────────┘
        ┌───────▼─────────────────────────────────┐
        │ packages/core                           │
        │  ingest/    tabela NCM → registros      │
        │  embed/     EmbeddingProvider (interface)│
        │  search/    VectorStore (interface)     │
        │  rerank/    LlmReranker (Claude)        │
        │  pipeline/  classificar()               │
        │  eval/      métricas, baseline BM25     │
        └───────┬─────────────────────────────────┘
        ┌───────▼────────┐   ┌────────────────┐
        │ PostgreSQL     │   │ Claude API     │
        │ + pgvector     │   │ (rerank)       │
        └────────────────┘   └────────────────┘
```

### Padrões
- **Ports & Adapters**: `EmbeddingProvider` (Voyage AI / OpenAI / local via `@xenova/transformers`), `VectorStore` (pgvector / in-memory para testes), `Reranker` (Claude / no-op). Trocar provedor não toca o pipeline.
- **Pipeline explícito**: `normalizar → embed → buscar(k) → rerank → montar resposta` — cada etapa é uma função pura ou um port.
- **Structured output** no rerank: o LLM responde JSON validado por Zod `{ ncm, confianca, justificativa, alternativas[] }`; usa tool use para garantir o schema.
- **Avaliação como cidadã de primeira classe**: `eval/` é código de produção, com testes.

### Modelo de dados

```sql
CREATE TABLE ncm (
  codigo CHAR(8) PRIMARY KEY,
  descricao TEXT NOT NULL,
  descricao_completa TEXT NOT NULL,   -- pais concatenados
  capitulo CHAR(2), posicao CHAR(4), subposicao CHAR(6),
  vigencia_inicio DATE, vigencia_fim DATE
);
CREATE TABLE ncm_embedding (
  codigo CHAR(8) REFERENCES ncm,
  modelo TEXT NOT NULL,
  embedding VECTOR(1024) NOT NULL,
  PRIMARY KEY (codigo, modelo)
);
CREATE INDEX ON ncm_embedding USING hnsw (embedding vector_cosine_ops);
CREATE TABLE classificacao_cache (
  hash TEXT PRIMARY KEY, entrada JSONB, resultado JSONB, criado_em TIMESTAMPTZ
);
```

### Prompt do reranker (esboço)

```
Você é um classificador fiscal. Dado o produto e os candidatos NCM abaixo
(com hierarquia capítulo > posição > subposição), escolha o código mais
adequado seguindo as Regras Gerais de Interpretação do Sistema Harmonizado.
Responda usando a tool `escolher_ncm`.
```

## 4. Estrutura de pastas

```
ncm-finder/
├── .github/workflows/ci.yml
├── package.json  pnpm-workspace.yaml  tsconfig.base.json
├── docker-compose.yml               # postgres + pgvector
├── README.md
├── data/
│   ├── ncm/                         # tabela oficial (versionada por data)
│   └── eval/
│       ├── produtos-rotulados.csv   # ~300 produtos com NCM correto
│       └── README.md                # origem e critérios de rotulagem
├── packages/core/
│   ├── package.json  tsup.config.ts
│   ├── src/
│   │   ├── index.ts
│   │   ├── domain/
│   │   │   ├── ncm.ts
│   │   │   ├── classificacao.ts
│   │   │   └── errors.ts
│   │   ├── ports/
│   │   │   ├── embedding-provider.ts
│   │   │   ├── vector-store.ts
│   │   │   ├── reranker.ts
│   │   │   └── cache.ts
│   │   ├── adapters/
│   │   │   ├── embeddings/ voyage.ts  openai.ts  local-transformers.ts
│   │   │   ├── vector/ pgvector.ts  memory.ts
│   │   │   ├── reranker/ claude.ts  noop.ts
│   │   │   └── cache/ postgres.ts  memory.ts
│   │   ├── ingest/
│   │   │   ├── parse-ncm.ts
│   │   │   ├── build-hierarchy.ts
│   │   │   └── enrich-description.ts
│   │   ├── pipeline/
│   │   │   ├── normalize.ts
│   │   │   ├── classify.ts
│   │   │   └── prompts/rerank.ts
│   │   └── eval/
│   │       ├── metrics.ts           # top-1, top-5, MRR, por capítulo
│   │       ├── baseline-bm25.ts
│   │       └── run-eval.ts
│   └── tests/
│       ├── ingest.test.ts
│       ├── pipeline.test.ts         # adapters memory + reranker noop
│       ├── reranker.claude.test.ts  # API mockada, valida parsing/tool use
│       ├── metrics.test.ts
│       └── fixtures/
├── apps/api/
│   ├── src/ server.ts  routes/classificar.ts  routes/health.ts  container.ts
│   └── tests/ classificar.test.ts
├── apps/cli/
│   └── src/ index.ts  commands/ classificar.ts  avaliar.ts  ingerir.ts
├── apps/web/
│   └── src/ App.tsx  components/ SearchBox.tsx  CandidateList.tsx  NcmTree.tsx  Justification.tsx
├── scripts/
│   ├── ingest.ts                    # baixa tabela + gera embeddings
│   └── eval.ts                      # gera report/eval.md
└── report/
    └── eval.md                      # commitado como evidência
```

## 5. Stack

| Camada | Tecnologia | Motivo |
|--------|-----------|--------|
| Linguagem | TypeScript 5 strict | |
| Embeddings | Voyage AI (`voyage-3`) padrão; `@xenova/transformers` (multilingual-e5) como opção offline | qualidade vs. custo zero |
| Vetores | PostgreSQL 16 + pgvector (HNSW) | produção-ready; in-memory nos testes |
| LLM | Claude via `@anthropic-ai/sdk` com tool use + prompt caching | structured output confiável |
| Baseline | `wink-bm25-text-search` | comparação honesta |
| API | Fastify + Zod type provider | rápido e tipado |
| CLI | `commander` | |
| UI | React + Vite + Tailwind | |
| Testes | Vitest, MSW, Testcontainers (pgvector) | integração real com banco |
| CI | GitHub Actions com service postgres | |

## 6. Estratégia de testes

- **Ingestão**: parse da tabela oficial, hierarquia correta (pai de `64041100` é `640411`, `6404`, `64`), descrição enriquecida.
- **Pipeline (unit)**: adapters em memória + reranker no-op; garante ordenação, k, normalização de texto (acentos, unidades, marcas).
- **Reranker Claude**: SDK mockado — valida montagem do prompt, parsing do tool use, fallback quando o LLM escolhe código fora dos candidatos.
- **Integração pgvector**: Testcontainers sobe Postgres real; insere 50 NCMs, busca e valida vizinhos.
- **API**: rotas com `inject()` do Fastify; erros 400/422/500 padronizados.
- **Avaliação (regressão)**: `eval` roda sobre subconjunto de 50 produtos com embeddings gravados em fixture; CI falha se top-5 cair abaixo do limiar registrado.

## 7. Boas práticas adotadas

- Ports & Adapters: nada no `pipeline/` importa SDK de terceiros.
- Chaves de API só por env; `.env.example` documentado; nunca logar prompts completos com dados de cliente.
- Versionamento explícito: modelo de embedding gravado junto do vetor; relatório registra versões e data da tabela NCM.
- Custo controlado: k pequeno, prompt caching no contexto fixo (regras + formato), cache de resultados.
- Dataset de avaliação com origem e critérios documentados; sem dados sensíveis.
- Conventional Commits; README com arquitetura, métricas e como reproduzir a avaliação.

## 8. Roadmap

| Etapa | Entregas | Estimativa |
|-------|----------|-----------|
| 1. Setup | monorepo, docker pgvector, CI, ports/domínio | 2h |
| 2. Ingestão | parser NCM, hierarquia, enriquecimento, script de embeddings | 3h |
| 3. Busca | adapters pgvector + memory, pipeline modo vetorial, testes | 3h |
| 4. Rerank | adapter Claude com tool use, prompt, fallback, testes | 3h |
| 5. Avaliação | dataset rotulado (300), BM25 baseline, métricas, `report/eval.md` | 4h |
| 6. API + CLI + UI | Fastify, commander, React mínimo | 4h |
| 7. Publicação | README, gráfico de métricas, post | 1h |

**Total: ~20h (3 dias)**

## 9. Definition of Done

- [ ] `pnpm ingest` popula NCM + embeddings de forma idempotente.
- [ ] `pnpm eval` gera relatório com top-1/top-5 para BM25, vetorial e vetorial+LLM.
- [ ] Vetorial+LLM supera BM25 no dataset (meta: top-1 ≥ 70%, top-5 ≥ 90%).
- [ ] CI verde incluindo integração com pgvector.
- [ ] Post no LinkedIn com gráfico comparativo e exemplo de justificativa.
