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

Um sistema pessoal de produtividade (dia, calendário, notas, clientes, funis, mapas,
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
| início | `index.jsx` | quem já entrou: o onboarding em conversa e depois só "Bom dia, {nome}. Como posso te ajudar hoje?" e o campo, sobre a floresta. Não há dock embaixo: a faixa do alto tem a marca, o botão "menu" (as áreas, `AreaMenu` no `ui.jsx`), a busca, o tema e quem está aqui. O campo segue a regra única (`routeLine`), lê com o Merlin o que ela não resolve (`capture`: tarefa, ideia, gasto ou entrada, hábito, sono, treino e refeição) e responde a pergunta no balão; "fechar o dia" e "revisar a semana/o mês" (`askIntent`, com ou sem o "?" no fim) abrem o fechamento (`closes`, `journal`) e a revisão (`reviews`) sem crédito; "o que falta hoje?", "e agora?" e "próxima" respondem no balão com o cartão da próxima coisa (`quests.js`, `quest-card.jsx`; em dia de treino, sem treino nem marca ainda, "treinar" entra em "agora" com "registrar treino", a única exceção entre os hábitos: D8 de `saude-completa.md`), também sem crédito, e o Merlin pede o mesmo cartão com `show:"quests"`. `index.html#next` (a aba "o que falta" do inbox) faz o mesmo que escrever essa frase: o início abre com a pergunta e o cartão no balão, tira o `#next` do endereço (recarregar não repete) e também reage ao hash mudando com o início aberto; no onboarding o hash é só descartado. A apresentação (`tour.jsx`, seis passos sobre a conversa, o menu e as áreas) abre uma vez aqui, depois do onboarding, pela marca `tour-areas` em `merlin:seen`, prende o foco do teclado nela enquanto está aberta (começa em "continuar", o Tab circula só entre os botões dela) e, ao fechar, devolve o foco ao campo; o perfil a revê e a esquece. Ver `docs/prd/a-secretaria.md` e `docs/prd/o-menu-por-area.md` |
| hoje (calendário) | `calendar.jsx` | a primeira tela: dia / semana / mês sobre **uma** coleção `tasks`, com hábitos e "como foi o dia" ao lado (`today-block.jsx`); `day.html`, `week.html` e `plans.html` só redirecionam |
| diário | `journal.jsx` | aba de saúde: o histórico do "como foi o dia". A semana (`PeriodNav`) em sete cartões — hoje primeiro, depois os dias passados do mais novo ao mais velho, e os que ainda não chegaram no fim —, cada um com o texto editável ali (`journalWeek` em `journal-data.js`; dia que não chegou fica desabilitado). Grava na coleção `journal` (um documento por data, a mesma do Hoje) pelo gancho `journal-draft.js`, que o `today-block.jsx` também usa: 700ms parados, e o texto vai para o dia em que foi escrito. Sem "+": o dia é o "+". Apagar o texto de um dia avisa "nota do dia apagada · desfazer". A busca (`Ctrl+K`) leva a `journal.html#AAAA-MM-DD`, que abre na semana do dia com o cartão em foco. Nunca entra no retrato nem em chamada à IA. Ver `docs/prd/saude-completa.md` (D3) |
| sono | `sleep.jsx` | aba de saúde, entre hábitos e diário: a semana (`PeriodNav`) com uma barra por noite, de segunda a domingo, cada noite no dia em que se acordou, com o rótulo ("7h20") e a linha roxa da meta. Coleção `sleep` (um documento por noite, id = a data; `sleep-data.js`: `weekNights`, `weekAverage`, `sleepDoc`). O `+` e o toque numa barra abrem a caixa com o dia, as horas e, opcionais, deitou/acordou (com os dois, as horas saem da conta); registrar num dia que já tem noite substitui, e a caixa avisa. Apagar avisa "noite apagada · desfazer". Vazio, pergunta "quanto você dorme?" com as metas 7h, 7h30, 8h e sem meta, guardadas no perfil (`profile/me`, `sleepGoal`, em minutos; 0 é sem meta). O verbo: "dormi 7h" no início vira o kind `sleep` da captura (a regra manda "dormi" para a leitura, senão seria uma tarefa de 7h; sem sessão, a regra local reconhece o "dormi" e a linha vira nota, nunca tarefa), e na conversa a ação `sleep-log`; os dois confirmam "✓ registrado · 7h de sono", com "· noite de dd/mm" quando não é hoje. Ver `docs/prd/saude-completa.md` (D1, D2, D5) |
| treino | `training.jsx` | aba de saúde, entre sono e diário: a semana (`PeriodNav`) com uma linha por dia, de segunda a domingo, os treinos dele ("perna · 40 min", um dia pode ter vários) e a soma, e o total da semana no alto. Coleção `workouts` (um documento por treino, `{id, day, title, min}`; `workouts-data.js`: `weekWorkouts`, `weekTotal`, `logWorkout`, `applyWorkout`). O `+` e o `+` de cada dia abrem a caixa (`WorkoutForm`, em `shared/workout-form.jsx`, que o cartão do "o que falta hoje?" também abre, com hoje e os minutos do hábito) com o dia, o que treinou e os minutos; tocar num treino abre a mesma caixa para corrigir ou apagar ("treino apagado · desfazer"). Vazio, pergunta "que treino você faz?" com os modelos musculação 60, corrida 30, caminhada 40, bicicleta 45, yoga 30 e funcional 45, e escolher um abre a caixa preenchida para hoje. Registrar um treino novo marca, no mesmo dia, o hábito de treino (`trainingHabit`: o citado, ou o primeiro cujo nome começa com "trein"), sem criar hábito; o desfazer apaga o treino e tira só a marca que ele pôs. O verbo: "treinei perna 40min" no início vira o kind `workout` da captura (a regra manda "treinei", "corri", "fiz yoga"… para a leitura, senão seria uma tarefa de 40min; "treinei" sozinho continua hábito), e na conversa a ação `workout-log`; os três caminhos confirmam "✓ registrado · perna · 40 min · hábito treinar marcado", com "· dd/mm" no fim quando não é hoje. Ver `docs/prd/saude-completa.md` (D1, D2, D4, D5) |
| alimentação | `meals.jsx` | aba de saúde, entre treino e diário: a semana (`PeriodNav`) com uma linha por dia, de segunda a domingo, e as refeições dele na ordem do dia ("almoço · salada"; um dia pode ter várias). Coleção `meals` (um documento por refeição, `{id, day, meal, text}`, `meal` um de `breakfast`, `lunch`, `snack`, `dinner`; `meals-data.js`: `MEALS`, `weekMeals`, `mealDoc`, `mealLine`, `mealAt`). O `+` e o `+` de cada dia abrem a caixa com o dia, a refeição (sem ela, a da hora) e o que comeu; tocar numa refeição abre a mesma caixa para corrigir ou apagar ("refeição apagada · desfazer"). Vazio, pergunta "o que você come no dia?" com café da manhã, almoço, lanche e jantar, e escolher uma abre a caixa nela, para hoje. Sem culpa: nenhuma caloria, macro, nota ou cor de "bom ou ruim". O verbo: "almocei salada" no início vira o kind `meal` da captura, com a refeição num seletor no cartão (a IA escolhe pela hora quando a linha não diz, "comi uma maçã", e a pessoa troca ali), e na conversa a ação `meal-log`; os dois confirmam "✓ anotado · almoço · salada", com "· dd/mm" no fim quando não é hoje. O texto nunca vai ao retrato, que só conta as refeições. Ver `docs/prd/saude-completa.md` (D1, D2, D5, D6) |
| rotina | `routine.jsx` | semana-modelo sem datas; vira tarefas (`shared/routine.js`) |
| assistente | `assistant.jsx` | conversa com o Merlin, fora da barra (chega-se pelo `Ctrl+K`); respostas viram **propostas** confirmadas (`assistant-actions.js`). O Merlin aparece como o chapéu de `shared/hat.js` (`<Hat>` do `ui.jsx`): grande na abertura, ao lado do campo na conversa, mudando de humor com ela (VISAO, 12). Toda pergunta, daqui ou do início, leva o **retrato** (`portrait.js`, aberto por `use-portrait.js`): hoje, a agenda dos próximos 7 dias, a rotina, a semana, os leads e os clientes (parados, atrasados, sem registro, backlog com prazo; 500 caracteres), os produtos, os hábitos (hoje, o mês e a sequência pelas contas de `habits-data.js`, as mesmas da grade; 120 caracteres), a saúde (só números de 7 dias: a média e as noites do sono pelo `weekAverage` de `sleep-data.js`, os treinos e os minutos, quantas refeições; nunca o que se treinou, o texto da refeição nem o diário; 160 caracteres; some com `healthOff` no perfil), os títulos das notas recentes (nunca o corpo; 130 caracteres) e o conteúdo (a falta do ritmo de quem gravou um, as peças atrasadas e as dos próximos 7 dias, sem roteiro; 300 caracteres; `contentToday` em `content-script.js`) o dinheiro (só o livro pessoal: saldo, a confirmar, o que vence, categorias contra a meta, maiores saídas e fixos, com os ids para "paguei o aluguel" confirmar o previsto; dívidas e investimentos nunca; 900 caracteres; `financeToday` em `finance-data.js`) e o negócio (só o livro da empresa, e só números: caixa hoje, fim do mês e fôlego, por `financeToday` e `cashMonth`; 260 caracteres; some sem caixa da empresa), montado na hora e nunca guardado; a agenda dos 7 dias tem 1.284 caracteres e a rotina 540; a resposta diz de onde tirou ("vi a agenda", "vi a saúde", "vi o negócio"); quando o Merlin responde `show:"quests"`, a frase vem seguida do cartão da próxima coisa (`quest-card.jsx`), como no início — só o último cartão da conversa é ao vivo, os de antes ficam como a linha de texto, e o `show` é guardado em `chats` (`SHOWS` em `assistant-actions.js`) |
| notas | `notes.jsx` | caixa de entrada (antiga "ideias") |
| prospecção | `prospecting.jsx` | quadro de leads; mesmo documento de cliente (`client-doc.js`) |
| clientes | `clients.jsx` | canais, backlog, cofre |
| conteúdo | `content.jsx` | quadro de peças com roteiro |
| funis | `funnels.jsx` | grafo de etapas |
| mapas | `maps.jsx` + `maps-board.jsx` | mapa mental + quadro livre (estilo Miro, `board.js`) |
| produtos | `apps.jsx` | o centro: visão geral (construir, distribuir, pensar) + projeto de app: conceito, banco, telas e fluxos → SQL, mermaid, spec e prompt (`app-spec.js`) |
| financeiro | `finance.jsx` | o livro pessoal (`bookCollection(finance, "personal")`): mês, ano, painel 50/30/20. As contas (saldo, `buildMonth`, a confirmar, gasto por categoria, `financeToday`) moram em `shared/finance-data.js`, com teste. A caixa do lançamento (`EntryForm`) mora em `shared/entry-form.jsx`, porque o cartão do início a abre para o previsto que passou. O mês, os fixos e os ajustes moram em `shared/finance-views.jsx`, porque o caixa os usa |
| caixa | `cash.jsx` | aba de meu negócio: o livro da empresa (`book: "business"` na coleção `finance`, `bookCollection` do `finance-data.js`). Quatro números no topo (entrou, saiu, sobra do mês e fôlego, `cashMonth` e `runway`, com o sinal no texto) e as abas mês, fixos e a receber, com as peças de `shared/finance-views.jsx`. Sem 50/30/20, cartão, dívidas nem investimentos. O vazio oferece os fixos de uma empresa pequena (`CASH_TEMPLATES` no `templates.js`). "recebi 2.400 da Acme na empresa" entra pela conversa: o `finance-entry` tem o seletor "pessoal \| empresa", pessoal na dúvida, e confirma "✓ lançado no caixa · R$ 2.400 · Acme" (`cashLine`). O financeiro, o campo do início e o "o que falta hoje?" só veem o livro pessoal; o retrato leva o pessoal em "dinheiro" e o da empresa em "negócio" (caixa hoje, fim do mês e fôlego), e "como está o caixa da empresa?" se responde por ele |
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
