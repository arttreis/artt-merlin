# src/shared/ · como um módulo do Merlin é feito

Cada módulo é **uma página**: um HTML na raiz (`notes.html`, `clients.html`…) com o CSS dela
inline, e um módulo `src/<nome>.jsx` com a tela, em **React 19 com JSX**. O HTML é a entrada do
Vite; o build sai em `server/site/`. O que é comum vive aqui:

- `base.css` — tokens dos dois temas (escuro no `:root`, claro em `html.light`), a sidebar
  (via `shell.css`), e os componentes: `.block`, `.pill`, `.chip`, `.badge`, `.input`,
  `.line`, `.table`, `.dialog`, `.notice`, `.meter`, `.bar`, `.tabs`, `.grid`/`.col-*`.
- `core.js` — os **dados**: tema, sidebar, sessão/nuvem, coleções sincronizadas, clientes,
  caixa de entrada do dia, aviso com desfazer, markdown e arquivos (R2). **JavaScript puro, sem
  React**: dá para testar sem navegador. Não desenha tela de módulo.
- `day.js` — a **conta do dia**: `budget(doc)`, `pendingOf`, `costOf`, `fmt`/`longFmt`/`clock`.
  Saiu de dentro do `day.jsx` quando o início passou a dizer quanto ainda cabe hoje: a sobra tem
  que ser a mesma nas duas telas, e duas cópias da mesma conta é como ela deixa de ser. Ele
  também era o dono do documento do dia até 09/09/2026; essa parte morreu quando o dia virou uma
  consulta por data. Sem React e sem pixel — entra `{tasks, start, end}`, sai um número.
- `tasks.js` — as **tarefas**: uma coleção só para o que tem data, e as três perguntas que as
  três visões do calendário fazem (`onDate`, `inRange`, `overdue`). É aqui que mora a junção do
  documento do dia com a coleção da semana (`mergeInto`, `migrateTasks`), que é função pura de
  propósito: ela é a decisão mais arriscada que este sistema já tomou, e dá para prová-la sem
  navegador.
- `icons.jsx` — os SVGs comuns como elementos React. `icon("plus")` devolve um deles.
- `ui.jsx` — a **tela**: hooks que ligam a página às coleções, componentes comuns e a
  **casca** (sidebar, busca, tema, nuvem, entrar, aviso). É o que uma página importa para
  desenhar. Ele se registra no core com `setShellRenderer`, e é por isso que `initPage(id)` —
  que vem do core — já monta a casca.
- `templates.js` — os **modelos**: o vocabulário de canal (tipos, rótulos e o checklist de
  cada um), 39 funis, 19 mapas, 9 tipos de negócio (cliente), 5 esqueletos de mês (financeiro)
  e 15 sugestões de hábito — com `buildFunnel`, `buildMap`, `buildClient` e `buildFinance`
  para virarem documento. Dado puro, sem React. Ver "Modelos", abaixo.
- `funnel-layout.js` — onde cada etapa do funil fica no palco (camadas da esquerda para a
  direita). Mora fora da página porque duas telas criam funil: a lista de funis e o canal do
  cliente.

Identificadores, chaves, campos e classes são em inglês; texto de tela e comentários, em
português. O dicionário completo está em [`MIGRATION.md`](../MIGRATION.md).

## Mudar uma coleção de nome

As ideias viraram **notas** em 08/09/2026, e o dado foi junto — o que é raro aqui: a decisão
14 da VISAO diz "sem migração dos dados gravados". O que fez valer a pena foi haver um jeito
de migrar sem janela de perda, e ele é o único motivo de `collection` ter duas portas de
baixo nível:

- `entries()` devolve os documentos **como estão gravados**, com o carimbo `v` e sem
  normalizar. Normalizar aqui jogaria o `v` fora.
- `adopt(list)` grava **sem carimbar**, e recusa o que não tiver carimbo maior.

O par existe porque dois aparelhos migram em momentos diferentes. Se a cópia usasse
`save()`, ela carimbaria `Date.now()` — e o aparelho que migrasse por último, carregando uma
cópia velha da nuvem, ganharia por ser a gravação mais recente. Preservando o `v`, o
servidor recusa a cópia velha sozinho, com a regra que ele já tem.

A migração roda **antes da primeira pintura** (`initPage`), e de novo depois que a nuvem
responde. A marca de "já migrou" só é posta quando a fonte está completa — com sessão, isso
é depois de a coleção antiga ter baixado.

## Tela vazia oferece (`EmptyStart`)

Clientes, financeiro e hábitos não dizem "nada aqui": mostram uma grade de modelos agrupados,
e escolher um já monta o documento. É um componente só porque era um problema só — a primeira
tela não ensinava nada. Recebe `groups` na mesma forma dos modelos de funil e mapa
(`[{ key, label, items: [{ id, name, summary, line }] }]`) e devolve o item inteiro no
`onPick`: quem oferece é quem sabe construir.

## Esqueleto de uma página

O HTML é só a casca: o CSS da página, o anti-flash do tema e o ponto de montagem.

```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0d0d0d">
<title>merlin · notas</title>
<link rel="icon" href="data:image/svg+xml,...">  <!-- copie o do index.html -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<script>/* anti-flash do tema: antes de qualquer pintura */
try{var t=localStorage.getItem("merlin:theme");if(t?t==="light":matchMedia("(prefers-color-scheme: light)").matches)document.documentElement.classList.add("light")}catch(e){}</script>
<style>/* só o que é desta página */</style>
</head>
<body>
<main class="page" id="app"></main>
<script type="module" src="/src/ideas.jsx"></script>
</body>
</html>
```

E `src/ideas.jsx` é a tela:

```jsx
import "./shared/base.css";                 // o dia importa "./shared/shell.css" no lugar
import { initPage, newId, today, notify, sendToDay } from "./shared/core.js";
import { useState } from "react";
import { mount, useCollection, useClients, useHash, useFields,
         Form, Field, Dialog, Markdown, ClientBadge,
         clientOptionList, icon } from "./shared/ui.jsx";

initPage("ideas");   // monta a casca, carrega os clientes, retoma a sessão

const normalize = (d) => ({ ...d, title: String(d.title || "") });

function Ideas() {
  const ideas = useCollection("ideas", { normalize });   // redesenha a cada mudança
  const [form, setForm] = useState(null);
  return (
    <>
      <div className="header">
        <div><h1>notas</h1><p className="sub">o que ainda não é tarefa</p></div>
        <div className="actions">
          <button className="pill pill--green" type="button" onClick={() => setForm({})}>{icon("plus")}ideia</button>
        </div>
      </div>
      {ideas.all().length
        ? <ul>{ideas.all().map((d) => <li key={d.id}>{d.title}</li>)}</ul>
        : <p className="empty">Nada aqui. O "+" abre uma ideia nova.</p>}
      {form && <IdeaForm ideas={ideas} onClose={() => setForm(null)} />}
    </>
  );
}
mount(<Ideas />, "app");
```

Os hooks do React vêm de `"react"`; só o que é do Merlin vem de `ui.jsx`. Nada de
`React.StrictMode`: ele roda os efeitos duas vezes, e há efeitos que não podem acontecer duas
vezes numa montagem (esvaziar a caixa de entrada, gerar a recorrência da semana).

## `core.js` — o que uma página importa

| o quê | para quê |
| --- | --- |
| `initPage(id)` | sidebar, clientes, preferências, sessão. `id` é `home, calendar, notes, clients, funnels, maps, finance, habits, plans, profile` |
| `collection(type, {normalize})` | fora de componente; dentro use `useCollection` |
| `newId()`, `today()`, `dayOf(date)`, `isDay(v)`, `dateOf(day)`, `addDays(day, n)`, `mondayOf(day)` | datas como `YYYY-MM-DD` |
| `dateLabel(day, withYear?)`, `weekdayOf(day)`, `monthLabel("YYYY-MM")` | rótulos |
| `brl(cents, sign?)`, `parseMoney(text)` | dinheiro em centavos |
| `formatMin(min)`, `parseDuration(text) → {min, title}` | duração no fim do texto |
| `parseMentions(text) → {client, title}` | `@cliente` no texto |
| `notify(text, undo?)` | aviso com desfazer |
| `sendToDay({title, min, client, origin:{type, id}})` | manda para o dia |
| `api(route, options) → {ok, status, body}` | fala com o worker |
| `md(text)` | markdown mínimo (use `<Markdown/>`) |
| `listClients()`, `clientName(id)`, `foldKey(text)` | leitura |
| `ICONS` | fonte dos ícones (use `icon("plus")`) |

## `ui.js` — hooks e componentes

| o quê | para quê |
| --- | --- |
| `mount(<Pagina />, "app")` | desenha a raiz dentro do elemento |
| `useCollection(type, {normalize})` | a coleção, redesenhando a cada mudança (local, nuvem, outra aba) |
| `useClients()` | a lista de clientes, redesenhando quando muda |
| `useCloud()` | `signedIn`, `email`, `status` |
| `useHash()` | o `#id` da URL, acompanhando o `hashchange` |
| `useKeydown(handler)` | atalho no documento; o handler é sempre o atual, sem deps. Use `isTyping()` para não disparar dentro de um campo |
| `setHash(id)` | troca o `#id` sem empilhar histórico, avisando o `useHash` |
| `useFields(initial)` → `[values, bind, set]` | formulário controlado: `<input {...bind("title")}/>`, checkbox com `bind("x", "check")` |
| `<Form title sub? wide? submit? remove? onSubmit onRemove? onClose>` | todo "criar X" e "editar X". `onSubmit(form)` devolvendo `false` mantém aberta |
| `<Field label full?>` | um campo com rótulo dentro do formulário |
| `<Dialog title wide? onClose actions?>` | caixa modal para o que não é formulário |
| `<Markdown text className? tag? …/>` | markdown mínimo do core; o único lugar com `innerHTML` |
| `<Meter label value className?>` | o número grande com legenda |
| `<MoneyInput value onChange/>` | dinheiro em centavos; só reformata ao sair do campo |
| `<NewItemRow placeholder button onAdd/>` | "novo item" no pé de uma lista, Enter adiciona |
| `useDelegate()` → `{ask, busy, answer, close}` | "dá pra fazer com Claude?": `ask({id, title, min?, due?, client?, about?, where, origin})` pergunta ao Merlin; `busy` é o id em análise |
| `<DelegateDialog answer onClose/>` | o veredicto, com o botão que manda o que há para montar à caixa de entrada do dia |
| `<ClientBadge id/>` | o selo do cliente |
| `clientOptionList("sem cliente")` | `<option>`s; o escolhido vai no `value` do `<select>` |
| `icon("plus")` | um ícone de `icons.jsx` como elemento. SVG só desta página vira um componente no topo do arquivo dela |

Ícones em `ICONS`: `trash, arrow, plus, check, pencil, link, grip, x, clock, map, spark,
archive, arrowLeft, chevronLeft, chevronRight, unfold`.

## Coleções (`collection(type, {normalize})`)

- `all()` → array de documentos vivos (sem os apagados).
- `get(id)`, `has(id)`.
- `save(doc)` → grava, carimba `v`, salva no localStorage, agenda subida, avisa. `doc.id` é
  obrigatório (use `newId()`). Devolve o doc gravado.
- `saveMany(docs)` → o mesmo, com um aviso só.
- `remove(id)` → grava um túmulo `{id, deleted:true}` e devolve o doc anterior (para desfazer
  com `save(before)`).
- `onChange(fn)` → chama `fn(origin)` a cada mudança. `useCollection` já assina por você.
- `pending()` → tem documento gravado aqui que ainda não subiu. Quem sai do navegador pergunta
  antes de apagar o que é local; nenhuma tela precisa disso.
- Nunca escreva no `localStorage` por conta própria. A chave `merlin:<type>` é do core.
- A coleção é uma só por tipo. Se o core já a abriu (ele abre `clients` em
  `initPage`), chamar `collection(type, {normalize})` de novo entrega o normalizador à
  coleção existente — a ordem das chamadas não importa.

Um documento é um objeto JSON plano. Coloque nele o que o módulo precisa, mas mantenha
**estes campos com estes nomes** quando fizerem sentido, porque outros módulos leem:

| campo | tipo | significado |
| --- | --- | --- |
| `id` | string | do `newId()` |
| `client` | string | id de um cliente (`listClients()`), ou `""` |
| `createdAt` | number | epoch ms |
| `updatedAt` | number | epoch ms |
| `deleted` | boolean | só o core escreve |

### Tipos de coleção e dono

| tipo | dono | forma mínima que outros módulos leem |
| --- | --- | --- |
| `clients` | clients.html | `{id, name, status, channels:[{id, type, name, items:[{id, text, done}]}], goals:[…], backlog:[…], journal:[…], contract:{…}, contacts:[…], links:[…], offers:[…]}` |
| `notes` | notes.html | `{id, title, body, stage, client, steps:[{id, text, done}], files:[{id, name, type, size}], outputs:[{type, id, at}], history:[{type:'stage'\|'step', …, at}]}` |
| `tasks` | calendar.html | `{id, title, date ('YYYY-MM-DD'), min, done, reserved, client, order, recurring, origin}` — o dia, a semana e o mês são três visões dela |
| `maps` | maps.html | `{id, name, root:{id, title, note, color, collapsed, children:[…]}, client, idea, funnel}` |
| `funnels` | funnels.html | `{id, name, client, channel, nodes:[{id, type, title, x, y, fields:{}, number}], edges:[{from, to}], creatives:[…], automations:[…], offers:[…], triggers:[…], snapshots:[…]}` |
| `finance` | finance.html | vários docs: `{id, type:'entry'|'fixed'|'card'|'debt'|'config', …}` (`card` é uma compra parcelada: `{name, card, total, installments, start:'YYYY-MM', dayOfMonth}`) |
| `vault` | clients.html | um doc `{id:'config', salt}` — só o sal do cofre; o segredo vai cifrado dentro do cliente |
| `habits` | habits.html | `{id, name, schedule:{type:'daily'|'perWeek'|'weekdays', times, weekdays:[0-6]}, min, color, order, archived, marks:{'YYYY-MM-DD':true}}` |
| `plans` | plans.html | um doc por período, id `kind:period`: `{id, kind:'quarter'|'month'|'week', period:'2026-Q4'|'2026-09'|'2026-W37', goals:[{id, text, client, done, parent, card, order}], review:{went, didnt, next}}` |

Ligações entre módulos são **por id**, nunca por cópia. Para abrir outra página num item:
`clients.html#<id>`, `maps.html#<id>`, `funnels.html#<id>`, `notes.html#<id>`. Cada
página lê o hash (`useHash()`) e abre o item, se existir. O calendário é a exceção: o hash dele
é uma visão (`#day`, `#week`, `#month`) ou uma data (`#2026-09-09`), porque o que se abre lá é
um período e não um documento.

## Criar é um botão e uma caixa

Todo "novo X" é um `<Form>` que só existe enquanto há estado para ele
(`form && <XForm …/>`). Dentro, `useFields` guarda os valores e `bind(name)`
espalha `value`/`onInput` nos campos. `onSubmit` lê os valores do estado, grava na coleção e
devolve `false` para manter a caixa aberta (reclamando com `notify`). `Esc`, o ✕,
"cancelar" e o clique fora fecham. Criar e editar são a mesma caixa.

Nenhuma tela tem formulário aberto no meio da lista, e nenhuma tela tem filtro.

## Modelos (`templates.js`)

Funil e mapa nascem em branco ou a partir de um modelo, escolhido num `<select>` dentro da
mesma caixa de criar — sem galeria, sem tela nova. Abaixo do select aparecem o resumo do
modelo (`.tpl-note`) e o caminho dele em uma linha (`.tpl-chain`), para escolher sem abrir
nada; escolher um modelo também batiza o item, quando o nome ainda está vazio.

Um modelo de funil declara as etapas e o fluxo:

```js
stages: { lp: ["lp", "página de captura"], form: ["capture", "formulário", { what: "e-mail" }] }
flow:   "lp>form 35"   // 35 = taxa média esperada, em %
```

A chave curta (`lp`, `form`) só existe no arquivo, para o `flow` apontar; `buildFunnel` troca
por id de verdade, devolve as arestas com a taxa média preenchida e liga ofertas, automações,
gatilhos e criativos às etapas. Quem chama roda `layoutNodes` (de `funnel-layout.js`) para as
etapas nascerem arrumadas. Um modelo de mapa é a árvore literal — `["galho", ["filho"]]` —, e
`buildMap` põe o nome digitado na raiz e dá uma cor a cada galho de primeiro nível.

Modelo é ponto de partida, não vínculo: depois de criado é um documento comum, e mexer nele
não mexe no modelo. Os funis de canal (dois por canal, no mínimo) têm `channel` preenchido —
por isso o funil criado a partir de um deles já nasce ligado ao canal do cliente, e o botão
"novo funil" dentro de um canal só oferece os modelos daquele canal.

## Mandar para o dia

`sendToDay({title, min, client, origin:{type, id}})`. Com `min`, vira tarefa na
fila de hoje **quando ele abrir**; sem `min`, vira nota na hora, ali mesmo — sem duração
aquilo não custa minuto nenhum, então nunca precisou tocar no dia. Nada mais
toca no documento do dia. O aviso já é mostrado pelo core.

## Regras de casa

- Português do Brasil em tudo que aparece na tela e nos comentários. Minúsculas nos rótulos,
  como o resto do sistema ("notas", "puxar para o dia"). Sem emoji na interface.
- **Inglês em todo identificador**: variável, função, componente, prop, chave, campo, classe
  de CSS, id de elemento, nome de arquivo.
- React 19 e Vite. `npm run dev` para trabalhar, `npm run build` para gerar `server/site/`.
- Nada de `innerHTML` nem de HTML por string: no JSX, `{x}` já é texto. O markdown passa por
  `<Markdown/>`, que é a única exceção. Se sentiu falta de `escapeHtml()`, o caminho está errado.
- Estado de tela é `useState`; nada de variável de módulo com `render()` depois.
- `key` em toda lista, com o `id` do documento.
- Eventos nos elementos (`onClick={…}`). Arrastar e soltar é a exceção aceita para
  `closest()`.
- Canvas e SVG desenhados à mão ficam num componente com `useRef`; o desenho continua
  imperativo por dentro.
- Nada de vermelho: o sistema é monocromático + um verde. Negativo é `--ink-50` ou hachura.
- Toda ação destrutiva passa por `notify(text, undo)`.
- Responsivo: no celular a página vira uma coluna. Nada rola horizontal fora de
  `.table-scroll` ou de um canvas.
- Atalhos de teclado onde faz sentido; `Esc` fecha diálogos.
- Estado vazio explica o que a tela faz em uma frase, sem tutorial.
- Minimalismo antes de tudo: sem filtros, sem formulário aberto na tela, um botão "+" por
  coisa que se cria. A busca global da sidebar substitui qualquer filtro por nome.
- Comentários no código explicam **por quê**, não o quê, como no `index.html`.
- **Cor nova sai de token, nunca de hex na regra.** São duas marcas agora (`:root` é o Merlin,
  `html.gl` é a Guessless), e um `#2EE86B` escrito à mão numa página não troca junto — vira um
  verde solto no meio do azul da casa. Se faltar um token, crie no `shell.css` para as duas.
- **Toda chave nova do `localStorage` começa com `merlin:`.** Não é estilo: o guarda de
  identidade varre por esse prefixo e apaga tudo que encontra quando o e-mail da sessão muda.
  Chave fora do padrão é dado de uma pessoa que fica no navegador da outra. As três exceções
  (`merlin:who`, `merlin:theme`, `merlin:sidebar`) estão listadas em `KEPT`, no `core.js`, e
  são preferência, não dado. O teste é `node src/shared/test.mjs`, e ele roda no `deploy`.
