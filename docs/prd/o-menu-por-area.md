# O menu por área · os módulos saem da frente da conversa

**Status:** ✅ No ar e testado. A descoberta foi feita pelo orquestrador em 2026-10-19, com
autonomia dada pelo Arthur. As decisões marcadas com **(orq.)** foram confirmadas pelo Arthur em
2026-10-20, depois do teste em produção e no iPhone. As marcadas com **(Arthur)** já vieram decididas.
Tickets publicados no milestone "o menu por área" (#36 a #39). As decisões viraram a seção 13 da
[VISAO](../../VISAO.md), com notas nas seções 2, 9.1, 9.2, 9.4 e 10.
**Owner:** Arthur Reis
**Criado em:** 2026-10-19
**Origem:** o desenho de 17/10 ("merlin deve agir como uma secretária"): o chat é a entrada, com
registro, consulta e conselho, e da consulta sai um **menu oculto** com as áreas da vida (saúde,
trabalho, organização, finanças, inbox). Este é o **projeto 2 de 2**. O projeto 1, a secretária
([a-secretaria.md](a-secretaria.md)), já está na `main`.

## Objetivo

O início é só a conversa, e o resto do Merlin fica guardado num menu que se abre quando a pessoa
quer, organizado pelas áreas da vida dela e não pelos tipos de dado. Nada novo é construído: é a
mesma casa, com os cômodos renomeados e a porta da frente limpa.

## Por que agora

A secretária deixou o início só com a conversa (D2 dela), mas a casca em volta continua sendo a
navegação da seção 9 da VISAO, que foi pensada para quando o calendário era a primeira tela:

- **O dock com as seis seções aparece no início**, embaixo da conversa, com o mesmo peso dela
  (`src/shared/ui.jsx:1410-1440`, desenhado em toda página menos o rastreador,
  `src/shared/ui.jsx:1488`). A conversa disputa a atenção com seis ícones.
- **As seções são por tipo de trabalho, não por área da vida** (`SECTIONS`,
  `src/shared/core.js:258-292`): hoje, ideias, produtos, distribuição, clientes, dinheiro. O
  desenho do Arthur pede saúde, trabalho, organização, finanças e inbox, que é como as gavetas
  futuras (sono, treino, alimentação, meu negócio) vão se encaixar.
- **A vitrine não tem lugar** na nova organização, e ainda entra em três lugares: uma aba de
  dinheiro (`src/shared/core.js:290`), duas fontes da busca (`src/shared/core.js:324-325`) e um
  tipo de proposta do chat (`server/worker.js:1002`, `1026`; `src/shared/assistant-actions.js:23`,
  `36`, `75`, `107`, `173`).
- **A apresentação descreve a barra que vai sumir** (`src/shared/tour.jsx:16-42`: "Em Ideias",
  "Em Produtos", "Na vitrine") e abre no calendário (`src/calendar.jsx:209-215`, `925`), que já
  não é a primeira tela.
- **Os textos ainda falam de "ideias"**, uma seção que deixa de existir: "guardado em ideias"
  (`src/index.jsx:358`, `441`, `462`, `690`; `src/shared/ui.jsx:1130`, `1172`, `1219`).

A contagem de 09/10 (VISAO §9) continua sendo o argumento: o que a conversa traz de volta vive, e
o que espera visita numa gaveta morre. Com o início sendo a conversa, a gaveta pode ficar fechada,
desde que se ache em um gesto.

## Para quem

O público da VISAO §8.1, mantido **(Arthur)**: pessoas sozinhas, principalmente devs, que
constroem o próprio SaaS e precisam distribuí-lo. Para elas, o teclado conta: o `Ctrl+K` tem que
levar a qualquer página pelo nome.

## Regras que não se quebram

- **Página nova não ganha item próprio na barra** (CLAUDE.md, VISAO §9.1). Vale para área: uma
  área nova é uma linha em `SECTIONS`, e não um componente.
- **Os endereços continuam os mesmos.** `finance.html` continua sendo o financeiro; nenhum
  favorito quebra. O único endereço que muda de destino é o da vitrine.
- **Os dados ficam** **(Arthur)**. Tirar a vitrine não apaga a coleção `wishlist`, nem no
  navegador nem no D1, como o diário e os planos (VISAO §9.3).
- **Uma pessoa por vez.** Nada aqui toca o servidor além de tirar um tipo do catálogo do chat. O
  teste `13d` continua valendo.
- **O "+" e o `Ctrl+K` continuam em toda tela** que não seja o início e o rastreador. No início,
  o próprio campo é esse gesto.
- **Sem lugar "em breve".** Uma gaveta que não existe não aparece no menu (VISAO, abertura: "o
  que não está, não existe ainda").

## Decisões

- **D1. As cinco áreas, nesta ordem (Arthur, a ordem é a do desenho):** saúde, trabalho,
  organização, finanças, inbox.

- **D2. Cada página atual vai para uma área assim (orq.):**

  | área | id | ícone | abas, na ordem (a primeira é a porta da área) |
  | --- | --- | --- | --- |
  | **saúde** | `health` | `habits` | hábitos |
  | **trabalho** | `work` | `apps` | produtos, conteúdo, funis, mapas |
  | **organização** | `organization` | `calendar` | calendário, rotina, notas |
  | **finanças** | `money` | `finance` | financeiro |
  | **inbox** | `inbox` | `inbox` (novo) | o que falta, leads, clientes |

  O porquê de cada escolha que não era óbvia no desenho:
  - **Produtos abre o trabalho**, porque o produto é o centro (VISAO §9.5). Conteúdo entra no
    trabalho **(Arthur)**. Mapas vão para o trabalho porque o desenho põe o mapa mental em
    "desenhos", dentro do trabalho.
  - **Calendário e notas ficam em organização.** O desenho põe tarefas e agenda tanto em
    organização quanto no inbox. Uma página só mora numa área (`sectionOf`), e o calendário é o
    lugar onde se **arruma** o tempo; o inbox fica com o lado de **fazer** dele, que é "o que
    falta" (D3).
  - **A rotina fica em organização, ao lado do calendário**, e não no inbox. No desenho, a seta
    "inbox → rotina → quests" lê-se como a rotina de cumprir o que falta, que é o cartão da
    próxima coisa; a página rotina é a semana-modelo, que só existe para virar tarefa no
    calendário (VISAO §4.11). *A revisar: se a leitura do Arthur era a página, ela muda de área
    numa linha.*
  - **Leads e clientes vão para o inbox**, porque o desenho põe o "crm" ali: são as pessoas que
    esperam uma resposta. O "crm" que aparece de novo dentro de "meu negócio → vendas" é gaveta
    futura e fica fora deste projeto. *A revisar: a alternativa é o trabalho, que ficaria com seis
    abas.*
  - **Os hábitos são a saúde inteira, por enquanto.** O diário, o treino, o sono e a alimentação
    do desenho não entram (fora de escopo, e o diário saiu em 09/10).

- **D3. A sessão de foco fica no inbox (Arthur), como a aba "o que falta" (orq.).** Não há página
  nova. A aba leva a `index.html#next`, e o início abre com a pergunta "o que falta hoje?" já
  feita e o cartão da próxima coisa respondido (`questsOf`, `QuestCard`), sem crédito, como se a
  pessoa tivesse escrito. É no cartão que a sessão de foco começa (D6 da secretária). Uma aba
  que leva a outra página não é um caso novo: as abas sempre foram links. O início não ganha a
  barra de abas do inbox por isso: ele não é uma página de área.

- **D4. O menu oculto (orq.).**
  - **Onde fica:** um botão "menu" na faixa do alto, logo depois da marca, **em toda tela e do
    mesmo jeito no desktop e no celular** (no celular, só o ícone). É o único caminho do início
    para uma área com o mouse ou o dedo. Ficar sempre no mesmo canto vale mais do que ficar
    perto do polegar: no início, o polegar já tem o campo.
  - **O que abre:** um painel com as cinco áreas e **todas as abas de cada uma de uma vez**, cada
    aba um link. Não há segundo nível: são 12 links, cabem numa olhada. A área e a aba de onde se
    está ficam marcadas (`aria-current`).
  - **Desktop (acima de 600px):** o painel desce do botão, preso ao canto esquerdo da faixa, com
    as áreas em colunas (uma grade que cabe em 640px).
  - **Celular (até 600px):** o painel ocupa a largura toda, logo abaixo da faixa, com as áreas em
    uma coluna e a rolagem dentro dele. Todo alvo de toque com 36px no mínimo (VISAO §2, "No
    celular").
  - **Fechar:** `Esc` (o foco volta ao botão), clicar fora, clicar no botão de novo ou escolher um
    link. Ao abrir, o foco vai para o primeiro link. Com movimento reduzido, abre sem animação.
  - **Não há atalho de teclado novo.** Quem usa o teclado tem o `Ctrl+K` (D6), que já é o campo de
    tudo. Um atalho a mais é uma coisa a mais para lembrar, e `Ctrl+M` muda o som da aba no
    Firefox.
  - **Durante o onboarding** o botão some, como a busca já some (`src/shared/shell.css:641`).

- **D5. O dock encolhe (orq.).**
  - **No início não há dock.** Só a faixa do alto (marca, menu, busca, tema, quem está aqui), a
    saudação e o campo.
  - **Nas outras telas** o dock fica com o **início**, as **abas da área** em que se está e o
    **"+"**. As seis seções saem dele. Trocar de área é pelo menu.
  - **Na conversa (`assistant.html`) e no perfil**, que não são de área nenhuma, o dock fica com
    o início e o "+".
  - O rastreador continua sem faixa e sem dock.

- **D6. O `Ctrl+K` vazio lista as páginas pela área (orq.).** No lugar de "ir para · seção", uma
  linha por aba: "ir para · finanças · financeiro", com o ícone da área. A busca por nome continua
  igual, menos a vitrine (D7).

- **D7. A vitrine sai (Arthur).**
  - `wishlist.html` passa a levar ao **financeiro** (`location.replace("finance.html")`), porque é
    para onde o "comprei" sempre desaguou. O `wishlist.jsx` vira o encaminhamento, como o
    `journal.jsx` e o `plans.jsx`.
  - A coleção `wishlist` fica, no navegador e no D1. Os lançamentos que vieram de uma compra
    (`origin:{type:"wishlist"}`) continuam no financeiro como qualquer outro.
  - Sai das duas fontes da busca e do catálogo do chat (`wishlist-item`, no Worker e no
    `assistant-actions.js`). Uma proposta antiga de `wishlist-item` guardada numa conversa responde
    "tipo de ação desconhecido" ao ser aberta, sem gravar nada.

- **D8. A apresentação é reescrita para as áreas e abre no início (orq.).**
  - Seis passos: (1) fale com o Merlin, (2) o que falta, uma coisa por vez, (3) o resto mora no
    menu, (4) só o dia tem minutos (organização), (5) do produto a quem usa (trabalho e inbox),
    (6) dinheiro e hábitos (finanças e saúde). O texto de cada um está no ticket.
  - Abre **uma vez no início**, depois do onboarding, e não mais no calendário.
  - **A chave muda** de `tour` para `tour-areas`, para quem já viu a antiga ver a nova uma vez: a
    navegação mudou inteira para as pessoas que já usam. O perfil passa a rever e esquecer a
    nova chave.

- **D9. Os textos (orq.).** "guardado em ideias" vira "guardado em notas", "vira ideia" vira
  "vira nota", e "abre sozinha no Hoje" vira "abre sozinha no início". O nome "inbox" fica como o
  Arthur escreveu, como "lead" ficou: é a palavra que esse público usa. O id `inbox` da área não
  tem relação com a fila `merlin:inbox` (VISAO §3); o comentário de `SECTIONS` diz isso. O #39 trocou
  os textos da apresentação e do aviso; o #52 fechou o resto do campo do início (o botão "guardar em
  notas", o placeholder, a dica, o rótulo do rascunho e a contagem de "notas criadas"), e o teste agora
  barra qualquer literal com "ideia" em `src/index.jsx`.

- **D10. Sem interruptor (orq.).** É navegação, sem dado novo e sem custo. Voltar atrás é
  reverter o PR e publicar. Os endereços não mudam, então quem se perder no menu ainda chega
  pelo `Ctrl+K` e pelos favoritos.

- **D11. A VISAO ganha a seção 13, "O menu por área"**, e as seções 2 ("Sidebar"), 9.1, 9.2, 9.4
  e 10 ganham uma nota apontando para ela, como a secretária fez na 10 **(orq.)**. Fica no
  último ticket, quando a casca já mudou. Feito no #39.

## Fora de escopo

- **Toda gaveta nova (Arthur):** sono, treino, alimentação, dashboard, meu negócio, planilha,
  apresentação (ppt), protótipos, o diário de volta, os resumos retroativo e projetivo do
  financeiro. Cada uma é uma descoberta própria e só entra com um verbo na conversa.
- As "quests" por área do desenho (finanças, saúde, trabalho dentro do inbox) e o "crm" como
  fonte do cartão da próxima coisa.
- Abrir uma página pela conversa ("abre o financeiro") e o Merlin responder com link para a
  área.
- Apagar ou exportar os dados da vitrine. Ficam guardados, sem tela.
- A landing (`index.html`, "seis seções, um dia", linhas 263 e 271) e a demonstração dela
  (`src/landing.jsx:93`, "guardado em ideias"): são do PRD da landing. *A revisar pelo Arthur:
  trocar por "cinco áreas, uma conversa" é uma linha.*
- Limpar o que sobrou da barra lateral (`toggleSidebar` e `merlin:sidebar` em
  `src/shared/core.js:224-228`, `296-301`, `386`; `html.sidebar-closed` em
  `src/calendar.css:546-555`; `--sidebar-w` em `src/apps.css:245` e `src/shared/shell.css:202`).
  Não muda nada na tela e mexe em CSS de páginas grandes.
- Atalho de teclado para o menu (D4).
- Medir cliques no menu. O Merlin não tem medição de navegação, e não vai ganhar por isso.

## Riscos e como saber se funcionou

- **Quem já usa se perde** (três pessoas e o time da Guessless, que aprenderam as seis seções
  em 09/10). A apresentação nova abre uma vez para todo mundo (D8), o `Ctrl+K` acha qualquer
  página pelo nome, e os endereços não mudam.
- **O menu escondido vira o "a dois cliques" de 09/10**, agora para os módulos. É o preço
  aceito: a conversa traz de volta o que importa no dia (o retrato e o cartão da próxima coisa
  da secretária), e é isso que mantém um módulo vivo, não o ícone no dock.
- **O mapeamento é discutível** em três pontos (rotina, leads e clientes, mapas). Cada mudança é
  uma linha em `SECTIONS`, sem migração.
- **Uma proposta antiga de vitrine** numa conversa guardada deixa de funcionar (D7). Ela mostra
  o erro e não grava.
- **Como saber:** pela contagem de documentos gravados por tipo por semana no D1, como a de
  09/10, nas duas semanas antes e nas duas depois do deploy. Se `tasks`, `finance`, `habits`,
  `clients` e `content` não caírem, o menu escondido não matou os módulos. Pela `usage`
  (secretária, D12), se as perguntas e os registros pela conversa sobem. A consulta, rodada pelo
  Arthur com `wrangler d1 execute`, é agregada e não cruza `person` na tela de ninguém:

  ```sql
  SELECT type, strftime('%Y-%W', v / 1000, 'unixepoch') AS week, COUNT(*) AS n
  FROM docs GROUP BY type, week ORDER BY week, type;
  ```

## Tickets

Publicados no milestone "o menu por área". O 01 a 04 dos rascunhos viraram as issues #36 a #39.

| # | título | pts | bloqueado por | onda |
| --- | --- | --- | --- | --- |
| #36 | Trocar as seis seções por cinco áreas num menu que se abre do alto | 5 | — | 1 |
| #37 | Tirar a vitrine, levando o endereço dela para o financeiro | 2 | — | 1 |
| #38 | Abrir o início já com "o que falta hoje?" respondido pela aba do inbox | 1 | — | 1 |
| #39 | Reescrever a apresentação para as cinco áreas, abri-la no início e trocar "ideias" por "notas" | 3 | #36, #37, #38 | 2 |

Os três da onda 1 mexem em trechos diferentes do `core.js` (o 01 em `SECTIONS`, o 02 em
`SEARCH_SOURCES`) e do `README.md` (o 01 no parágrafo de abertura, o 02 na linha da vitrine). O
02 não mexe em `SECTIONS`: a vitrine some da barra porque o 01 não a põe em área nenhuma. Se o
02 for mergeado antes, a aba "vitrine" do dock antigo leva ao financeiro até o 01 entrar.
