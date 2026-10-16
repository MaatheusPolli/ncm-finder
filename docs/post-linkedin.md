# Rascunho: post no LinkedIn

> Atualize os números depois de rodar `pnpm eval` com `ANTHROPIC_API_KEY` (linha "Vetorial + LLM") e anexe `report/eval-chart.svg` exportado como PNG.

---

Classificar um produto no NCM certo define o imposto que ele paga, e erro gera multa. A tabela tem 10.515 códigos, e metade deles se chama "Outros".

Construí o **NCM Finder** para testar uma hipótese da pós em IA: busca semântica + LLM classifica melhor do que busca por palavra-chave?

Antes de falar em acurácia, montei a régua:
📊 300 produtos rotulados, 61 capítulos, com os códigos validados contra a tabela vigente
📏 baseline honesto (BM25), métricas top-1/top-5/MRR e relatório gerado por script
🔁 teste de regressão de acurácia no CI

O primeiro resultado contrariou a hipótese: um modelo de embedding pequeno e local **perdeu** para o BM25 (top-5 de 34% contra 50%). Ele não liga "frango" a "*Gallus domesticus*". A busca híbrida (BM25 + vetorial) teve o melhor top-10 (61%), e isso importa porque o LLM só escolhe entre os candidatos que recebe.

Com o Claude como reranker (tool use com schema estrito e justificativa pelas Regras Gerais de Interpretação), o resultado foi: **[preencher: top-1 X% / top-5 Y%]**.

Exemplo de justificativa:
> [preencher com o exemplo de report/eval.md]

Lições:
1. Sem baseline, "usei embeddings" não diz nada.
2. O teto do RAG é o recall da recuperação, não o LLM.
3. Domínio (hierarquia fiscal, RGI) entra no prompt e no dado indexado, não só no modelo.

Código, dataset e relatório: [link do repositório]

#IA #RAG #LLM #Tributário #NCM #TypeScript
