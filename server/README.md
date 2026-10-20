# o servidor

Um Worker, um banco D1 e o Resend. Sem framework e sem dependência — a mesma
disciplina do `index.html`, pelo mesmo motivo: dá pra ler inteiro.

O que ele faz: serve o site, diz quem é você (código de 6 dígitos por e-mail),
guarda um documento por dia (tabela `days`) e guarda os documentos dos outros
módulos por tipo e id (tabela `docs`: ideas, clients, maps, funnels,
finance, week). Ele **não** entende nada do que há dentro — só devolve e
diz qual versão é mais nova. A quinta tabela, `advice`, existe só para que
ninguém gaste sozinho a chave que é do time, e a `usage` conta o que cada
pedido ao Merlin custou (veja "A medição").

`OWNER_EMAILS` no `wrangler.toml` lista quem pode entrar. Cada entrada é um
endereço inteiro (`arthurcastilhos@gmail.com`) ou um domínio começado por `@`
(`@guessless.com.br`), e é o domínio que abre o Merlin para o time sem um
deploy por pessoa que entra. Outro e-mail recebe a mesma resposta de sucesso e
nenhum código.

**Entrar não é ver.** Quem entra ganha uma linha em `people` e um Merlin
próprio: `days`, `docs`, `advice` e `usage` são todas por `person`, e nenhuma consulta
aqui cruza essa coluna. O domínio abre a porta da casa, não a gaveta de
ninguém — e o teste `13d` existe para que isso não deixe de ser verdade sem
alguém perceber.

As páginas da raiz, a pasta `shared/` e a API saem do mesmo Worker, no mesmo domínio. Não é
economia: é o que permite o cookie de sessão ser `SameSite=Lax`. Em domínios
separados ele seria cookie de terceiro, e Safari e Firefox o bloqueiam — o
login não gruda.

## Subir do zero

Uma vez só, uns 10 minutos.

### 1. O banco

```bash
cd server
npx wrangler d1 create artt-planner   # o nome do banco não mudou com o do produto
```

Copie o `database_id` que aparece e cole em `wrangler.toml`. Depois crie as
tabelas, em produção (o schema é idempotente: rodar de novo num banco que já
existe só cria as tabelas que faltavam — hoje a `usage`):

```bash
npx wrangler d1 execute artt-planner --remote --file schema.sql
```

### 2. O e-mail

Crie a conta no [Resend](https://resend.com) e **verifique um domínio seu**.
Isso não é opcional: o remetente de teste (`onboarding@resend.dev`) só entrega
no e-mail da própria conta, e qualquer outro destinatário volta 403.

Ajuste `SENDER_EMAIL` no `wrangler.toml` para um endereço desse domínio.

### 3. Os segredos

Três, e nenhum deles fica em arquivo:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ANTHROPIC_API_KEY
```

O `ANTHROPIC_API_KEY` é do Merlin conselheiro (a rota `/api/merlin`, que sugere
ramos no mapa mental e o que falta num funil). É opcional: sem ele a rota
responde 503 e as telas dizem que falta a chave. A chave sai de
console.anthropic.com; o modelo é o `claude-opus-5-5` e cada pedido custa centavos.

Essa chave é **uma só para o time**, e por isso a rota tem teto, por pessoa e
por hora, contado na tabela `advice` em três cotas separadas (`QUOTA`, no worker):

- **conselho**: 30 (`ADVICE_PER_HOUR`), no Opus. Inclui as perguntas antes de
  montar um funil, app, mapa, planilha, apresentação ou protótipo: o fluxo de montagem inteiro gasta uma vez daqui.
- **leitura do início**: 60 (`CAPTURE_PER_HOUR`), no Haiku: o campo da home
  separando tarefa, data, hora, nota e dinheiro (gasto ou entrada).
- **montagem**: 40 (`BUILD_PER_HOUR`), no Opus: o rascunho e cada ajuste de um
  funil, app, mapa, planilha, apresentação ou protótipo montado na conversa, e cada ajuste de uma
  apresentação ou planilha aberta pedido pelo "pedir ao Merlin" do editor.

Quem estourar espera; quem está ao lado não paga por isso.

Toda pergunta ao assistente (a tarefa `assistant`) leva junto o **retrato**: um resumo do
dia, da agenda dos próximos 7 dias, da rotina, da semana, dos produtos, dos leads e dos
clientes, do conteúdo, dos hábitos, da saúde (só números de 7 dias, e só se a pessoa não a
tirou no perfil), dos títulos das notas, do dinheiro pessoal (sem dívidas nem
investimentos) e do negócio (só números: caixa hoje, fim do mês e fôlego, as metas do trimestre com o progresso, os processos que vencem na semana, e do time só a contagem e o custo total, nunca nome), montado no
navegador (`src/shared/portrait.js`) e mandado em `context.portrait`. O Worker corta o
retrato em 6.000 caracteres (o `pageContext` continua com 1.200), descarta-o em qualquer
outra tarefa e não lê documento nenhum para montá-lo. A exceção é a montagem de um tipo com
`cash` em `BUILD_KINDS` (a planilha): quando o pedido cita o caixa, a tela manda só as seções
dinheiro e negócio, e o Worker as aceita cortadas em 1.500 caracteres (`BUILD_PORTRAIT_MAX`).
O mesmo vale para `product` em `BUILD_KINDS` (a apresentação): quando o pedido nomeia um
produto, a tela manda em `context.product` o que se sabe dele (o projeto de app, o funil e a
oferta ligados, as metas do plano), cortado em 6.000 caracteres (`PRODUCT_MAX`) e descartado
em qualquer outra tarefa. A apresentação montada tem de 3 a 12 slides (`DECK_MIN`,
`DECK_MAX`; menos de 3 é 502); com `context.open` (o ajuste de um documento que já existe) o
mínimo é 1. E `spec` em `BUILD_KINDS` (o protótipo, ticket #95): a tela manda em `context.spec`
o app como está (telas, o que cada uma tem, ações e entidades), cortado em 8.000 caracteres
(`SPEC_MAX`) e apagado de qualquer outra montagem (as tarefas `app` e `appReview`, que não
são montagem, continuam lendo o `spec` delas). O rascunho volta só com `screens` (até 12,
`PROTOTYPE_MAX`; o que não é tela não ocupa vaga) e `flows` (até 40), pelos nomes; quem resolve
nome em id e descarta a ação para tela que não existe é a tela. A resposta traz `sources`, filtrado
por uma lista fechada, e o tamanho do retrato que foi (o já cortado) entra no
`portrait=` da linha de medição de cada pedido, no `wrangler tail` (ver "A medição", abaixo).

O retrato tem um interruptor, um quarto segredo, opcional:

```bash
npx wrangler secret put MERLIN_PORTRAIT_OFF     # qualquer valor: desliga o retrato para todos
npx wrangler secret delete MERLIN_PORTRAIT_OFF  # liga de novo
```

Desliga sem build: o Worker descarta o retrato antes de montar o pedido à Anthropic.

O `SESSION_SECRET` assina os cookies de sessão. Gere um forte e guarde:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Trocar esse segredo desloga todo mundo — é o botão de pânico se um dia você
achar que vazou.

### 4. O domínio

No `wrangler.toml`, ponha o **seu** domínio no bloco `[[routes]]`:

```toml
[[routes]]
pattern = "planner.seudominio.com.br"
custom_domain = true
```

É `custom_domain`, não route: a Cloudflare reserva route para quando existe uma
origem externa a ser interceptada. Aqui o Worker **é** a origem, e o custom
domain cria o registro DNS e o certificado sozinho.

Se já houver um CNAME nesse hostname (apontando para outra hospedagem, por
exemplo), **apague antes** — a Cloudflare recusa criar custom domain por cima
de um CNAME existente, e o deploy falha.

### 5. Publicar

```bash
npm run deploy
```

Isso roda os testes, faz o `vite build` (que escreve as páginas prontas em `site/`) e publica. Se
algum teste falhar, nada sobe.

Normalmente ninguém roda isso à mão: todo push na `main` dispara o
`.github/workflows/deploy.yml`, que faz o mesmo `npm run deploy`. Ele usa dois segredos do
repositório no GitHub: `CLOUDFLARE_API_TOKEN` (modelo "Edit Cloudflare Workers", só a conta
arttreis e a zona `arttreis.com.br`, porque o custom domain precisa de Workers Routes) e
`CLOUDFLARE_ACCOUNT_ID`. Os segredos do app continuam no `wrangler secret`, fora do GitHub.

## Mexer sem quebrar nada

```bash
npx wrangler d1 execute artt-planner --local --file schema.sql
npm run dev
```

Em desenvolvimento, se `RESEND_API_KEY` contiver `fake`, nenhum e-mail sai — o
código aparece no log do Worker. É o que permite testar o login inteiro sem
mandar mensagem para ninguém.

Crie um `.dev.vars` (que o git ignora):

```
RESEND_API_KEY=re_fake_para_teste_local
SENDER_EMAIL=planner@exemplo.com
SESSION_SECRET=qualquer-coisa-longa-em-desenvolvimento
```

## As rotas

| Rota | O que faz |
| --- | --- |
| `POST /api/code` | manda um código de 6 dígitos para o e-mail |
| `POST /api/sign-in` | troca o código por uma sessão (cookie) |
| `POST /api/sign-out` | apaga o cookie |
| `GET /api/me` | diz se há sessão e de quem |
| `GET /api/days?since=V` | devolve os dias com carimbo maior que `V` |
| `POST /api/days` | grava um dia; recusa se o servidor estiver na frente |
| `GET /api/docs?type=T&since=V` | os documentos do tipo `T` com carimbo maior que `V` |
| `POST /api/docs` | grava um documento `{type, id, v, doc}`; 409 com `server` se estiver na frente |
| `POST /api/quick-note` | guarda uma nota vinda da extensão do Chrome (`extension/`) |
| `GET/POST/DELETE /api/share` | lista, cria e revoga links públicos de mapa ou funil |
| `GET /api/shared/:token` | a leitura pública de um link, sem sessão |
| `POST /api/waitlist` | `{email}`: a lista de espera da landing, sem sessão. A mesma resposta para quem entra e para quem já estava; o campo escondido `site` (que só robô preenche) faz fingir que gravou; teto de `WAITLIST_PER_HOUR = 300` entradas por hora somando todo mundo. Não abre porta: quem entra continua sendo `OWNER_EMAILS`. A tabela `waitlist` precisa existir no D1 de produção antes do deploy (`schema.sql`). |
| `POST /api/files`, `GET/DELETE /api/files/:id` | anexos no R2; sem o binding `FILES`, 503 |
| `POST /api/merlin` | `{task, context}`; tarefas `branches, funnel, nextStage, expand, assistant, week, meeting, habits, review, numbers, delegate`, as do conteúdo, e as do projeto de app: `app` (devolve `{blueprint}` — o projeto inteiro em nomes, que a tela resolve em ids; 12000 tokens de saída em vez de 4000) e `appReview` (texto); `capture` (a linha do início vira `{items}`, no Haiku: `task`, `note`, `money`, `habit`, `sleep`, `workout` ou `meal`. O contexto pode levar `categories`, `planned` e `fixed` do financeiro e `habits` (os nomes dos hábitos não arquivados); no `money`, o Worker só aceita categoria e ids de previsto e de fixo que vieram no contexto, limita o valor a 0–100.000.000 centavos, tira o `paid` da data, não da IA, e devolve `book` (`business` só quando a IA diz; ausente ou qualquer outra coisa é `personal`, e no livro da empresa `confirm` e `fixed` voltam vazios, porque o contexto enviado é o do pessoal); o `habit` volta `{habit, name, date}`, e `habit` só fica se for um dos nomes enviados, senão vem vazio e a tela oferece criar; o `sleep` volta `{min, date}`, com `min` entre 0 e 1440 — 0 quando a linha não diz as horas, e a tela as pede — e `date` o dia em que a pessoa acordou, hoje quando não é uma data; o `workout` volta `{title, min, date}`, com `title` até 60 caracteres, `min` entre 0 e 600 — 0 quando a linha não diz, e a tela pede — e `date` o dia do treino; sem título e sem minutos o item cai, porque "treinei" sozinho é `habit`; o `meal` volta `{meal, text, date}`, com `meal` um de `breakfast`, `lunch`, `snack` e `dinner` — fora deles, `snack`; sem a refeição dita, a IA escolhe pela hora —, `text` até 120 caracteres — sem ele o item cai — e `date` o dia em que comeu; "gastei 45 no almoço" continua `money`) e `build` (`context.kind` = `funnel`, `app` ou `map`; `context.step` = `brief` devolve `{questions}`, `draft` e `revise` devolvem `{draft, summary}`). O catálogo do `assistant` tem dezessete tipos, com `finance-entry` (`name, amount, kind, day, category, paid, confirm, fixed`), `habit-mark` (`habit, name, date`), `sleep-log` (`min, date`), `workout-log` (`title, min, date`) `meal-log` (`meal, text, date`), `op-add` (`title, freq, day`) e `op-done` (`title, date`), os dois da operação, na coleção `ops`, `team-add` (`name, role, cost`) e `team-delivery` (`name, text, date`), os dois do time, na coleção `team`, e `goal-set` (`kind, text, source, target`), a meta, na coleção `plans`: `kind` fora de year/half/quarter vira `quarter`, `source` fora da lista vira `manual`, `target` é inteiro ≥ 0, e o período não vem da IA, é o de hoje, na tela. Só `assistant` aceita `context.history` (array `{role, content}`) — as outras nunca mandam esse campo, e continuam um turno só. A resposta de `assistant` é `{suggestions, clarify, sources}` e, quando o modelo pede uma tela que a página monta sozinha, `show` — lista fechada `["quests"]` (o cartão do "o que falta hoje?"); valor fora dela não chega. |

## Decisões que valem saber

**O servidor lê seus dados.** Não há cifra ponta a ponta, e isso foi escolha,
não esquecimento: com login por código, a chave teria que vir do servidor —
quem consegue se convencer de que você é você, consegue se convencer sozinho.
Cifra de mentira é pior que cifra nenhuma, porque você confia nela.

**O código nunca é guardado.** O banco tem o SHA-256 de `código + e-mail`.
Quem ler o banco não entra na conta de ninguém.

**Uso único, de verdade.** O gasto do código é um `UPDATE ... WHERE used = 0`:
dois pedidos simultâneos com o mesmo código, só um passa.

**Errar custa igual a acertar.** Código inexistente também conta tentativa, e
5 erros queimam o código. Sem isso dava pra varrer os seis dígitos.

**Pedir código para um e-mail que não existe responde igual.** Dizer "essa
conta não existe" entregaria quem tem conta a quem estiver testando endereços.

**Quem chegou depois ganha.** O `v` do documento decide, e o servidor recusa
gravação mais velha devolvendo a versão dele — em vez de deixar os dois lados
discordando em silêncio. Não é merge por tarefa: se você editar nos dois
computadores ao mesmo tempo, offline, um dos lados perde o intervalo. Para uso
sequencial (manhã em casa, tarde no escritório) isso não acontece.

**O domínio abre a porta, não a gaveta.** `@guessless.com.br` em `OWNER_EMAILS`
deixa o time entrar sem um deploy por pessoa, e cada endereço vira uma linha em
`people` com um Merlin próprio. O isolamento não é regra de tela nem convenção:
é a coluna `person` em toda tabela e o `sub` do JWT em toda consulta. Nada no
servidor sabe ler o dado de dois donos ao mesmo tempo — nem se alguém pedir.

**O navegador tem dono, e ele é do cliente.** O servidor não consegue impedir
que duas pessoas dividam um Chrome: as chaves do `localStorage` não sabem de
quem são, e quem entrasse depois de um colega subiria os documentos dele para
a própria conta. Isso se resolve no `core.js` (`merlin:who`), não aqui — mas
está anotado neste arquivo porque é a metade da promessa que o servidor faz e
não consegue cumprir sozinho.

## O que custa

Nada, nesta escala. D1 e Workers têm tier gratuito folgado (100 mil
requisições/dia), e o Resend entrega 3 mil e-mails/mês de graça — um dia inteiro
de uso são alguns KB e alguns logins por mês. Um time de dez pessoas multiplica
isso por dez e continua não chegando perto: a sessão dura 90 dias, então são
poucos e-mails por pessoa por trimestre.

A conta que **não** é gratuita é a da Anthropic, e é a única que cresce com o
time: cada conselho é um pedido ao Opus. O teto de `ADVICE_PER_HOUR` limita o
estrago de um acidente, não o uso normal — se o gasto incomodar, o lugar de
olhar é console.anthropic.com, e o de mexer é aqui.

## A medição

Além do teto, cada pedido que a Anthropic respondeu soma uma linha na tabela `usage`
(`person, day, task, n, tokens_in, tokens_out`, chave `person + day + task`, apagada junto
com a pessoa). É a conta que diz o que cada tarefa custa; o teto (`advice`) só barra abuso.

- **`day` é `AAAA-MM-DD` em UTC**: o Worker não sabe o fuso de quem pede. Um pedido às 22h em
  Brasília cai no dia seguinte.
- **`task` é o que a pessoa fez, não só a rota**: `assistant:action` (a resposta trouxe
  proposta) ou `assistant:answer` (só `clarify`); `capture:<kind>`, uma linha por tipo de item
  devolvido (`capture:task`, `capture:note`), ou `capture:none` quando a lista vem vazia;
  `build:<step>:<kind>` (`brief`, `draft`, `revise` × `funnel`, `app`, `map`, `sheet`, `deck`,
  `prototype`: `build:draft:prototype`); para as outras, o nome da tarefa (`week`, `app`…).
- **Os tokens vêm do `usage` da resposta** e, numa captura que grava mais de uma linha, entram
  só na primeira, para a soma de tokens não contar o mesmo pedido duas vezes. Resposta sem
  `usage` soma o pedido e deixa os tokens como estavam.
- Conta pedido que a Anthropic **respondeu**, inclusive recusa e resposta fora do formato (os
  tokens foram cobrados do mesmo jeito). Não conta o que foi barrado antes: teto (429), sem
  chave (503), tarefa inválida (400) ou a Anthropic fora do ar (502).
- Só números: nunca o texto do pedido nem o da resposta. Gravar a `usage` nunca derruba a
  resposta (falhou, `console.error`). Nenhuma rota lê a tabela.
- Cada pedido também escreve uma linha no log: `merlin <task> in=<n> out=<n> portrait=<caracteres ou 0>`.
  Para ver ao vivo, `npx wrangler tail`.

Três consultas prontas, por `npx wrangler d1 execute artt-planner --remote --command "…"`:

```sql
-- pedidos por tarefa, por dia
SELECT day, task, SUM(n) AS pedidos FROM usage GROUP BY day, task ORDER BY day DESC, pedidos DESC;

-- tokens médios por pedido, por tarefa
SELECT task, SUM(n) AS pedidos, SUM(tokens_in) / SUM(n) AS entrada_media, SUM(tokens_out) / SUM(n) AS saida_media
FROM usage GROUP BY task ORDER BY pedidos DESC;

-- pessoas ativas por dia
SELECT day, COUNT(DISTINCT person) AS pessoas FROM usage GROUP BY day ORDER BY day DESC;
```

(O `tokens_in` de uma captura com dois tipos fica todo no primeiro, então a média de
`capture:note` por pedido sai menor que a real: leia a captura pela soma das linhas `capture:*`.)

## O link público

`share.html#<token>` abre a leitura de um mapa ou de um funil sem conta nenhuma. É a única rota
deste worker que responde sem sessão, e por isso ela é a mais estreita:

- só dois tipos (`maps`, `funnels`). A lista é fechada no código — cliente, financeiro e cofre
  não têm link e não vão ter.
- o token são 16 bytes aleatórios em base64url, e ele **é** a credencial: não há enumeração
  porque ele é a chave primária, e não há adivinhação.
- a linha guarda o *endereço* do documento, e não uma cópia dele: o link mostra a versão de
  agora. Quem compartilha continua editando, e o cliente vê o que for escrito depois — é por
  isso que revogar existe, e é por isso que a caixa diz isso em voz alta.
- não há expiração. Um link que morre sozinho é um link que morre no meio de uma conversa com o
  cliente; quem decide quando acaba é quem criou.

A tabela `shares` entra pelo mesmo `schema.sql`. Um banco que já existe precisa dela antes do
próximo deploy:

```bash
npx wrangler d1 execute artt-planner --remote --file=schema.sql
```

(`artt-planner` é o `database_name` do `wrangler.toml`, e não o nome do produto: o recurso na
Cloudflare nunca foi renomeado porque renomear criaria um banco vazio ao lado. O worker o
alcança pelo binding `DB`.)

(o arquivo é todo `CREATE TABLE IF NOT EXISTS`, então rodá-lo de novo não mexe no que já está lá.)
