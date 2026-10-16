# Revisão dos rótulos — produtos-rotulados v1 → v2

Revisão feita em 2026-09-28 sobre os 300 produtos, com a tabela NCM vigente (Res. Gecex nº 926/2026). Para cada produto foram conferidos o código atribuído, a hierarquia completa (capítulo > posição > subposição > item > subitem) e todos os **códigos irmãos** da mesma posição, aplicando as Regras Gerais de Interpretação (RGI) e as Notas Explicativas do SH (NESH).

**Resultado: 31 rótulos corrigidos (10,3%)** e 10 casos mantidos, mas registrados como ambíguos por falta de informação na descrição.

> **Transparência:** esta revisão foi feita por IA (Claude) aplicando o método de um classificador fiscal. Ela não substitui a validação de um despachante ou consultor tributário habilitado, que continua recomendada antes de usar as métricas como evidência externa. Para evitar viés, a revisão foi feita **sem consultar as respostas dos modelos** avaliados, olhando só a descrição do produto e a tabela.

A versão anterior está em [`historico/produtos-rotulados-v1.csv`](historico/produtos-rotulados-v1.csv).

## Correções (31)

### Existia um subitem específico e o rótulo apontava para "Outros" (RGI 1 e 6: o texto mais específico prevalece)

| # | Produto | v1 | v2 | Motivo |
|---|---|---|---|---|
| 68 | Pão de forma tradicional | 1905.90.90 | **1905.90.10** | Há subitem próprio "Pão de forma". |
| 74 | Geleia de morango | 2007.99.90 | **2007.99.10** | Há subitem próprio "Geleias e marmelades". |
| 160 | Boné de algodão | 6505.00.90 | **6505.00.11** | Item 6505.00.1 "Bonés", subitem "De algodão". |
| 188 | Pia de cozinha de aço inox | 7324.90.00 | **7324.10.00** | Subposição própria "Pias e lavatórios, de aço inoxidável". |
| 178 | Telha cerâmica colonial | 6905.90.00 | **6905.10.00** | Subposição própria "Telhas". |
| 255 | Água de coco integral | 2009.89.90 | **2009.89.21** | Item próprio "Água de coco"; água de coco natural tem Brix ≈ 5 (≤ 7,4). |
| 279 | Parafusadeira a bateria | 8467.21.00 | **8467.29.92** | "Parafusadeiras e rosqueadeiras" têm subitem próprio; 8467.21 é para furadeiras. |
| 297 | Quebra-cabeça 500 peças | 9503.00.99 | **9503.00.70** | Subitem próprio "Quebra-cabeças (puzzles)". |
| 298 | Boneca de vinil | 9503.00.99 | **9503.00.22** | Item "Bonecos que representem somente seres humanos", sem mecanismo. |
| 300 | Carrinho de controle remoto | 9503.00.99 | **9503.00.97** | "Outros brinquedos, com motor elétrico". |

### Erro de característica do produto (natureza, matéria, capacidade ou uso)

| # | Produto | v1 | v2 | Motivo |
|---|---|---|---|---|
| 27 | Feijão carioca | 0713.33.19 | **0713.33.99** | 0713.33.1 é feijão **preto**; carioca fica em "Outros". |
| 63 | Achocolatado em pó | 1806.90.00 | **1806.10.00** | Cacau em pó **com adição de açúcar** tem subposição própria. |
| 75 | Suco de laranja integral | 2009.19.00 | **2009.12.00** | Não congelado, Brix ≈ 11 (≤ 20). |
| 95 | Cal hidratada | 2522.30.00 | **2522.20.00** | Cal hidratada = hidróxido de cálcio = **cal apagada**; 2522.30 é cal hidráulica. |
| 107 | Protetor solar FPS 50 | 3304.99.10 | **3304.99.90** | 3304.99.10 é para cremes de beleza/nutritivos e loções tônicas; protetor solar é "Outros". |
| 190 | Faca de cozinha inox | 8211.91.00 | **8211.92.10** | 8211.91 é faca **de mesa**; faca de cozinha é "Outras facas de lâmina fixa, para cozinha". |
| 201 | Máquina de lavar 12 kg | 8450.11.00 | **8450.20.20** | 8450.1 é para até 10 kg; 12 kg vai para 8450.20 (>10 kg), item "não superior a 18 kg". |
| 220 | Pastilha de freio | 8708.30.90 | **8708.30.19** | Pastilha é guarnição de freio **montada** (material de fricção sobre placa). |
| 227 | Teclado musical 61 teclas | 9207.10.10 | **9207.10.90** | Teclado arranjador doméstico não é sintetizador. |
| 232 | Guarda-roupa de MDF | 9403.60.00 | **9403.50.00** | Móvel de madeira **do tipo usado em quartos de dormir** (MDF conta como madeira no Cap. 94). |
| 246 | Salmão congelado em postas | 0304.81.00 | **0303.13.00** | Posta (corte transversal com osso) não é filé: fica em 03.03. O salmão de varejo no Brasil é *Salmo salar* (atlântico), não do Pacífico. |
| 274 | Lenço de viscose | 6214.30.00 | **6214.40.00** | Viscose é fibra **artificial**, não sintética. |
| 280 | Balança digital de cozinha | 8423.81.10 | **8423.81.90** | O subitem .10 exige dispositivo registrador/impressor de etiquetas. |
| 283 | Cadeira de madeira para cozinha | 9401.61.00 | **9401.69.00** | A descrição não indica estofamento. |
| 288 | Papel alumínio rolo | 7607.19.90 | **7607.11.90** | Folha doméstica é simplesmente laminada, sem suporte. |
| 295 | Cabide de plástico | 3926.40.00 | **3926.90.90** | 3926.40 é para estatuetas e objetos de ornamentação; cabide é "Outras". |

### Mudança de capítulo por preparo (Notas de capítulo e NESH)

| # | Produto | v1 | v2 | Motivo |
|---|---|---|---|---|
| 6 | Costelinha suína congelada **temperada** | 0203.29.00 | **1602.49.00** | Carne temperada sai do Cap. 2 (NESH, Considerações Gerais do Cap. 2) e vai para 16.02; costela não é perna nem pá. |
| 33 | Castanha de caju **torrada e salgada** | 0801.32.00 | **2008.19.00** | Castanha torrada e salgada é preparada: sai do Cap. 8 para 20.08. |

### Correções com ambiguidade residual

| # | Produto | v1 | v2 | Motivo |
|---|---|---|---|---|
| 162 | Lençol de algodão 200 fios | 6302.21.00 | **6302.31.00** | 6302.21 exige tecido **estampado**, o que a descrição não diz; o mais comum é o liso. |
| 249 | Farinha de milho flocada | 1102.20.00 | **1104.19.00** | O "flocão" é grão em flocos (11.04), não farinha (11.02). Há prática de mercado com 1102.20. |
| 253 | Pipoca de micro-ondas | 1005.90.10 | **2008.99.00** | O produto contém gordura e sal, então é milho preparado e não grão cru (10.05). Há divergência de prática (19.04 / 20.08). |

## Mantidos, mas ambíguos (descrição insuficiente)

| # | Produto | Rótulo | Ponto em aberto |
|---|---|---|---|
| 42 | Canela em pau | 0906.19.00 | Seria 0906.11.00 se fosse *Cinnamomum zeylanicum*; no varejo brasileiro predomina a cássia. |
| 100 | Água sanitária | 2828.90.11 | Pode ser 3808.94 se apresentada como desinfetante para venda a retalho; o mercado usa 2828.90.11. |
| 113 | Desodorante aerossol | 3307.20.10 | Líquido pressurizado; parte do mercado usa 3307.20.90. |
| 130 | Mochila escolar | 4202.92.00 | Pode ser discutida como "pasta escolar" (4202.1); a prática majoritária é 4202.92. |
| 134 | Porta de madeira maciça | 4418.29.00 | Seria 4418.21.00 se fosse de madeira tropical. |
| 228 | Sofá estofado | 9401.61.00 | Supõe armação de madeira; com armação metálica seria 9401.71. |
| 256 | Espumante brut | 2204.10.10 | "Tipo champanha" depende do método de elaboração. |
| 258 | Amaciante de roupas | 3809.91.90 | Há prática com 3402 (preparação tensoativa). |
| 270 | Tapete de algodão | 5705.00.00 | Se tecido plano, seria 5702.99.00. |
| 284 | Luminária pendente | 9405.11.90 | 9405.11 exige uso exclusivo com LED; sem essa informação seria 9405.19. |

## Padrões de erro encontrados na v1

1. **"Outros" usado quando existia subitem específico** (10 casos). É o erro mais comum de quem classifica pela descrição da posição sem descer até o último nível.
2. **Característica decisiva ignorada** (16 casos): cor do feijão, capacidade da máquina, fibra artificial × sintética, presença de açúcar, estofamento.
3. **Preparo que muda o capítulo** (2 casos): tempero e torra.

## Efeito na avaliação

Medido **depois** da revisão, cruzando com as evidências da rodada 3 (`report/evidencias/2026-09-28_claude-cli_haiku/predicoes.csv`). Nos 31 produtos corrigidos, o top-1 de cada sistema coincidia com:

| Sistema | Rótulo v1 (antigo) | Rótulo v2 (revisado) |
|---|---|---|
| BM25 | 2 | 6 |
| Híbrido + LLM (Haiku) | 2 | **19** |

O sistema com LLM já acertava 19 desses produtos, mas era penalizado pelo rótulo errado. Isso também mostra que ele acerta justamente nos erros típicos de quem classifica sem descer até o último nível.

**Ressalva de independência:** o revisor (Claude) e o reranker (Claude Haiku) são da mesma família de modelos, o que pode aproximar os critérios. Para reduzir esse risco, a revisão foi feita sem ver as previsões e com justificativa por RGI em cada caso. Mesmo assim, é mais um motivo para a validação humana recomendada acima.
