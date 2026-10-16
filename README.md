# NCM Finder

Classificador de produtos por **NCM** (Nomenclatura Comum do Mercosul): recebe a descriÃ§Ã£o de um produto e devolve os cÃ³digos de 8 dÃ­gitos mais provÃ¡veis. Usa busca semÃ¢ntica (embeddings + pgvector) e, no modo preciso, o **Claude** como reranker, que escolhe entre os candidatos e justifica pela hierarquia e pelas Regras Gerais de InterpretaÃ§Ã£o do SH.

A avaliaÃ§Ã£o Ã© parte do produto: dataset rotulado versionado, baseline BM25, mÃ©tricas top-1/top-5/MRR, relatÃ³rio gerado por script e teste de regressÃ£o de acurÃ¡cia no CI.

![AcurÃ¡cia por sistema](report/eval-chart.svg)

## Resultados atuais

ExecuÃ§Ã£o de 2026-09-28 sobre 300 produtos (**dataset v2**, rÃ³tulos revisados), com a tabela NCM vigente (Res. Gecex nÂº 926/2026, 10.515 cÃ³digos), embeddings **locais** `Xenova/bge-m3` (offline), busca hÃ­brida e reranker **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`, via Claude Code CLI) com 20 candidatos por produto. RelatÃ³rio completo em [report/eval.md](report/eval.md); evidÃªncias produto a produto em [report/evidencias/](report/evidencias/).

| Sistema | Top-1 | Top-5 | Top-10 | MRR | CapÃ­tulo certo |
|---|---|---|---|---|---|
| BM25 (baseline) | 26,3% | 49,7% | 57,0% | 0,360 | 50,7% |
| Vetorial (bge-m3) | 24,7% | 50,7% | 60,3% | 0,357 | 59,0% |
| HÃ­brido BM25 + vetorial (RRF) | 31,3% | 59,3% | 69,3% | 0,430 | 61,0% |
| Vetorial + LLM (Haiku) | 62,3% | 66,3% | 67,3% | 0,642 | 84,0% |
| **HÃ­brido + LLM (Haiku)** | **70,0%** | **73,7%** | **75,0%** | **0,720** | **88,7%** |

### EvoluÃ§Ã£o

| Rodada | Dataset | Embedding | Candidatos ao LLM | LLM | Top-1 do melhor sistema |
|---|---|---|---|---|---|
| 1 | v1 | e5-small | â€” | â€” | 25,0% (BM25) |
| 2 | v1 | e5-small | hÃ­brido, k = 10 | Gemini 3.5 Flash Lite | 54,7% |
| 3 | v1 | **bge-m3** | **hÃ­brido (c = 10), k = 20** | Claude Haiku 4.5 | 64,3% |
| 3 | **v2** | bge-m3 | hÃ­brido (c = 10), k = 20 | Claude Haiku 4.5 | **70,0%** |

- **Rodada 2 â†’ 3** mudou mais de uma variÃ¡vel (embedding, k e LLM), entÃ£o o ganho de +9,6 p.p. nÃ£o Ã© atribuÃ­vel a uma sÃ³. A contribuiÃ§Ã£o da recuperaÃ§Ã£o foi medida isoladamente: o cÃ³digo certo aparece entre os 20 candidatos hÃ­bridos em 76% dos produtos com bge-m3, contra 61% entre 10 com e5-small.
- **v1 â†’ v2** nÃ£o muda o sistema: sÃ£o as mesmas 600 respostas do Haiku (0 chamadas novas), reavaliadas com rÃ³tulos corrigidos. 31 rÃ³tulos (10,3%) estavam errados, e em 19 deles o sistema jÃ¡ sugeria o cÃ³digo correto ([data/eval/revisao-rotulos-v2.md](data/eval/revisao-rotulos-v2.md)).

### O que os nÃºmeros mostram

- **Meta do planejamento atingida no limite: top-1 = 70,0%** (HÃ­brido + LLM, dataset v2), com 88,7% de acerto de capÃ­tulo. Ressalva: a revisÃ£o dos rÃ³tulos foi feita por IA, sem ver as previsÃµes, e ainda aguarda validaÃ§Ã£o por um profissional habilitado.
- **O LLM quase triplica o acerto do BM25** (26,3% â†’ 70,0%).
- **A recuperaÃ§Ã£o continua sendo o teto.** O cÃ³digo certo estÃ¡ entre os 20 candidatos em 77,3% dos produtos; o Haiku acerta 70,0%, ou seja, aproveita 91% do que Ã© possÃ­vel. O prÃ³ximo ganho vem da busca (embedding de produÃ§Ã£o, sinÃ´nimos comerciais), nÃ£o do LLM.
- **Trocar o embedding foi a melhoria mais barata** (sem custo de API). ComparaÃ§Ã£o dos quatro modelos locais no dataset v2, em % de produtos cujo cÃ³digo certo estÃ¡ entre os k primeiros candidatos:

  | Modelo | Dim. | Tempo p/ indexar 10,5k NCMs | Vetorial k=10 | Vetorial k=20 | **HÃ­brido k=20** |
  |---|---|---|---|---|---|
  | multilingual-e5-small | 384 | â‰ˆ 15 min | 40,7% | 49,7% | 69,0% |
  | multilingual-e5-base | 768 | â‰ˆ 30 min | 41,7% | 51,3% | 69,3% |
  | multilingual-e5-large | 1024 | â‰ˆ 50 min | 45,7% | 55,3% | 73,3% |
  | **bge-m3** (padrÃ£o) | 1024 | â‰ˆ 30 min | **60,3%** | **67,7%** | **77,3%** |

  O bge-m3 vence em todos os k. O hÃ­brido reduz a diferenÃ§a entre os modelos, porque o BM25 compensa parte das falhas de vocabulÃ¡rio, mas nÃ£o a elimina. (Com o e5-large, ordenar os textos por tamanho antes de montar os lotes derrubou a indexaÃ§Ã£o de uma estimativa de ~10 h para ~50 min.)
- **A confianÃ§a do LLM separa bem certos de errados** (HÃ­brido + LLM, v2): com confianÃ§a â‰¥ 0,7 ele acerta 82% (209 de 255, cobrindo 85% dos produtos); com confianÃ§a < 0,7 acertou sÃ³ 1 de 45. Em produÃ§Ã£o isso permite aceitar automaticamente as sugestÃµes de alta confianÃ§a e mandar sÃ³ o restante para revisÃ£o humana.
- **Gemini, rodada 2, preservada para comparaÃ§Ã£o:** mesma metodologia com e5-small e k = 10 deu 54,7% de top-1 no dataset v1 (cache em `data/eval/cache-llm/gemini-3.5-flash-lite.json`).

## Arquitetura

```
apps/web (React)   apps/cli (commander)
        â””â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
         apps/api (Fastify + Zod)
                â”‚
      packages/core â”€â”€ ports & adapters
      â”œâ”€ ingest/    tabela Siscomex â†’ hierarquia â†’ descriÃ§Ã£o enriquecida â†’ embeddings (idempotente)
      â”œâ”€ pipeline/  normalizar â†’ embed â†’ buscar(k) â†’ rerank â†’ resposta (+ cache por hash)
      â”œâ”€ ports/     EmbeddingProvider Â· VectorStore Â· Reranker Â· ClassificacaoCache
      â”œâ”€ adapters/  voyage | local-transformers Â· pgvector | memÃ³ria | arquivo Â· claude | noop Â· postgres | memÃ³ria
      â””â”€ eval/      mÃ©tricas, BM25, RRF, relatÃ³rio, embeddings int8
                â”‚
     PostgreSQL + pgvector (HNSW parcial por modelo)      Claude API (tool use + prompt caching)
```

DecisÃµes principais:

- **Ports & Adapters**: `pipeline/` nÃ£o importa SDK de terceiros. Trocar Voyage por modelo local, ou pgvector por memÃ³ria, nÃ£o toca no classificador.
- **DescriÃ§Ã£o enriquecida**: cada NCM Ã© indexado com a cadeia completa (capÃ­tulo > posiÃ§Ã£o > subposiÃ§Ã£o > item). Sem isso, milhares de itens se chamariam sÃ³ "Outros".
- **Embeddings versionados por modelo**: a coluna `vector` nÃ£o tem dimensÃ£o fixa e cada modelo ganha um Ã­ndice HNSW parcial com cast (`voyage-3` = 1024, `e5-small` = 384). A ingestÃ£o pula cÃ³digos jÃ¡ indexados.
- **Rerank com structured output**: tool `escolher_ncm` com `strict: true`, validada de novo com Zod. `tool_choice: auto` porque modelos recentes rejeitam tool use forÃ§ado. Se o LLM inventa um cÃ³digo fora dos candidatos, o sistema usa a melhor alternativa vÃ¡lida com confianÃ§a reduzida. O system prompt (resumo das RGI) Ã© fixo e cacheado; produto e candidatos vÃªm depois do breakpoint. Refusal fallback (`fallbacks: "default"`) ativado.
- **Privacidade**: o Fastify nÃ£o loga o corpo das requisiÃ§Ãµes, e o reranker loga sÃ³ o motivo quando descarta uma resposta, nunca o prompt.

## Como rodar

Requisitos: Node 20+ e pnpm 9. Docker Ã© opcional (sÃ³ para o pgvector).

```bash
pnpm install
pnpm --filter @ncm-finder/core build
cp .env.example .env
```

**Sem banco e sem chaves (tudo offline):** a API e a CLI leem `data/ncm/*.json` e `data/embeddings/*.int8.bin`, que estÃ£o versionados.

```bash
pnpm --filter @ncm-finder/cli ncm classificar "tÃªnis de corrida masculino" --modo vetorial
pnpm --filter @ncm-finder/api start          # http://localhost:3333
pnpm --filter @ncm-finder/web dev            # http://localhost:5173 (proxy /api â†’ 3333)
```

**Com pgvector e Claude:**

```bash
docker compose up -d                         # postgres 16 + pgvector, schema em db/schema.sql
# .env: DATABASE_URL, VOYAGE_API_KEY (opcional), ANTHROPIC_API_KEY
pnpm ingest                                  # baixa a tabela do Siscomex e grava NCMs + embeddings
pnpm --filter @ncm-finder/cli ncm classificar "tÃªnis de corrida masculino"
```

### API

`POST /classificar?modo=vetorial|vetorial+llm&k=10`

```json
{ "descricao": "TÃªnis de corrida masculino", "marca": "Acme", "categoria": "CalÃ§ados" }
```

Resposta: `candidatos[]` (NCM, descriÃ§Ã£o completa e score), `escolha` (`ncm`, `confianca`, `justificativa`, `alternativas`) e `cache`. Erros padronizados: `400 ENTRADA_INVALIDA`, `422 LLM_INDISPONIVEL`, `500 ERRO_INTERNO`. `GET /health` informa o modelo de embedding, o reranker e o armazenamento em uso.

### CLI

```bash
ncm classificar "<descriÃ§Ã£o>" [--modo vetorial|vetorial+llm] [-k 10] [--marca X] [--categoria Y] [--json]
ncm avaliar data/eval/produtos-rotulados.csv [--modo vetorial]
ncm ingerir [--arquivo siscomex.json] [--referencia AAAA-MM-DD]
```

## AvaliaÃ§Ã£o

```bash
pnpm eval              # 300 produtos â†’ report/eval.md + report/eval-chart.svg (LLM se houver ANTHROPIC_API_KEY)
pnpm eval --sem-llm    # sem custo de API
pnpm eval:regressao    # 50 produtos, falha se top-5 < data/eval/limiares.json (roda no CI)

# Rodada 3 (Claude Haiku via Claude Code CLI, usa o plano do usuÃ¡rio; retoma do cache se parar por limite)
RERANKER=claude-cli CLAUDE_CLI_MODEL=haiku K_LLM=20 LLM_CONCORRENCIA=5 pnpm eval --hibrido-llm
```

O relatÃ³rio registra a versÃ£o da tabela NCM, o sha256 do dataset, os modelos e o k usados. A busca Ã© exata (cosseno em memÃ³ria), entÃ£o os resultados sÃ£o determinÃ­sticos. O dataset e seus critÃ©rios de rotulagem estÃ£o em [data/eval/README.md](data/eval/README.md). Os rÃ³tulos foram atribuÃ­dos com assistÃªncia de IA e validados contra a tabela, mas **ainda nÃ£o passaram por revisÃ£o de um profissional de classificaÃ§Ã£o fiscal**.

## Testes

```bash
pnpm test
```

- **core**: 108 testes, 99,8% de linhas cobertas. Cobrem ingestÃ£o, pipeline (vetorial e hÃ­brido), os trÃªs rerankers (Claude API, OpenAI-compatÃ­vel e Claude CLI) com chamadas simuladas, cache de respostas (incluindo um teste de regressÃ£o para escrita concorrente), mÃ©tricas, BM25, relatÃ³rio, evidÃªncias e container. A integraÃ§Ã£o com pgvector (5 testes) roda com `DATABASE_URL` (CI) ou Testcontainers e Ã© pulada sem Docker.
- **api** (7 testes, `inject()`), **cli** (6) e **web** (5, Testing Library).

## Estrutura

```
data/ncm/          tabela oficial bruta + NCMs enriquecidos (por data)
data/eval/         dataset rotulado, critÃ©rios, limiares de regressÃ£o
data/embeddings/   embeddings int8 (NCMs e consultas do dataset)
db/schema.sql      schema Postgres + pgvector
packages/core      domÃ­nio, ports, adapters, pipeline, ingestÃ£o, avaliaÃ§Ã£o
apps/api | cli | web
scripts/           ingest.ts, eval.ts
report/            eval.md + eval-chart.svg (commitados como evidÃªncia)
```

## PrÃ³ximos passos

1. Medir com `VOYAGE_API_KEY` (embedding de produÃ§Ã£o) para atacar o teto de recuperaÃ§Ã£o, hoje em 77% no top-20 (dataset v2).
2. Separar o efeito de cada variÃ¡vel da rodada 3: Haiku com os candidatos da rodada 2 e Gemini com os da rodada 3 (as respostas jÃ¡ em cache reduzem o custo).
3. Expor a confianÃ§a na API/UI com um limiar (0,7) para encaminhar Ã  revisÃ£o humana sÃ³ os casos incertos.
4. ValidaÃ§Ã£o da v2 dos rÃ³tulos por um despachante ou consultor tributÃ¡rio habilitado, em especial os 10 casos ambÃ­guos listados em `data/eval/revisao-rotulos-v2.md`.

Fora de escopo na v1: fine-tuning, CEST, exceÃ§Ãµes de TIPI, NCM por estado, multi-idioma.


## Licença

### Uso Pessoal
Este projeto é licenciado sob a **Licença MIT** para uso pessoal, educacional e não comercial.

### Uso Comercial
Se você deseja usar este projeto comercialmente, deve obter uma licença comercial do autor.

**Uso comercial inclui:**
- Incorporar em um produto comercial
- Oferecer como serviço
- Usar em atividades com fins lucrativos
- Implantação empresarial

**Para obter uma licença comercial:**
Email: ma.polli@hotmail.com
