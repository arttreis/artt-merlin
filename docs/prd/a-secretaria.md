# A secretária · a conversa vira o centro do Merlin

**Status:** 📝 Descoberta fechada em 2026-10-17. Tickets no milestone "a secretária".
**Owner:** Arthur Reis
**Criado em:** 2026-10-17
**Origem:** o desenho do novo fluxo de 17/10 ("merlin deve agir como uma secretária"): o chat é a
entrada, com três verbos (registro, consulta e conselho), e os módulos ficam num menu oculto por
área da vida. Este é o **projeto 1 de 2**. O projeto 2, "o menu por área", vem depois (ver o fim).

## Objetivo

Abrir o Merlin e falar com ele: "Bom dia, Arthur. Como posso te ajudar hoje?". Tudo o que a
pessoa precisa no dia passa pela conversa: anotar o que aconteceu (registro), perguntar sobre
qualquer área (consulta), pedir opinião (conselho) e saber o que fazer agora ("o que falta hoje?").
Não entra módulo novo. A conversa passa a funcionar sobre o que já existe.

## Por que agora

O início já é uma conversa desde 10/10 (VISAO §10), mas ainda não é uma secretária. Para
registrar um gasto ou saber o que tem na quinta, ainda é preciso abrir a gaveta certa:

- **A consulta só vê o dia de hoje.** O início manda ao Merlin a fila, o que foi feito, os
  hábitos e o foco da semana (`src/index.jsx:799`, `869`). O saldo só vai quando a conversa
  começa por "simular" ou sai do financeiro (`src/assistant.jsx:273`). O `pageContext` é cortado
  em 1.200 caracteres (`server/worker.js:1025`). "Continuar na conversa" abre o `assistant.html`
  sem contexto nenhum (`src/index.jsx:906`, `src/assistant.jsx:334-335`).
- **O registro não aceita gasto, entrada nem hábito.** O catálogo do chat tem oito tipos, e
  nenhum é esse (`server/worker.js:991-1000`). A leitura do início só devolve tarefa ou nota
  (`server/worker.js:1137`, `1154`). "gastei 45 no almoço" vira nota sem cartão para confirmar,
  porque uma ideia só é gravada direto (`src/index.jsx:362-364`).
- **A caixa de proposta grava sem desfazer** (`notify("feito")`, `src/shared/ui.jsx:940`), e a
  pílula continua clicável depois de confirmada (`src/assistant.jsx:380`, `src/index.jsx:902`):
  dá para lançar o mesmo gasto duas vezes.
- **O início não traz a rotina nem a caixa de entrada para o dia.** Só o calendário faz isso
  (`src/calendar.jsx:746`, `759`). E a sobra muda de tela para tela: o calendário tira as cópias
  da rotina da conta (`src/calendar.jsx:231-232`); o início e o rastreador contam essas cópias.
- **Uma coleção só desce da nuvem quando alguma página a abre** (`src/shared/core.js:516-518`).
  Num aparelho novo, um resumo das áreas sairia vazio.
- **As contas que a consulta precisa moram dentro das telas:** `pendingBefore` e o gasto por
  categoria (`src/finance.jsx:65`, `419-437`), `monthStats` e `streakOf` (`src/habits.jsx:81`,
  `109`), `isStale` (`src/clients.jsx:100`) e `lateOf` (`src/content.jsx:69`). `finance-data.js`,
  `habits-data.js` e `assistant-actions.js` não têm teste.

A contagem de 09/10 (VISAO §9) mostra o que está em jogo: o que é perguntado no fluxo continua
vivo, e o que espera visita numa gaveta morre (o diário e os planos ficaram com zero documentos).

## Para quem

O público da VISAO §8.1, mantido: principalmente devs sozinhos que constroem o próprio SaaS e
precisam distribuí-lo.

## Regras que não se quebram

- **Nada entra sozinho** (VISAO §4.8). Todo registro aparece num cartão para confirmar e tem
  desfazer.
- **Só o dia tem minutos** (VISAO §2). O que vem de fora do dia só entra nele pelo gesto de
  sempre, com a duração. Nada "rola sozinho" para hoje.
- **Sem cara de jogo** (VISAO §11). A palavra "quest" não aparece na tela; no código, pode.
- **Uma pessoa por vez.** O resumo das áreas é montado no navegador, a partir das coleções
  locais. O Worker não lê documentos para montá-lo (o teste `13d` continua valendo).
- **Uma verdade só.** A lista do "o que falta hoje?", o rastreador e a resposta do Merlin saem da
  mesma função.

## Decisões

- **D1. Dois projetos.** Este, a secretária, agora. O menu por área, depois.
- **D2. O início fica só com a conversa:** "Bom dia, {nome}. Como posso te ajudar hoje?" e o
  campo, sobre a floresta. Saem a pergunta que muda com a hora, a fala do Merlin (o `checkin`),
  a linha de dias seguidos e todos os blocos de baixo (o dia, hábitos, agenda, a semana, entregue
  hoje, revisões). O dia inteiro e os hábitos continuam no calendário. A saudação segue a hora
  (bom dia, boa tarde, boa noite).
- **D3. "o que falta hoje?" responde com a próxima coisa, uma por vez.** A resposta é um cartão
  na conversa: de onde veio, o que fazer, por que agora, o custo, as ações e o "a seguir" (só o
  título da próxima), com a contagem "faltam N · M feitas". A lista é montada no navegador
  (`src/shared/quests.js`), então responde na hora e não gasta crédito. A frase é reconhecida
  pela regra local; o Merlin também pode devolver o cartão quando a pergunta vem com outras
  palavras.
- **D4. A lista tem só dois grupos, nessa ordem:**
  1. **agora:** a sessão de foco rodando, ou um compromisso com hora que começa em até 30
     minutos ou já está em curso;
  2. **o que ficou para trás:** tarefas atrasadas (hoje com duração, outro dia ou largar) e
     contas previstas de dias passados (aconteceu? sim ou não). Mais de dois do mesmo tipo viram
     um item só, que abre a tela deles.

  "agora não" pula sem gravar. "amanhã" adia, com desfazer. A fila do dia, os hábitos, o que
  vence hoje e o conteúdo **não** entram na lista.
- **D5. Fechar o dia e a revisão se pedem na conversa** ("fechar o dia", "revisar a semana"),
  porque o botão da noite saiu do início. Abrem o fechamento (`Closing`, `src/index.jsx:434`) e a
  revisão de sempre. A sequência de dias fechados continua.
- **D6. O foco começa no cartão.** Começar e parar a sessão saem do `index.jsx` e do
  `tracker.jsx` para o `focus.js` (hoje estão duplicados em `src/index.jsx:529-542` e
  `src/tracker.jsx:148-160`). O "agora" do rastreador sai da mesma regra.
- **D7. O registro aceita gasto, entrada e hábito**, pelo campo do início (a leitura) e pela
  conversa (dois tipos novos no catálogo: `finance-entry` e `habit-mark`). Uma ação por turno na
  conversa; várias numa linha no campo ("gastei 45 no almoço e treinei" são dois itens).
  - Gasto de hoje ou de antes nasce **pago**; futuro nasce **previsto**. A categoria é uma das
    da config.
  - "paguei o aluguel" **confirma o previsto que já existe**, em vez de lançar outro. Fixo do
    mês lança com a origem no fixo.
  - Conta sem valor só se confirma pela caixa.
  - Hábito que existe: "marca hoje". Já marcado: sem ação. **Hábito que não existe:** o cartão
    oferece "criar e marcar", que abre a caixa de novo hábito preenchida.
  - Tudo tem desfazer. A caixa de proposta ganha desfazer em todos os tipos, e a pílula
    confirmada vira a linha "✓ lançado · …", que não abre de novo.
  - Os documentos criados pelo chat levam `origin:{type:"chat"}`.
- **D8. A consulta usa o retrato:** um resumo das áreas, montado no navegador e mandado junto
  com cada pergunta.
  - **Janela:** 30 dias para trás e 7 para frente.
  - **Vai:** hoje, a agenda dos próximos 7 dias, a rotina e a semana; o dinheiro (saldo, previsto,
    o que vence, gasto por categoria, fixos); os hábitos; leads e clientes (etapa, parados,
    prazos); o conteúdo (faltas e o que vem); os títulos das últimas notas e os nomes dos produtos.
  - **Nunca vai:** contatos, cofre, arquivos, contratos, diário do cliente, corpo das notas,
    roteiros, dívidas e investimentos.
  - Vai num campo novo, `context.portrait`, com teto de 6.000 caracteres no Worker. O
    `pageContext` continua com 1.200. Quem corta é o navegador, seção por seção. O retrato vai só
    com perguntas, nunca com a leitura, o check-in, a montagem ou as tarefas de conteúdo.
  - O retrato espera a primeira descida da nuvem (no máximo ~5s); a seção que não chegou diz
    "ainda carregando" em vez de "nada".
  - A resposta diz de onde tirou ("vi o financeiro e a agenda"), numa lista fechada que o Worker
    filtra. Quando falta dado, diz o que falta e oferece o gesto ("montar o financeiro").
- **D9. Interruptor geral:** o segredo `MERLIN_PORTRAIT_OFF` faz o Worker descartar o retrato,
  sem build.
- **D10. A privacidade fica para depois** (decisão do Arthur, 17/10). A página
  `public/privacidade.html` e o botão de desligar o retrato no perfil não entram neste projeto,
  apesar da regra do PRD da landing. Ficam como pendência registrada.
- **D11. Uma sobra só.** As cópias da rotina contam na sobra em todas as telas; o calendário só
  deixa de listá-las. O início passa a esvaziar a caixa de entrada e a copiar a rotina ao abrir,
  como o calendário.
- **D12. Medição numa tabela `usage`** (`person, day, task, n, tokens_in, tokens_out`), gravada
  no `advise()`, mais uma linha por pedido no `wrangler tail`. Sem rota de leitura.
- **D13. Conteúdo entra no retrato.** A vitrine sai, mas no projeto 2. A sessão de foco fica com
  a lista.
  - A seção do conteúdo tem 300 caracteres. A falta do ritmo só aparece para quem gravou um
    ritmo (o `me` sem ritmo gravado não é cobrado, ao contrário da tela). O roteiro nunca entra.

## Fora de escopo

- O menu por área, esconder o menu e tirar a vitrine (projeto 2).
- Módulo novo (sono, treino, alimentação, dashboard, meu negócio).
- Tool loop ou o Worker lendo documentos para a consulta.
- A página de privacidade e o botão de desligar o retrato (D10).
- Registrar sem sessão; fixo, parcela, dívida, investimento ou transferência pelo chat; editar
  ou apagar pelo chat.
- O Ctrl+K com leitura do Merlin.
- Notificações; os créditos de 5 horas (VISAO §8.3); cache de prompt.
- Concluir a tarefa puxada de um hábito marcar o hábito (VISAO §4.9, ainda não feito).

## Riscos e como saber se funcionou

- **Custo:** a pergunta fica 30% a 50% mais cara com o retrato. O D9 desliga para todos.
- **Inventar fora do retrato:** a instrução manda dizer "não sei" e o que falta.
- **Classificar errado** ("comprar pão 10 reais" virar gasto): o cartão, o "tirar", o "guardar
  como ideia" e o desfazer seguram.
- **Falso vazio** num aparelho novo: o D8 espera a nuvem.
- **Medir:** pela `usage`, perguntas e registros por tipo por dia; pelos documentos com
  `origin.type = "chat"`; e, no D1, dias fechados e atrasadas abertas, como na contagem de 09/10.

## Tickets

Issues no milestone "a secretária" (#4 a #15).

| # | título | pts | bloqueado por | onda |
| --- | --- | --- | --- | --- |
| #4 | Contar os pedidos ao Merlin por tarefa, com os tokens de cada um | 2 | — | 1 |
| #5 | Lançar gasto e entrada escrevendo no início ou pedindo na conversa | 3 | — | 1 |
| #6 | Mandar o retrato da semana junto de toda pergunta ao Merlin | 3 | — | 1 |
| #7 | Fazer o início trazer a rotina e a caixa de entrada, com a mesma sobra do calendário | 3 | — | 1 |
| #8 | Deixar o início só com a conversa, e fechar o dia e revisar pedindo | 3 | — | 1 |
| #9 | Responder "o que falta hoje?" com a próxima coisa, uma por vez | 3 | #8 | 2 |
| #10 | Marcar hábito pelo chat, e criar o que não existe | 3 | #5 | 2 |
| #11 | Pôr o dinheiro no retrato | 3 | #6 | 2 |
| #12 | Pôr clientes e leads no retrato | 2 | #6 | 2 |
| #13 | Pôr o conteúdo no retrato | 2 | #6 | 2 |
| #14 | Pôr hábitos e notas no retrato | 2 | #6 | 2 |
| #15 | Perguntar na lista se as contas previstas que passaram aconteceram | 2 | #9, #11 | 3 |

O #6 e o #9 criam os pontos de composição de uma linha (a lista de seções do `portrait.js` e a
lista de fontes do `quests.js`), para os tickets da onda 2 não brigarem no mesmo trecho.

## Projeto 2 · o menu por área (depois)

Trocar as seis seções por áreas da vida (saúde, trabalho, organização, finanças, inbox) e
esconder o menu atrás da conversa. A vitrine sai, como o diário e os planos saíram (o endereço
leva a outra tela, os dados ficam). Conteúdo entra em trabalho; a sessão de foco fica no inbox.
Cada gaveta nova (sono, treino, alimentação, dashboard, meu negócio) é uma descoberta própria e só
entra com um verbo na conversa: um jeito de registrar e um momento em que a secretária traz o
assunto de volta.
