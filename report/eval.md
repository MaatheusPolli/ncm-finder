# Relatório de avaliação — NCM Finder

Gerado em 2026-09-24 por `pnpm eval`.

![Top-1 e Top-5 por sistema](eval-chart.svg)

## Resultados

| Sistema | Top-1 | Top-5 | Top-10 | MRR | Capítulo certo (top-1) | Posição certa (top-1) | Latência p50 | p95 |
|---|---|---|---|---|---|---|---|---|
| BM25 | **25.0%** | **49.7%** | 56.0% | 0.349 | 51.3% | 40.7% | 0 ms | 1 ms |
| Vetorial | **16.0%** | **33.7%** | 40.3% | 0.231 | 44.3% | 30.7% | 10 ms | 16 ms |
| Híbrido (RRF) | **23.7%** | **46.0%** | 61.0% | 0.341 | 50.7% | 38.7% | 15 ms | 18 ms |
| Vetorial + LLM | — | — | — | — | — | — | — | — |

> **Vetorial + LLM não executado:** execução com --sem-llm.

Leitura das colunas:

- **Top-1**: o primeiro código sugerido é exatamente o NCM correto (8 dígitos).
- **Top-5 / Top-10**: o NCM correto aparece entre os 5 / 10 primeiros candidatos.
- **MRR**: média de 1/posição do código correto (0 se ausente do ranking).
- **Capítulo / Posição certa**: o top-1 acerta ao menos os 2 / 4 primeiros dígitos. Mede erros "perto" versus erros grosseiros.

## Reprodutibilidade

- Tabela NCM: Resolução Gecex nº 926/2026 (Vigente em 23/09/2026), vigência de referência 2026-09-23, 10.515 códigos de 8 dígitos.
- Dataset: `data/eval/produtos-rotulados.csv`: 300 produtos, 61 capítulos, sha256 `24a0b1f767b859d0`.
- Embeddings: `Xenova/multilingual-e5-small`. Candidatos por consulta: k = 10.
- LLM de rerank: não utilizado nesta execução.
- BM25: `wink-bm25-text-search` (k1 = 1,2; b = 0,75), campos descrição (peso 2) e descrição completa (peso 1).
- Busca exata por cosseno (sem aproximação do HNSW), então o resultado é determinístico.
- Latência medida no processo de avaliação: BM25 e busca vetorial em memória, com o embedding da consulta pré-calculado. A latência do LLM inclui a chamada à API.
- Embeddings quantizados em int8 (`data/embeddings/`) para versionamento. O erro de quantização é menor que 1% por componente.

## Acurácia por capítulo (BM25)

| Capítulo | n | Top-1 | Top-5 |
|---|---|---|---|
| 02 | 8 | 12.5% | 37.5% |
| 03 | 4 | 25.0% | 75.0% |
| 04 | 12 | 33.3% | 66.7% |
| 07 | 10 | 60.0% | 70.0% |
| 08 | 10 | 20.0% | 60.0% |
| 09 | 5 | 0.0% | 80.0% |
| 10 | 4 | 0.0% | 25.0% |
| 11 | 6 | 50.0% | 83.3% |
| 12 | 2 | 0.0% | 50.0% |
| 15 | 3 | 66.7% | 100.0% |
| 16 | 5 | 20.0% | 20.0% |
| 17 | 3 | 0.0% | 33.3% |
| 18 | 4 | 25.0% | 75.0% |
| 19 | 6 | 0.0% | 50.0% |
| 20 | 10 | 10.0% | 40.0% |
| 21 | 8 | 0.0% | 37.5% |
| 22 | 10 | 10.0% | 20.0% |
| 23 | 3 | 66.7% | 66.7% |
| 24 | 1 | 0.0% | 100.0% |
| 25 | 3 | 0.0% | 33.3% |
| 27 | 3 | 66.7% | 66.7% |
| 28 | 2 | 100.0% | 100.0% |
| 30 | 1 | 0.0% | 100.0% |
| 32 | 1 | 0.0% | 0.0% |
| 33 | 10 | 0.0% | 0.0% |
| 34 | 2 | 0.0% | 0.0% |
| 35 | 1 | 0.0% | 0.0% |
| 36 | 1 | 0.0% | 100.0% |
| 38 | 1 | 0.0% | 0.0% |
| 39 | 8 | 0.0% | 0.0% |
| 40 | 5 | 40.0% | 80.0% |
| 42 | 6 | 16.7% | 50.0% |
| 44 | 3 | 33.3% | 66.7% |
| 48 | 8 | 37.5% | 75.0% |
| 49 | 2 | 50.0% | 50.0% |
| 52 | 1 | 0.0% | 100.0% |
| 57 | 2 | 0.0% | 0.0% |
| 61 | 11 | 54.5% | 63.6% |
| 62 | 8 | 25.0% | 75.0% |
| 63 | 5 | 20.0% | 60.0% |
| 64 | 6 | 0.0% | 33.3% |
| 65 | 3 | 0.0% | 0.0% |
| 66 | 1 | 0.0% | 100.0% |
| 68 | 2 | 0.0% | 0.0% |
| 69 | 5 | 20.0% | 40.0% |
| 70 | 1 | 0.0% | 0.0% |
| 71 | 3 | 0.0% | 33.3% |
| 72 | 1 | 0.0% | 0.0% |
| 73 | 9 | 33.3% | 44.4% |
| 76 | 3 | 0.0% | 0.0% |
| 82 | 4 | 25.0% | 75.0% |
| 83 | 3 | 66.7% | 100.0% |
| 84 | 9 | 22.2% | 44.4% |
| 85 | 15 | 33.3% | 40.0% |
| 87 | 3 | 66.7% | 66.7% |
| 90 | 4 | 25.0% | 50.0% |
| 91 | 1 | 0.0% | 100.0% |
| 92 | 2 | 0.0% | 0.0% |
| 94 | 8 | 25.0% | 37.5% |
| 95 | 9 | 33.3% | 55.6% |
| 96 | 10 | 70.0% | 90.0% |

## Erros de top-1 (BM25, primeiros 15)

| Produto | Esperado | Sugerido | Posição do correto |
|---|---|---|---|
| Coxa e sobrecoxa de frango congelada pacote 1kg | 02071412 | 02071423 | 2 |
| Frango inteiro congelado sem miúdos | 02071220 | 03061710 | fora do top-k |
| Picanha bovina resfriada embalada a vácuo | 02013000 | 02061000 | fora do top-k |
| Carne moída bovina congelada 500g | 02023000 | 02062990 | 9 |
| Costelinha suína congelada temperada | 02032900 | 02064900 | 2 |
| Bacon em manta defumado | 02101200 | 63019000 | fora do top-k |
| Filé de tilápia congelado 800g | 03046100 | 03038952 | 2 |
| Atum sólido em óleo lata 170g | 16041410 | 23050000 | fora do top-k |
| Leite UHT integral caixa 1 litro | 04012010 | 04022910 | 4 |
| Leite em pó integral lata 400g | 04022110 | 04022910 | 2 |
| Manteiga com sal pote 200g | 04051000 | 18040000 | 2 |
| Queijo muçarela peça 500g | 04061010 | 04064000 | 5 |
| Ovos brancos de galinha caixa com 12 unidades | 04072100 | 17049010 | fora do top-k |
| Mel de abelha puro silvestre 500g | 04090000 | 01064100 | 8 |
| Batata inglesa fresca kg | 07019000 | 07011000 | 2 |
