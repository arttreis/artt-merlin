# Merlin · como o sistema funciona (ponto de partida)

Mapa único para quem vai continuar o desenvolvimento. Não substitui os outros documentos —
aponta para eles e preenche o que ficou desatualizado. Levantado do código em 08/10/2026.

## Os documentos que já existem

| arquivo | para que serve |
| --- | --- |
| [README.md](README.md) | o produto: as páginas, o dia (a sobra), atalhos, onde ficam os dados |
| [VISAO.md](VISAO.md) | a fonte das **decisões** e princípios (uma pessoa por vez, só o dia tem minutos, marca) |
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
  `hat.test.mjs`, `server/test.mjs`).

## Arquitetura em camadas

```
<pagina>.html (raiz)        casca: CSS da página inline, anti-flash do tema, <main id="app">
   └─ src/<pagina>.jsx      a tela (React). initPage("<id>") + mount(<Tela/>, "app")
        ├─ src/shared/ui.jsx     hooks (useCollection, useCloud…), Form/Dialog, a sidebar
        ├─ src/shared/core.js    DADOS, sem React: coleções, sessão, sync, datas, dinheiro
        └─ src/shared/*.js       regras puras: tasks, day, routine, board, mermaid, templates…
                 │  localStorage  merlin:<type>  (fonte de verdade local)
                 ▼
server/worker.js  /api/*  ──  D1: people, codes, days, docs, advice, shares
                  resto   ──  server/site/ (saída do vite build)
```

**Regra de ouro:** página nova = `nome.html` na raiz + `src/nome.jsx`, e uma aba numa das seis
seções de `SECTIONS` no `core.js` (VISAO, 9) — página nova não ganha item próprio na barra. O `vite.config.js` acha
os pares sozinho; não há lista de rotas. Nunca escreva no `localStorage` direto — use
`collection()` / `useCollection()`.

## As páginas (ids do `initPage`)

| página | arquivo | observação |
| --- | --- | --- |
| porta | `index.html` + `landing.jsx` | a landing é HTML estático no `index.html`, com o CSS em `landing.css`, e um script no `<head>` decide antes da primeira pintura quem a vê. `landing.jsx` só acorda o que se mexe (a floresta, a janela de demonstração, a lista de espera) para quem está na porta. Ver `docs/prd/landing.md` |
| hoje (calendário) | `calendar.jsx` | a primeira tela: dia / semana / mês sobre **uma** coleção `tasks`, com hábitos e "como foi o dia" ao lado (`today-block.jsx`) e a apresentação (`tour.jsx`); `day.html`, `week.html`, `journal.html` e `plans.html` só redirecionam |
| rotina | `routine.jsx` | semana-modelo sem datas; vira tarefas (`shared/routine.js`) |
| assistente | `assistant.jsx` | conversa com o Merlin, fora da barra (chega-se pelo `Ctrl+K`); respostas viram **propostas** confirmadas (`assistant-actions.js`). O Merlin aparece como o chapéu de `shared/hat.js` (`<Hat>` do `ui.jsx`): grande na abertura, ao lado do campo na conversa, mudando de humor com ela (VISAO, 12) |
| notas | `notes.jsx` | caixa de entrada (antiga "ideias") |
| prospecção | `prospecting.jsx` | quadro de leads; mesmo documento de cliente (`client-doc.js`) |
| clientes | `clients.jsx` | canais, backlog, cofre |
| conteúdo | `content.jsx` | quadro de peças com roteiro |
| funis | `funnels.jsx` | grafo de etapas |
| mapas | `maps.jsx` + `maps-board.jsx` | mapa mental + quadro livre (estilo Miro, `board.js`) |
| produtos | `apps.jsx` | o centro: visão geral (construir, distribuir, pensar) + projeto de app: conceito, banco, telas e fluxos → SQL, mermaid, spec e prompt (`app-spec.js`) |
| financeiro | `finance.jsx` | mês, ano, painel 50/30/20 |
| wishlist | `wishlist.jsx` | "comprei" lança no financeiro |
| hábitos | `habits.jsx` | grade do mês |
| perfil | `profile.jsx` | sessão, tema, inventário |
| link público | `share.jsx` | leitura sem conta de mapa/funil |
| rastreador | `tracker.jsx` | a janela pequena do app de desktop; mesma conta do dia (`distribute` em `day.js`, `readLine` em `tasks.js`) |

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
npm run deploy              # testes → build → wrangler deploy (nada sobe se falhar)
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
