# Dataset de avaliação — `produtos-rotulados.csv`

300 produtos de varejo com o NCM de 8 dígitos esperado, cobrindo 61 capítulos da nomenclatura.

## Formato

```
id,descricao,ncm
1,Filé de peito de frango congelado bandeja 1kg,02071422
```

- `descricao`: texto no estilo de cadastro de marketplace/ERP, com unidades e embalagem, **sem marcas**. A remoção de marca é testada à parte, no pipeline.
- `ncm`: 8 dígitos, sem pontos.

## Origem e critérios de rotulagem

- **Produtos**: descrições fictícias, escritas para representar itens comuns de supermercado, casa e construção, vestuário, eletroeletrônicos, automotivo e papelaria. Não há dados de clientes nem dados sensíveis.
- **Rótulos**: atribuídos com assistência de IA (Claude) aplicando as Regras Gerais de Interpretação do SH sobre a descrição do produto, com a tabela NCM vigente (Resolução Gecex nº 926/2026) como referência.
- **Validação automática**: todo código foi conferido contra a tabela vigente. Os 8 dígitos existem e são folha (item/subitem). Na primeira versão, 14 rótulos apontavam para códigos agrupadores ou inexistentes (por exemplo, `0207.14.00` em vez de `0207.14.22`, "peito desossado") e foram corrigidos descendo até a folha correta. O `pnpm eval` falha se algum rótulo sair da tabela vigente.
- **Revisão v2 (2026-09-28)**: revisão produto a produto contra a hierarquia completa e os códigos irmãos, aplicando RGI e NESH. **31 rótulos corrigidos (10,3%)** e 10 casos registrados como ambíguos. Motivos e tabelas em [revisao-rotulos-v2.md](revisao-rotulos-v2.md); a versão anterior está em [historico/produtos-rotulados-v1.csv](historico/produtos-rotulados-v1.csv).
- **Limitação conhecida**: as duas versões foram feitas com IA (Claude). A v2 segue o método de um classificador fiscal, mas **ainda não foi validada por um despachante ou consultor tributário habilitado**, e o revisor é da mesma família de modelos do reranker avaliado. Antes de usar as métricas como evidência externa, recomenda-se validação humana, registrada como uma nova versão do arquivo (o relatório e as evidências gravam o sha256 do dataset usado).

## Versões

| Versão | sha256 (8) | Mudança |
|---|---|---|
| v1 | `24a0b1f7` | Rotulagem inicial + correção de 14 códigos agrupadores. |
| v2 | `0e778003` | Revisão de 31 rótulos ([revisao-rotulos-v2.md](revisao-rotulos-v2.md)). |

## Subconjunto de regressão

`subconjuntoRegressao()` seleciona 1 a cada 6 linhas (50 produtos). O CI roda `pnpm eval:regressao` e falha se o top-5 de algum sistema cair abaixo de `limiares.json`.
