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
- **Limitação conhecida**: os rótulos **não foram revisados por um profissional de classificação fiscal**. Alguns casos admitem mais de uma leitura razoável, como material predominante e uso. Exemplos: `chuteira` (6402.19.00), `luminária pendente` (9405.11.90), `termômetro digital` (9025.19.90). Antes de usar as métricas como evidência externa, recomenda-se revisão humana, registrada como uma nova versão do arquivo (o relatório grava o sha256 do dataset usado).

## Subconjunto de regressão

`subconjuntoRegressao()` seleciona 1 a cada 6 linhas (50 produtos). O CI roda `pnpm eval:regressao` e falha se o top-5 de algum sistema cair abaixo de `limiares.json`.
