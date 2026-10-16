# Relatório de avaliação — NCM Finder

Gerado em 2026-09-28 por `pnpm eval`.

![Top-1 e Top-5 por sistema](eval-chart.svg)

## Resultados

| Sistema | Top-1 | Top-5 | Top-10 | MRR | Capítulo certo (top-1) | Posição certa (top-1) | Latência p50 | p95 |
|---|---|---|---|---|---|---|---|---|
| BM25 | **26.3%** | **49.7%** | 57.0% | 0.360 | 50.7% | 40.3% | 1 ms | 3 ms |
| Vetorial | **24.7%** | **50.7%** | 60.3% | 0.357 | 59.0% | 43.0% | 37 ms | 57 ms |
| Híbrido (RRF) | **31.3%** | **59.3%** | 69.3% | 0.430 | 61.0% | 48.0% | 34 ms | 42 ms |
| Vetorial + LLM | **62.3%** | **66.3%** | 67.3% | 0.642 | 84.0% | 74.3% | 164 ms | 198 ms |
| Híbrido + LLM | **70.0%** | **73.7%** | 75.0% | 0.720 | 88.7% | 81.3% | 173 ms | 258 ms |

Leitura das colunas:

- **Top-1**: o primeiro código sugerido é exatamente o NCM correto (8 dígitos).
- **Top-5 / Top-10**: o NCM correto aparece entre os 5 / 10 primeiros candidatos.
- **MRR**: média de 1/posição do código correto (0 se ausente do ranking).
- **Capítulo / Posição certa**: o top-1 acerta ao menos os 2 / 4 primeiros dígitos. Mede erros "perto" versus erros grosseiros.

## Reprodutibilidade

- Tabela NCM: Resolução Gecex nº 926/2026 (Vigente em 23/09/2026), vigência de referência 2026-09-23, 10.515 códigos de 8 dígitos.
- Dataset: `data/eval/produtos-rotulados.csv`: 300 produtos, 61 capítulos, sha256 `0e77800341f1b3e2`.
- Embeddings: `Xenova/bge-m3`. Candidatos por consulta: k = 10.
- LLM de rerank: `claude-cli/haiku`.
- BM25: `wink-bm25-text-search` (k1 = 1,2; b = 0,75), campos descrição (peso 2) e descrição completa (peso 1).
- Busca exata por cosseno (sem aproximação do HNSW), então o resultado é determinístico.
- Candidatos enviados ao LLM por produto: k = 20. Nos sistemas com LLM, o top-10 conta os 10 primeiros do ranking final (escolha do LLM + candidatos restantes na ordem da busca).
- Vetorial + LLM: 0 de 300 produtos sem escolha válida do LLM (0 por erro de API); nesses, vale a ordem dos candidatos. 300 respostas vieram do cache em disco (data/eval/cache-llm/) e 0 foram chamadas novas.
- Híbrido + LLM: 2 de 300 produtos sem escolha válida do LLM (1 por erro de API); nesses, vale a ordem dos candidatos. 299 respostas vieram do cache em disco (data/eval/cache-llm/) e 0 foram chamadas novas.
- Latência medida no processo de avaliação: BM25 e busca vetorial em memória, com o embedding da consulta pré-calculado. Nos sistemas com LLM, respostas vindas do cache em disco não incluem o tempo da chamada ao modelo.
- Embeddings quantizados em int8 (`data/embeddings/`) para versionamento. O erro de quantização é menor que 1% por componente.

## Exemplo de justificativa do LLM

**Produto:** Coxa e sobrecoxa de frango congelada pacote 1kg  
**Escolha:** 02071412 — Coxas com sobrecoxas

> Carne de frango (Gallus domesticus) congelada em forma de coxa com sobrecoxa. A descrição comercial padrão refere-se à forma com osso (não desossada). Posição 0207.14.12 é a mais específica para pedaços não desossados nesta configuração. Aplicadas RGI 1 e RGI 3a.

## Acurácia por capítulo (Híbrido + LLM)

| Capítulo | n | Top-1 | Top-5 |
|---|---|---|---|
| 02 | 7 | 57.1% | 57.1% |
| 03 | 4 | 100.0% | 100.0% |
| 04 | 12 | 83.3% | 100.0% |
| 07 | 10 | 90.0% | 90.0% |
| 08 | 9 | 88.9% | 88.9% |
| 09 | 5 | 100.0% | 100.0% |
| 10 | 3 | 66.7% | 66.7% |
| 11 | 6 | 50.0% | 66.7% |
| 12 | 2 | 100.0% | 100.0% |
| 15 | 3 | 100.0% | 100.0% |
| 16 | 6 | 16.7% | 16.7% |
| 17 | 3 | 66.7% | 66.7% |
| 18 | 4 | 100.0% | 100.0% |
| 19 | 6 | 83.3% | 83.3% |
| 20 | 12 | 75.0% | 75.0% |
| 21 | 8 | 62.5% | 75.0% |
| 22 | 10 | 50.0% | 60.0% |
| 23 | 3 | 66.7% | 66.7% |
| 24 | 1 | 0.0% | 0.0% |
| 25 | 3 | 100.0% | 100.0% |
| 27 | 3 | 66.7% | 66.7% |
| 28 | 2 | 100.0% | 100.0% |
| 30 | 1 | 100.0% | 100.0% |
| 32 | 1 | 0.0% | 0.0% |
| 33 | 10 | 50.0% | 50.0% |
| 34 | 2 | 100.0% | 100.0% |
| 35 | 1 | 0.0% | 100.0% |
| 36 | 1 | 100.0% | 100.0% |
| 38 | 1 | 0.0% | 0.0% |
| 39 | 8 | 25.0% | 25.0% |
| 40 | 5 | 80.0% | 80.0% |
| 42 | 6 | 66.7% | 66.7% |
| 44 | 3 | 100.0% | 100.0% |
| 48 | 8 | 75.0% | 87.5% |
| 49 | 2 | 100.0% | 100.0% |
| 52 | 1 | 100.0% | 100.0% |
| 57 | 2 | 0.0% | 0.0% |
| 61 | 11 | 90.9% | 90.9% |
| 62 | 8 | 100.0% | 100.0% |
| 63 | 5 | 60.0% | 60.0% |
| 64 | 6 | 33.3% | 50.0% |
| 65 | 3 | 0.0% | 0.0% |
| 66 | 1 | 0.0% | 0.0% |
| 68 | 2 | 0.0% | 0.0% |
| 69 | 5 | 80.0% | 80.0% |
| 70 | 1 | 100.0% | 100.0% |
| 71 | 3 | 66.7% | 66.7% |
| 72 | 1 | 0.0% | 0.0% |
| 73 | 9 | 77.8% | 77.8% |
| 76 | 3 | 0.0% | 0.0% |
| 82 | 4 | 100.0% | 100.0% |
| 83 | 3 | 100.0% | 100.0% |
| 84 | 9 | 66.7% | 77.8% |
| 85 | 15 | 66.7% | 66.7% |
| 87 | 3 | 100.0% | 100.0% |
| 90 | 4 | 100.0% | 100.0% |
| 91 | 1 | 0.0% | 100.0% |
| 92 | 2 | 100.0% | 100.0% |
| 94 | 8 | 37.5% | 50.0% |
| 95 | 9 | 77.8% | 77.8% |
| 96 | 10 | 100.0% | 100.0% |

## Erros de top-1 (Híbrido + LLM, primeiros 15)

| Produto | Esperado | Sugerido | Posição do correto |
|---|---|---|---|
| Frango inteiro congelado sem miúdos | 02071220 | 02075300 | fora do top-k |
| Costelinha suína congelada temperada | 16024900 | 02032900 | 12 |
| Bacon em manta defumado | 02101200 | 05119991 | fora do top-k |
| Atum sólido em óleo lata 170g | 16041410 | 03034600 | fora do top-k |
| Uva thompson verde sem semente bandeja 500g | 08061000 | 20096900 | fora do top-k |
| Castanha de caju torrada e salgada 200g | 20081900 | 08013200 | fora do top-k |
| Milho de pipoca pacote 500g | 10059010 | 10059090 | fora do top-k |
| Farinha de mandioca torrada 500g | 11062000 | 11081400 | fora do top-k |
| Salsicha tipo hot dog pacote 500g | 16010000 | 16023220 | fora do top-k |
| Linguiça calabresa defumada 400g | 16010000 | 02101900 | fora do top-k |
| Presunto cozido fatiado 200g | 16024100 | 07102900 | fora do top-k |
| Bala de goma sabor frutas 100g | 17049020 | 21069050 | fora do top-k |
| Biscoito recheado sabor chocolate 130g | 19053100 | 19059020 | 7 |
| Extrato de tomate lata 340g | 20029000 | 20095000 | fora do top-k |
| Caldo de galinha em tablete caixa 57g | 21041011 | 21041021 | 2 |
