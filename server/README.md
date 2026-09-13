# o servidor

Um Worker, um banco D1 e o Resend. Sem framework e sem dependência — a mesma
disciplina do `index.html`, pelo mesmo motivo: dá pra ler inteiro.

O que ele faz: serve o site, diz quem é você (código de 6 dígitos por e-mail),
guarda um documento por dia (tabela `days`) e guarda os documentos dos outros
módulos por tipo e id (tabela `docs`: ideas, clients, maps, funnels,
finance, week). Ele **não** entende nada do que há dentro — só devolve e
diz qual versão é mais nova. A quinta tabela, `advice`, existe só para que
ninguém gaste sozinho a chave que é do time.

`OWNER_EMAILS` no `wrangler.toml` lista quem pode entrar. Cada entrada é um
endereço inteiro (`arthurcastilhos@gmail.com`) ou um domínio começado por `@`
(`@guessless.com.br`), e é o domínio que abre o Merlin para o time sem um
deploy por pessoa que entra. Outro e-mail recebe a mesma resposta de sucesso e
nenhum código.

**Entrar não é ver.** Quem entra ganha uma linha em `people` e um Merlin
próprio: `days`, `docs` e `advice` são todas por `person`, e nenhuma consulta
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
existe só cria as tabelas que faltavam — hoje a `advice`):

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
console.anthropic.com; o modelo é o `claude-opus-5` e cada pedido custa centavos.

Essa chave é **uma só para o time**, e por isso a rota tem teto: 30 conselhos
por pessoa por hora, contados na tabela `advice`. Quem estourar espera; quem
está ao lado não paga por isso. O número está em `ADVICE_PER_HOUR`, no worker.

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

Isso roda os testes, copia as páginas e `shared/` da raiz para `site/` e publica. Se
algum teste falhar, nada sobe.

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
| `POST /api/merlin` | `{task, context}`; tarefas `branches, funnel, nextStage, expand, week, meeting, habits, review, numbers, delegate` |

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
