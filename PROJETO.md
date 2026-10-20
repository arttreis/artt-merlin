# Merlin · como o sistema funciona (ponto de partida)

Mapa único para quem vai continuar o desenvolvimento. Não substitui os outros documentos —
aponta para eles e preenche o que ficou desatualizado. Levantado do código em 08/10/2026.

## Os documentos que já existem

| arquivo | para que serve |
| --- | --- |
| [README.md](README.md) | o produto: as páginas, o dia (a sobra), atalhos, onde ficam os dados |
| [VISAO.md](VISAO.md) | a fonte das **decisões** e princípios (uma pessoa por vez, só o dia tem minutos, o roxo) |
| [MIGRATION.md](MIGRATION.md) | HTML por string → Preact → React 19 + Vite; o **dicionário** PT→EN de nomes |
| [server/README.md](server/README.md) | o Worker: subir do zero, segredos, rotas, segurança do login |
| [src/shared/README.md](src/shared/README.md) | **como um módulo é feito**: esqueleto de página, `core.js`, `ui.jsx`, coleções |
| [docs/workflow.md](docs/workflow.md) | **como o trabalho é feito**: descoberta → tickets (issues) → ondas de agentes → PR → merge |
| [docs/arquitetura/c4.md](docs/arquitetura/c4.md) | os diagramas C4: contexto, contêineres e componentes |
| [CLAUDE.md](CLAUDE.md) | o ponto de entrada dos agentes |
| `server/wrangler.toml` | configuração comentada do deploy (domínio, D1, R2, `OWNER_EMAILS`) |

## Em uma frase

Um sistema pessoal de produtividade (dia, calendário, notas, clientes, funis, mapas, planilhas, apresentações,
financeiro, hábitos, planos…) que roda **inteiro no navegador** (`localStorage`) e sincroniza
por documento num **Cloudflare Worker + D1**, com login por código de 6 dígitos por e-mail e um
"conselheiro" via API da Anthropic. Cada e-mail autorizado ganha um Merlin isolado.

## Stack

- **Front:** React 19 + JSX, Vite 8. Sem roteador, sem state manager, sem CSS framework.
- **Back:** um Cloudflare Worker sem dependências (`server/worker.js`), D1 (SQLite), Resend
  (e-mail), R2 para anexos (bucket `merlin-files`), Anthropic (`MODEL` em `worker.js`).
- **Extensão:** `extension/` — Chrome MV3, "nota rápida" (`Alt+Shift+N`) → `POST /api/quick-note`.
- **Desktop:** `desktop/` — Tauri 2, uma casca que abre o site publicado: a janela inteira,
  o rastreador (`tracker.html`) sempre por cima, a bandeja e `Alt+Shift+M`. Ver
  [desktop/README.md](desktop/README.md).
- **Testes:** scripts Node puros, sem framework (`src/shared/test.mjs`, `board.test.mjs`,
  `content.test.mjs`, `finance.test.mjs`, `app-spec.test.mjs`, `hat.test.mjs`, `portrait.test.mjs`, `server/test.mjs`).

## Arquitetura em camadas

```
<pagina>.html (raiz)        casca: CSS da página inline, anti-flash do tema, <main id="app">
   └─ src/<pagina>.jsx      a tela (React). initPage("<id>") + mount(<Tela/>, "app")
        ├─ src/shared/ui.jsx     hooks (useCollection, useCloud…), Form/Dialog, a sidebar
        ├─ src/shared/core.js    DADOS, sem React: coleções, sessão, sync, datas, dinheiro
        └─ src/shared/*.js       regras puras: tasks, day, routine, board, mermaid, templates…
                 │  localStorage  merlin:<type>  (fonte de verdade local)
                 ▼
server/worker.js  /api/*  ──  D1: people, codes, days, docs, advice, usage, shares
                  resto   ──  server/site/ (saída do vite build)
```

**Regra de ouro:** página nova = `nome.html` na raiz + `src/nome.jsx`, e uma aba numa das seis
áreas de `SECTIONS` no `core.js` (saúde, trabalho, meu negócio, organização, finanças, inbox;
`docs/prd/o-menu-por-area.md`, `docs/prd/meu-negocio.md`) — página nova não ganha item próprio no menu nem no dock: o menu
do alto mostra as áreas com todas as abas, e o dock só as abas da área aberta. O `vite.config.js` acha
os pares sozinho; não há lista de rotas. Nunca escreva no `localStorage` direto — use
`collection()` / `useCollection()`.

## As páginas (ids do `initPage`)

| página | arquivo | observação |
| --- | --- | --- |
| porta | `index.html` + `landing.jsx` | a landing é HTML estático no `index.html`, com o CSS em `landing.css`, e um script no `<head>` decide antes da primeira pintura quem a vê. `landing.jsx` só acorda o que se mexe (a floresta, a janela de demonstração, a lista de espera) para quem está na porta. Ver `docs/prd/landing.md` |
| início | `index.jsx` | quem já entrou: o onboarding em conversa e depois só "Bom dia, {nome}. Como posso te ajudar hoje?" e o campo, sobre a floresta. Não há dock embaixo: a faixa do alto tem a marca, o botão "menu" (as áreas, `AreaMenu` no `ui.jsx`), a busca, o tema e quem está aqui. O campo segue a regra única (`routeLine`), lê com o Merlin o que ela não resolve (`capture`: tarefa, ideia, gasto ou entrada, hábito, sono, treino e refeição; o gasto ou a entrada traz `book`, e o cartão mostra o seletor "pessoal | empresa" pré-marcado com o que a leitura entendeu: o da empresa grava no caixa e avisa "✓ lançado no caixa · R$ 2.400 · Acme") e responde a pergunta no balão; "fechar o dia" e "revisar a semana/o mês" (`askIntent`, com ou sem o "?" no fim) abrem o fechamento (`closes`, `journal`) e a revisão (`reviews`) sem crédito; "o que falta hoje?", "e agora?" e "próxima" respondem no balão com o cartão da próxima coisa (`quests.js`, `quest-card.jsx`; em dia de treino, sem treino nem marca ainda, "treinar" entra em "agora" com "registrar treino", a única exceção entre os hábitos: D8 de `saude-completa.md`), também sem crédito, e o Merlin pede o mesmo cartão com `show:"quests"`. `index.html#next` (a aba "o que falta" do inbox) faz o mesmo que escrever essa frase: o início abre com a pergunta e o cartão no balão, tira o `#next` do endereço (recarregar não repete) e também reage ao hash mudando com o início aberto; no onboarding o hash é só descartado. A apresentação (`tour.jsx`, seis passos sobre a conversa, o menu e as áreas) abre uma vez aqui, depois do onboarding, pela marca `tour-areas` em `merlin:seen`, prende o foco do teclado nela enquanto está aberta (começa em "continuar", o Tab circula só entre os botões dela) e, ao fechar, devolve o foco ao campo; o perfil a revê e a esquece. Ver `docs/prd/a-secretaria.md` e `docs/prd/o-menu-por-area.md` |
| hoje (calendário) | `calendar.jsx` | a primeira tela: dia / semana / mês sobre **uma** coleção `tasks`, com hábitos e "como foi o dia" ao lado (`today-block.jsx`); `day.html` e `week.html` só redirecionam |
| diário | `journal.jsx` | aba de saúde: o histórico do "como foi o dia". A semana (`PeriodNav`) em sete cartões — hoje primeiro, depois os dias passados do mais novo ao mais velho, e os que ainda não chegaram no fim —, cada um com o texto editável ali (`journalWeek` em `journal-data.js`; dia que não chegou fica desabilitado). Grava na coleção `journal` (um documento por data, a mesma do Hoje) pelo gancho `journal-draft.js`, que o `today-block.jsx` também usa: 700ms parados, e o texto vai para o dia em que foi escrito. Sem "+": o dia é o "+". Apagar o texto de um dia avisa "nota do dia apagada · desfazer". A busca (`Ctrl+K`) leva a `journal.html#AAAA-MM-DD`, que abre na semana do dia com o cartão em foco. Nunca entra no retrato nem em chamada à IA. Ver `docs/prd/saude-completa.md` (D3) |
| sono | `sleep.jsx` | aba de saúde, entre hábitos e diário: a semana (`PeriodNav`) com uma barra por noite, de segunda a domingo, cada noite no dia em que se acordou, com o rótulo ("7h20") e a linha roxa da meta. Coleção `sleep` (um documento por noite, id = a data; `sleep-data.js`: `weekNights`, `weekAverage`, `sleepDoc`). O `+` e o toque numa barra abrem a caixa com o dia, as horas e, opcionais, deitou/acordou (com os dois, as horas saem da conta); registrar num dia que já tem noite substitui, e a caixa avisa. Apagar avisa "noite apagada · desfazer". Vazio, pergunta "quanto você dorme?" com as metas 7h, 7h30, 8h e sem meta, guardadas no perfil (`profile/me`, `sleepGoal`, em minutos; 0 é sem meta). O verbo: "dormi 7h" no início vira o kind `sleep` da captura (a regra manda "dormi" para a leitura, senão seria uma tarefa de 7h; sem sessão, a regra local reconhece o "dormi" e a linha vira nota, nunca tarefa), e na conversa a ação `sleep-log`; os dois confirmam "✓ registrado · 7h de sono", com "· noite de dd/mm" quando não é hoje. Ver `docs/prd/saude-completa.md` (D1, D2, D5) |
| treino | `training.jsx` | aba de saúde, entre sono e diário: a semana (`PeriodNav`) com uma linha por dia, de segunda a domingo, os treinos dele ("perna · 40 min", um dia pode ter vários) e a soma, e o total da semana no alto. Coleção `workouts` (um documento por treino, `{id, day, title, min}`; `workouts-data.js`: `weekWorkouts`, `weekTotal`, `logWorkout`, `applyWorkout`). O `+` e o `+` de cada dia abrem a caixa (`WorkoutForm`, em `shared/workout-form.jsx`, que o cartão do "o que falta hoje?" também abre, com hoje e os minutos do hábito) com o dia, o que treinou e os minutos; tocar num treino abre a mesma caixa para corrigir ou apagar ("treino apagado · desfazer"). Vazio, pergunta "que treino você faz?" com os modelos musculação 60, corrida 30, caminhada 40, bicicleta 45, yoga 30 e funcional 45, e escolher um abre a caixa preenchida para hoje. Registrar um treino novo marca, no mesmo dia, o hábito de treino (`trainingHabit`: o citado, ou o primeiro cujo nome começa com "trein"), sem criar hábito; o desfazer apaga o treino e tira só a marca que ele pôs. O verbo: "treinei perna 40min" no início vira o kind `workout` da captura (a regra manda "treinei", "corri", "fiz yoga"… para a leitura, senão seria uma tarefa de 40min; "treinei" sozinho continua hábito), e na conversa a ação `workout-log`; os três caminhos confirmam "✓ registrado · perna · 40 min · hábito treinar marcado", com "· dd/mm" no fim quando não é hoje. Ver `docs/prd/saude-completa.md` (D1, D2, D4, D5) |
| alimentação | `meals.jsx` | aba de saúde, entre treino e diário: a semana (`PeriodNav`) com uma linha por dia, de segunda a domingo, e as refeições dele na ordem do dia ("almoço · salada"; um dia pode ter várias). Coleção `meals` (um documento por refeição, `{id, day, meal, text}`, `meal` um de `breakfast`, `lunch`, `snack`, `dinner`; `meals-data.js`: `MEALS`, `weekMeals`, `mealDoc`, `mealLine`, `mealAt`). O `+` e o `+` de cada dia abrem a caixa com o dia, a refeição (sem ela, a da hora) e o que comeu; tocar numa refeição abre a mesma caixa para corrigir ou apagar ("refeição apagada · desfazer"). Vazio, pergunta "o que você come no dia?" com café da manhã, almoço, lanche e jantar, e escolher uma abre a caixa nela, para hoje. Sem culpa: nenhuma caloria, macro, nota ou cor de "bom ou ruim". O verbo: "almocei salada" no início vira o kind `meal` da captura, com a refeição num seletor no cartão (a IA escolhe pela hora quando a linha não diz, "comi uma maçã", e a pessoa troca ali), e na conversa a ação `meal-log`; os dois confirmam "✓ anotado · almoço · salada", com "· dd/mm" no fim quando não é hoje. O texto nunca vai ao retrato, que só conta as refeições. Ver `docs/prd/saude-completa.md` (D1, D2, D5, D6) |
| rotina | `routine.jsx` | semana-modelo sem datas; vira tarefas (`shared/routine.js`) |
| assistente | `assistant.jsx` | conversa com o Merlin, fora da barra (chega-se pelo `Ctrl+K`); respostas viram **propostas** confirmadas (`assistant-actions.js`). O Merlin aparece como o chapéu de `shared/hat.js` (`<Hat>` do `ui.jsx`): grande na abertura, ao lado do campo na conversa, mudando de humor com ela (VISAO, 12). Toda pergunta, daqui ou do início, leva o **retrato** (`portrait.js`, aberto por `use-portrait.js`): hoje, a agenda dos próximos 7 dias, a rotina, a semana, os leads e os clientes (parados, atrasados, sem registro, backlog com prazo; 500 caracteres), os produtos, os hábitos (hoje, o mês e a sequência pelas contas de `habits-data.js`, as mesmas da grade; 120 caracteres), a saúde (só números de 7 dias: a média e as noites do sono pelo `weekAverage` de `sleep-data.js`, os treinos e os minutos, quantas refeições; nunca o que se treinou, o texto da refeição nem o diário; 160 caracteres; some com `healthOff` no perfil), os títulos das notas recentes (nunca o corpo; 130 caracteres) e o conteúdo (a falta do ritmo de quem gravou um, as peças atrasadas e as dos próximos 7 dias, sem roteiro; 300 caracteres; `contentToday` em `content-script.js`) o dinheiro (só o livro pessoal: saldo, a confirmar, o que vence, categorias contra a meta, maiores saídas e fixos, com os ids para "paguei o aluguel" confirmar o previsto; dívidas e investimentos nunca; 900 caracteres; `financeToday` em `finance-data.js`) e o negócio (só números da empresa, uma linha por item: caixa hoje, fim do mês e fôlego, por `financeToday` e `cashMonth`; as metas do trimestre com o progresso, "meta: 10 clientes ativos 6/10", pelo `progressOf` de `plans-data.js`; até 3 processos que vencem na semana ou já venceram, "vence qui 22/10: emitir notas", pelo `pendingOn` e `dueBetween` de `ops-data.js`; e o time, só a contagem e o custo total, "time: 2 pessoas · R$ 5.000/mês", pelo `activeTeam` e `teamTotal` de `team-data.js`; nome, papel, custo de cada um e entregas nunca vão; 260 caracteres, cortados nesta ordem de sobrevivência: caixa, metas, operação, time, com "e mais N"; some quando nenhum dos quatro existe), montado na hora e nunca guardado; a agenda dos 7 dias tem 1.284 caracteres e a rotina 540; a resposta diz de onde tirou ("vi a agenda", "vi a saúde", "vi o negócio"); quando o Merlin responde `show:"quests"`, a frase vem seguida do cartão da próxima coisa (`quest-card.jsx`), como no início — só o último cartão da conversa é ao vivo, os de antes ficam como a linha de texto, e o `show` é guardado em `chats` (`SHOWS` em `assistant-actions.js`) |
| notas | `notes.jsx` | caixa de entrada (antiga "ideias") |
| prospecção | `prospecting.jsx` | quadro de leads; mesmo documento de cliente (`client-doc.js`) |
| clientes | `clients.jsx` | canais, backlog, cofre |
| conteúdo | `content.jsx` | quadro de peças com roteiro |
| funis | `funnels.jsx` | grafo de etapas |
| desenhos | `drawings.jsx` | a última aba do trabalho (era "mapas"): uma lista só, do mais recente ao mais antigo, de apresentações, mapas e planilhas, com filtro em pílulas (todos · apresentações · planilhas · mapas) guardado no endereço (`drawings.html#apresentações`, `#planilhas`, `#mapas`), miniatura, nome, tipo, produto ligado e data; apagar tem desfazer. Cada tipo é uma linha em `KINDS` (coleção, onde abre, onde começa, a medida e a miniatura). O "+" escolhe o tipo e manda para a página dele: `slides.html` (os modelos de apresentação), `sheets.html` (os modelos de planilha) ou `maps.html#novo` (os modelos de mapa). Vazia, oferece os modelos de planilha (`SheetStart`); no filtro "apresentações", os de apresentação (`DeckStart`). Ver `docs/prd/desenhos.md` (D1) |
| mapas | `maps.jsx` + `maps-board.jsx` | mapa mental + quadro livre (estilo Miro, `board.js`). Sem aba própria desde o #90: acende "desenhos" (`initPage("drawings")`), o voltar leva a `drawings.html#mapas` e `maps.html#id` continua abrindo o mapa; a lista antiga ainda existe em `maps.html` sem hash |
| planilhas | `sheets.jsx` | o editor de uma planilha (`sheets.html#id`; sem id, a tela de começar com os modelos precificação, custo do produto, MRR em 12 meses e ponto de equilíbrio, de `shared/sheet-start.jsx`). Coleção `sheets` (`{id, name, app, cols: [{id, name, type}], rows: [{id, cells: {colId: texto}}], createdAt, updatedAt}`; o calculado não é gravado). A conta mora em `shared/sheet.js`, puro e com teste: `normalizeSheet` (teto 200 × 26), `evaluateSheet` (referências, intervalos, `+ - * /`, `%`, `SOMA`/`MÉDIA`/`MÍN`/`MÁX`; ciclo é `#ciclo`, o resto `#erro`, nunca exceção), `toCSV` (BOM, `;`, vírgula decimal) e `insertRow`/`removeRow`/`insertCol`/`removeCol`, que reescrevem as fórmulas como o Excel. A grade é uma `<table>` com `scope="col"`/`scope="row"`, o número da linha e a 1ª coluna presos; teclado de planilha (setas, `Enter`, `Tab`, `F2`, `Delete`), `Ctrl+Z`/`Ctrl+Shift+Z`, e apagar linha, coluna ou planilha com desfazer. Linha, coluna e tipo só a partir de 600px. No "mais": exportar CSV, o produto ligado e apagar. Nasce também na conversa ("faz uma planilha de…", a tarefa `build` com `kind: "sheet"`): `shared/build.js` mostra o rascunho calculado e o grava por `normalizeSheet`. Ver `docs/prd/desenhos.md` (D3, D5, D6) |
| apresentações | `slides.jsx` | o editor de uma apresentação (`slides.html#id`; sem id, a tela de começar com os modelos pitch do produto, lançamento, resultado do mês e proposta para cliente, de `shared/deck-start.jsx`). Coleção `decks` (`{id, name, app, slides: [{id, layout: "cover"\|"bullets"\|"number"\|"columns", title, body, items, left, right, number, caption, notes}], createdAt, updatedAt}`; todo slide guarda todos os campos, e trocar de layout não perde texto). A forma e as mexidas moram em `shared/deck.js`, puro e com teste: `normalizeDeck` (teto de 30 slides e 8 tópicos; layout desconhecido vira "bullets"; sempre ao menos um slide), `moveSlide`, `duplicateSlide`, `removeSlide`, `insertSlide`, `setLayout`, `updateSlide` e `DECK_TEMPLATES`/`buildDeck`. Um só `<Slide>` 16:9, com o texto em unidades do slide (container queries), serve ao editor, às miniaturas, à tela cheia e à impressão. Texto editável no lugar, notas do apresentador, `Ctrl+Z` (digitar seguido no mesmo campo é um passo), apagar slide com "slide apagado · desfazer". Layout, reordenar, duplicar, apagar e "+ slide" só a partir de 600px. Tela cheia com setas, espaço e `Esc`, contador "3/8" e "slide 3 de 8" anunciado. No "mais": exportar PDF (`window.print()`, um slide por página pelo `@media print`), o produto ligado e apagar. Ver `docs/prd/desenhos.md` (D4, D5) |
| produtos | `apps.jsx` | o centro: visão geral (construir, distribuir, pensar) + projeto de app: conceito, banco, telas e fluxos (em caixas ou como wireframe navegável, com PNG) → SQL, mermaid, spec e prompt (`app-spec.js`) |
| financeiro | `finance.jsx` | o livro pessoal (`bookCollection(finance, "personal")`): mês, ano, painel 50/30/20. As contas (saldo, `buildMonth`, a confirmar, gasto por categoria, `financeToday`) moram em `shared/finance-data.js`, com teste. A caixa do lançamento (`EntryForm`) mora em `shared/entry-form.jsx`, porque o cartão do início a abre para o previsto que passou. O mês, os fixos e os ajustes moram em `shared/finance-views.jsx`, porque o caixa os usa |
| plano | `plans.jsx` | primeira aba de meu negócio: uma meta-norte no ano, uma no semestre e até três no trimestre (D4 de `docs/prd/meu-negocio.md`). O trimestre fica aberto, com `PeriodNav`; o ano e o semestre que o contêm são uma linha cada, em cima, com "+" para definir. Coleção `plans` (um documento por meta; `plans-data.js`: `periodOf`, `goalsOf`, `canAdd`, `progressOf`, `goalLine`, `goalDoc`). A meta escolhe a fonte e se mede sozinha: clientes ativos (`status: "active"`), faturamento do caixa (entradas pagas do livro da empresa no período), leads fechados (`wonAt` no período), produto lançado (sim ou não, um toque no chip) e pessoas no time (a coleção `team`, contada pelo `activeTeam` do `team-data.js`, como a aba do time); "à mão" é permitido e leva a marca "à mão". A barra tem `role="progressbar"` e o texto "6/10". Na terceira meta do trimestre o "+" some, com "três já é muito para um trimestre". Vazio (no trimestre atual ou futuro), pergunta "O que precisa ser verdade no fim do trimestre?" com os modelos de clientes, faturamento, lançamento e leads, e "escrever a minha". O verbo: "meta do tri: 10 clientes" na conversa vira a ação `goal-set`, que confirma "✓ meta do 4º tri · 10 clientes ativos (hoje 6)"; desfazer apaga. Mês e semana ficam com o calendário |
| caixa | `cash.jsx` | aba de meu negócio: o livro da empresa (`book: "business"` na coleção `finance`, `bookCollection` do `finance-data.js`). Quatro números no topo (entrou, saiu, sobra do mês e fôlego, `cashMonth` e `runway`, com o sinal no texto) e as abas mês, fixos e a receber, com as peças de `shared/finance-views.jsx`. Sem 50/30/20, cartão, dívidas nem investimentos. O vazio oferece os fixos de uma empresa pequena (`CASH_TEMPLATES` no `templates.js`). "recebi 2.400 da Acme na empresa" entra pela conversa: o `finance-entry` tem o seletor "pessoal \| empresa", pessoal na dúvida, e confirma "✓ lançado no caixa · R$ 2.400 · Acme" (`cashLine`). O financeiro, o campo do início e o "o que falta hoje?" só veem o livro pessoal; o retrato leva o pessoal em "dinheiro" e o da empresa em "negócio" (caixa hoje, fim do mês e fôlego), e "como está o caixa da empresa?" se responde por ele (e "como estou na meta?", pelas metas dele) |
| time | `team.jsx` | aba de meu negócio, depois do caixa: quem trabalha com você (sócio, funcionário, freela fixo), com o papel, o custo por mês e a última entrega, e no topo quantas pessoas e o custo total. Coleção `team` (um documento por pessoa, `{id, name, role, cost, since, next, deliveries:[{id, day, text}], archived, fixed}`, `cost` em centavos e `fixed` o id do fixo no caixa; `team-data.js`: `personDoc`, `addDelivery`, `findPerson` (pelo nome sem acento e sem caixa, ou pelo primeiro nome quando só uma pessoa o tem), `teamTotal`, `joinTeam`, `noteDelivery`). Tocar numa pessoa (`team.html#id`) abre as entregas, da mais nova para a mais antiga, o campo da próxima conversa e "anotar"; a caixa (`PersonForm`) cria e edita, e com custo traz "lançar como fixo no caixa" marcado, que grava um fixo de saída no livro da empresa (dia 5, categoria "Outros"), nunca no pessoal. "Saiu do time" arquiva com desfazer, mantém as entregas e tira a pessoa do total; o fixo não é apagado sozinho: a caixa oferece encerrá-lo. Vazio, "Quem trabalha com você" com os papéis dev, design, suporte, vendas e freela (`TEAM_TEMPLATES`). Os verbos, na conversa: "a Ana entra como designer, 3 mil" é `team-add` ("✓ no time · Ana · design · R$ 3.000/mês") e "a Ana entregou a landing" é `team-delivery` ("✓ anotado · Ana · landing"; sem ninguém com o nome, a caixa pede para escolher alguém do time ou criar), os dois com desfazer. Cadastro leve: sem horas, ponto, ranking nem avaliação, e nome e custo nunca vão ao retrato por nome. Ver `docs/prd/meu-negocio.md` (D5, D8) |
| operação | `ops.jsx` | aba de meu negócio, a última: os processos recorrentes da empresa (coleção `ops`, `shared/ops-data.js`), com frequência e dia ("emitir notas · todo dia 5"; o dia 31 num mês de 30 vence no último) e checklist opcional. Em cima, "esta semana" (`dueBetween` dos próximos 7 dias e o que venceu no período sem ser feito); embaixo, todos os processos. Marcar feito grava o dia no período (o mês, a semana ISO ou o ano), com desfazer. Operação é prazo, não tempo: não cria tarefa no calendário, e o que vence hoje (ou venceu no período) aparece no "o que falta hoje?" (fonte `op` no `quests.js`, com "feito" no cartão). O vazio diz isso e oferece os modelos fiscal, produto e cliente (`OPS_TEMPLATES`). Verbos da conversa: `op-add` ("todo dia 5 emito as notas") e `op-done` ("emiti as notas" → "✓ feito · emitir notas · outubro"; `findOp` acha o processo pelo que foi dito) |
| wishlist | `wishlist.jsx` | só encaminha para `finance.html` (a vitrine saiu em 19/10/2026); a coleção `wishlist` continua guardada, sem tela |
| hábitos | `habits.jsx` | grade do mês; a caixa de criar e editar (`HabitForm`) mora no `ui.jsx`, porque o início e a conversa também a abrem |
| perfil | `profile.jsx` | sessão, tema, ritmo, inventário e o interruptor "não mandar saúde ao Merlin" (`healthOff` no `profile/me`, sincroniza com o perfil): ligado, o retrato vai sem a seção saúde e os hábitos continuam |
| link público | `share.jsx` | leitura sem conta de mapa/funil |
| rastreador | `tracker.jsx` | a janela pequena do app de desktop; mesma conta do dia (`distribute` em `day.js`, `dayTasks` e `readLine` em `tasks.js`). O "agora" é o mesmo do cartão do início (`questsOf`): a sessão rodando ou o compromisso que está começando, e sem eles a primeira da fila. Começar e parar a sessão são `startSession`/`stopSession` (`focus.js`) |

## Dados e sincronização

- Cada coleção é `merlin:<type>` no `localStorage`, forma `{items, serverV, dirty}`.
- Cada `save()` carimba `v = Date.now()`; apagar grava túmulo `{id, deleted:true}`.
- Sobe para `POST /api/docs {type, id, v, doc}`; servidor recusa `v` menor com **409** e devolve
  a versão dele. **Última gravação vence por documento** — não há merge de campos.
- `merlin:who` guarda o dono do navegador; trocar de e-mail limpa tudo que começa com `merlin:`.
- Isolamento: toda tabela tem `person`, e nenhuma consulta cruza essa coluna (teste `13d`).

## API do Worker (`server/worker.js`)

`/api/code`, `/api/sign-in`, `/api/sign-out`, `/api/me`, `/api/days`, `/api/docs`,
`/api/merlin` (conselheiro, teto `ADVICE_PER_HOUR = 30` por pessoa), `/api/quick-note`
(extensão), `/api/files/:id` (R2), `/api/share` e `/api/shared/:token` (link público),
`/api/waitlist` (a lista de espera da landing, sem sessão).
Detalhes de cada uma no `server/README.md`.

## Rodar, testar e publicar

```bash
npm install && (cd server && npm install)
npm run dev                 # front em http://localhost:8765 (sem API)
npm test                    # testes do navegador (core, tasks, routine, board)

cd server
npx wrangler d1 execute artt-planner --local --file schema.sql   # uma vez
npm run dev                 # build + wrangler dev: front + API juntos
npm test                    # servidor + navegador
npm run deploy              # testes → build → wrangler deploy (nada sobe se falhar; o merge na main já faz isso)
```

`.dev.vars` em `server/` (ignorado pelo git): `RESEND_API_KEY=re_fake…` (código aparece no
log), `SESSION_SECRET=…`, e opcionalmente `ANTHROPIC_API_KEY`. `MERLIN_ONLY=notes,maps npm run
build` limita o build a algumas páginas.

## Convenções

- Identificadores, chaves, campos, rotas e classes em **inglês**; tela e comentários em
  **português** (dicionário no MIGRATION.md).
- Criar é sempre um botão "+" que abre `<Form>`; tela vazia **oferece** modelos (`EmptyStart`).
- Sem `React.StrictMode` (há efeitos que não podem rodar duas vezes).
- Lógica nova que dá para ser pura vai para `src/shared/*.js` com teste em `test.mjs`.
- Commits em português, descrevendo o efeito para quem usa.

## Estado atual e pontas soltas (08/10/2026)

- ✅ Testes: 172 + 78 (navegador) e 174 (servidor) passando.
- 🔧 Corrigido nesta análise: `src/shared/test.mjs` montava o caminho com `URL.pathname`, que
  vira `GL%20Suite` numa pasta com espaço — o teste quebrava e, com ele, o `npm run deploy`.
- ✅ R2 ligado em 08/10/2026: bucket `merlin-files` criado e binding `FILES` no `wrangler.toml`
  (vale no próximo deploy).
- ✅ Conselheiro em `claude-opus-5-5` (`MODEL` no worker).
- ✅ Token de destaque renomeado: `--green*`/`--on-green` → `--accent*`/`--on-accent`.
- ⚠️ Sync é "último vence por documento": edição offline simultânea em dois aparelhos perde um
  lado. Aceito por decisão, mas é o primeiro limite se o uso crescer.
- 🔧 Docs atualizadas nesta análise: tabela de páginas do README (rotina, diário, prospecção,
  conteúdo, link público), rotas que faltavam no `server/README.md`, e a menção à cópia
  manual para `site/` (hoje é o `vite build`) no README do servidor e no `wrangler.toml`.
- Arquivos grandes (>2000 linhas: `calendar.jsx`, `funnels.jsx`, `maps.jsx`) são os candidatos
  naturais a quebrar em módulos quando forem mexidos.
