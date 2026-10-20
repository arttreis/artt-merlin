# Desenhos · planilha, apresentação e protótipo no trabalho

**Status:** 🚧 Em execução. Descoberta feita pelo orquestrador em 2026-10-20, com autonomia dada
pelo Arthur. Decisões **(orq.)** ficam para revisão; as **(Arthur)** vieram dele.
**Owner:** Arthur Reis
**Criado em:** 2026-10-20
**Origem:** o desenho de 20/10: trabalho → desenhos → planilha, apresentação (mapa mental, ppt) e
planejamento (protótipos, funil). Vem depois do [meu negócio](meu-negocio.md).

## Objetivo

A pessoa pede na conversa "faz uma planilha de precificação do plano anual", "monta uma
apresentação do produto X em 6 slides" ou "desenha o protótipo do cadastro do app Y", e o Merlin
monta a partir do que já sabe dela (o app, o funil, o caixa, as metas). A página serve para ver,
ajustar e exportar. Não reconstruímos Excel, PowerPoint nem Figma.

## Por que agora

- **Mapa e funil já existem**, mas planilha e apresentação não (`src/shared/core.js:275-280`).
- **O projeto de app já tem telas e fluxos** (`src/shared/app-spec.js:85-129`), mas cada tela é
  uma caixa de texto (`src/apps.jsx:760-904`): falta ver a tela.
- O fluxo `build` (pergunta, rascunho, ajuste) já monta funil, app e mapa
  (`server/worker.js:1340-1368`, `src/shared/build-intent.js:6-33`); somar tipos é o caminho
  natural.

## Regras que não se quebram

- **A conversa monta; a página ajusta.** O editor só ganha controle de um clique; o resto é verbo.
- **Nada entra sem toque.** Rascunho é proposta com "criar"; ajuste pela conversa mostra antes e
  depois e é desfazível.
- **Uma aba só para tudo que é desenhado.** Nenhuma área nova.

## Decisões

- **D1. A aba "mapas" vira "desenhos" (Arthur).** `drawings.html` lista, do mais recente ao mais
  antigo, mapas, planilhas e apresentações, com filtro em pílulas (todos · apresentações ·
  planilhas · mapas), miniatura, nome, tipo, produto ligado e data. O "+" escolhe o tipo. O mapa
  abre no editor de hoje (`maps.html#id`, endereço e favoritos intactos). O funil continua com aba
  própria. Trabalho fica com produtos · conteúdo · funis · desenhos (4 abas, cabe em 390px).
- **D2. O protótipo mora no projeto de app (Arthur).** Cada tela vira um wireframe de baixa
  fidelidade gerado pelas linhas de `parts` por uma regra local e pura ("botão…" → botão,
  "lista…" → linhas, "campo/filtro…" → campo, resto → texto), sem IA. Um modo de navegar segue os
  `flows`. Exporta PNG da tela, e o wireframe vai junto no prompt do Claude Code. Não se edita o
  wireframe: edita-se `parts`.
- **D3. Planilha com fórmulas simples (Arthur).** Uma folha por arquivo, até ~200×26 células.
  Fórmula começa com `=`: referências, as quatro operações, `SOMA`, `MÉDIA`, `MÍN`, `MÁX` em
  intervalos. Ciclo vira `#ciclo`, erro vira `#erro`, nunca exceção. Colunas com tipo (texto,
  número, R$, data). Exporta CSV (UTF-8 com BOM e `;`, abre certo no Excel pt-BR). Sem gráfico,
  formatação, várias folhas, `.xlsx` ou ligação viva com o caixa. Coleção `sheets`.
- **D4. Apresentação de texto (orq.).** Slides 16:9 com 4 layouts fixos (capa, título + tópicos,
  número grande, duas colunas), texto editável no lugar, reordenar, duplicar, apagar, notas do
  apresentador, tela cheia com setas, PDF por `@media print` (um slide por página). Tema do Merlin.
  Sem posição livre, imagem, animação, tema ou `.pptx`. Coleção `decks`.
- **D5. Modelos na tela vazia (orq.).** Planilha: precificação, custo do produto, MRR em 12 meses,
  ponto de equilíbrio. Apresentação: pitch do produto, lançamento, resultado do mês, proposta para
  cliente.
- **D6. Verbos (orq.).** Tipos de `build` `sheet` e `deck`, e um pedido de protótipo que reabre o
  app com `mergeDraft` restrito a telas e fluxos. Confirmações: "✓ planilha pronta · 14 linhas ·
  5 colunas · abrir", "✓ apresentação pronta · 6 slides · abrir", "✓ protótipo pronto · 4 telas ·
  abrir". A apresentação usa o que o Merlin sabe (app-spec, funil e oferta ligados, metas do
  plano). Tetos: 3 a 12 slides; até 40 linhas e 10 colunas.
- **D7. Sem kill switch novo (orq.).** Tirar um tipo de `BUILD_KINDS` no worker desliga o verbo.
  Medição: `recordUsage` passa a anotar o tipo do `build`.
- **D8. Privacidade (orq.).** Documentos por `person` na tabela `docs`, sem consulta nova. O texto
  só vai à Anthropic quando a pessoa pede o rascunho.

## Fora de escopo

Área nova "desenhos"; `.xlsx` e `.pptx`; gráficos, formatação e várias folhas; planilha viva ligada
ao caixa; imagens e R2 nos slides; compartilhar planilha ou apresentação por link; animação e
temas; wireframe editável à mão, alta fidelidade e exportar para Figma; importar CSV; mudanças no
mapa e no funil.

## Riscos e como saber se funcionou

- **Virar Excel/PowerPoint aos poucos:** regra do "um clique" acima.
- **Quem procurava "mapas" no menu:** filtro "mapas" na aba e a busca `Ctrl+K` que já acha mapas.
- **PDF no Safari iOS:** o QA confere nos dois temas.
- **Funcionou se:** em produção, as três frases do objetivo geram um desenho que se abre pela linha
  "✓ … · abrir", o CSV abre no Excel com acentos e o PDF tem um slide por página.

## Tickets

Milestone "desenhos" (arttreis/merlin).

| issue | o que entrega | bloqueado por | pts |
| --- | --- | --- | --- |
| #90 | A aba "mapas" vira "desenhos", e as planilhas nascem nela com fórmulas e CSV | — | 5 |
| #92 | As apresentações entram em desenhos: slides de texto, tela cheia e PDF | #90 | 5 |
| #91 | O projeto de app mostra cada tela como wireframe e deixa navegar pelo fluxo | — | 3 |
| #93 | "faz uma planilha de…" monta a planilha na conversa (`sheet` em `BUILD_KINDS`, `build:<passo>:<tipo>`) | #90 | 3 |
| #94 | "monta uma apresentação do produto X" gera os slides com os dados do Merlin | #92, #93 | 3 |
| #95 | "desenha o protótipo do fluxo X do app Y" propõe as telas e as ações | #91, #94 | 3 |

Ondas: 1) #90 e #91 · 2) #92 e #93 · 3) #94 · 4) #95.
