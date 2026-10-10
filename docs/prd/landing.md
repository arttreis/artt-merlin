# Landing · a página de quem nunca ouviu falar do Merlin

**Status:** ✅ No ar desde 2026-10-10. A versão do worker é a `ef29d274`, com a privacidade e a
medição; a primeira da landing foi a `2f70532a`, e a de antes dela, para voltar, é a `d0c507b1`. O Arthur pediu para desenvolver direto, sem `/plan-project`, e as recomendações
abaixo viraram as decisões.
**Owner:** Arthur Reis
**Criado em:** 2026-10-10
**Referência:** [notion.com/pt](https://www.notion.com/pt). As capturas ficaram em `.playwright-mcp/notion-*.png|jpg`, uma pasta que o git não sobe.
**Tela:** `/`. A página é HTML estático no `index.html`, com o CSS em `src/landing.css` e o que se
mexe em `src/landing.jsx`. A porta antiga (o `Landing` do `index.jsx` e o `.lg*` do `index.css`) saiu.

## O que foi feito

| peça | onde |
| --- | --- |
| os nove blocos (barra, hero, funciona com, bento, casos, "o seu dia é só seu", números, fechamento, rodapé) | `index.html`, `src/landing.css` |
| a decisão da porta antes da primeira pintura, uma miniatura do `isNewHere()` | o segundo `<script>` do `<head>` do `index.html` |
| a floresta na hora de quem visita e a janela do início andando: escrever "revisar a landing 45m", a tarefa entrar no dia, a barra se gastar num relógio acelerado, o recibo "levou 50m de 45m" e a linha seguinte virar ideia | `src/landing.jsx` |
| o relógio de fora na conta do dia (`budget(doc, open, now)`, `distribute(doc, open, now)`), sem mudar quem já chamava | `src/shared/day.js` |
| o fim da porta: `html.in`, o título da aba de volta a "merlin" e o `landing.jsx` baixado só por quem está nela | `Root` em `src/index.jsx` |
| a lista de espera | `POST /api/waitlist` no `server/worker.js`, tabela `waitlist` no `server/schema.sql` |
| a prévia de link e o buscador | meta, Open Graph, JSON-LD `SoftwareApplication`, `public/og.jpg`, `public/robots.txt`, `public/sitemap.xml` |
| testes | `src/shared/test.mjs`: o `<head>` e o core concordam sobre a porta em todos os casos, e os números escritos à mão batem com o `templates.js`. `server/test.mjs`: a lista de espera (sem sessão, normaliza, não duplica, recusa e-mail inválido, campo escondido, não se lê, não abre a porta, teto da hora) |

Conferido no navegador em 1440px e 390px, no tema escuro e no claro: abrir o Merlin leva ao
onboarding, entrar abre a caixa do código, a lista de espera grava no D1 local, e quem já tem um
Merlin no navegador cai direto na casa sem a landing piscar e sem baixar o `landing.jsx`.

## A publicação (2026-10-10)

1. ✅ A tabela `waitlist` foi criada no D1 de produção com o `schema.sql`, que só tem
   `CREATE ... IF NOT EXISTS` e não mexeu no que já existia.
2. ✅ `npm run deploy` passou pelos testes (199 do servidor, 236 + 73 do navegador) e subiu.
3. ✅ Conferido em produção: `/` devolve a landing com título, OG e texto; `robots.txt`,
   `sitemap.xml` e `og.jpg` respondem; `/api/waitlist` recusa e-mail inválido, recusa GET e
   finge gravar o robô sem gravar; quem já tem Merlin no navegador cai na casa sem baixar o
   `landing.jsx`.

Duas coisas desta máquina que travavam o deploy:

- **O Wrangler pede Node 22 ou mais novo** e o nvm está no 20. O deploy roda com o Node 24 que
  já está instalado, só naquele processo:
  `$env:PATH = "$env:LOCALAPPDATA\nvm\v24.14.0;" + $env:PATH`.
- **O login do Wrangler enxerga duas contas** (arttreis e GuessLess) e, fora de um terminal
  interativo, não escolhia sozinho. Desde 2026-10-10 o `wrangler.toml` diz a conta
  (`account_id` da **arttreis**), por decisão do Arthur.

### A segunda rodada (2026-10-10)

- ✅ **Privacidade:** `public/privacidade.html`, servida em `/privacidade`. Diz o que o Merlin
  guarda sem conta e com conta, o que vai para a Anthropic, os links públicos, o GitHub, a
  lista de espera, quem mais participa (Cloudflare, Resend, Anthropic, Google Fonts) e como
  pedir cópia ou exclusão. O contato é o que o arttreis.com.br já publica
  (arthur@guessless.com.br). É um texto em linguagem de gente, tirado do código, e não passou
  por advogado. Mudou o `worker.js` ou o `core.js` no que toca a dado, muda a página. A
  landing aponta para ela no rodapé e embaixo da lista de espera.
- ✅ **Assinatura (D6):** fica arttreis: "© 2026 Arthur Reis · arttreis.com.br".
- ✅ **Prévia de link:** conferida em produção fazendo o pedido como os robôs do WhatsApp, do
  Facebook, do LinkedIn e do X: a página responde 200 a todos, com as 8 tags `og:`, e a
  `og.jpg` (106 KB, JPEG) também. Colar o link num chat de verdade fica com o Arthur.
- ✅ **Cloudflare Web Analytics:** o Arthur criou o site no painel (o login do Wrangler não tem
  permissão, a API devolve 403) e mandou o snippet, de token `6f0453a9…`. Ele entra por um
  terceiro `<script>` no `<head>` do `index.html`, **só para quem está na porta** (`html.bare`):
  quem já usa abre o início no mesmo endereço, e contar essas aberturas misturaria a casa com a
  vitrine. O `test.mjs` confere os dois lados. Conferido em produção: o visitante novo manda o
  beacon, e quem já usa não manda o nosso.
- ⚠️ **A Cloudflare também injeta um beacon sozinha.** É outro token (`de4be3af…`), entra pela
  borda em toda resposta HTML pedida por navegador e vale para todas as páginas do
  merlin.arttreis.com.br, inclusive as do app (`/calendar`, `/finance`, `/share`). É a
  instalação automática de algum site do Web Analytics na zona arttreis.com.br. Por isso a
  privacidade diz "o site conta as visitas", e não "só a landing". Para medir só a vitrine,
  basta desligar a instalação automática desse site no painel (Web Analytics → o site do
  token `de4be3af…` → desligar o *automatic setup* ou excluir o hostname). Feito isso, a
  privacidade pode voltar a dizer que nenhuma tela do sistema é medida.
- O endereço (D4) continua `merlin.arttreis.com.br`. Quando a fila vira conta segue em aberto
  (VISAO 8.6).

---

## Objetivo

Explicar o Merlin para quem nunca ouviu falar dele e levar essa pessoa a um primeiro gesto. Essa
pessoa é a da VISAO 8.1: o desenvolvedor sozinho que faz o próprio SaaS com a IA escrevendo boa
parte do código e que precisa distribuí-lo. A página substitui a porta atual.

## Por que agora: o que a porta faz hoje

A porta tem um cartão com um título ("o dia é o único lugar com *minutos*"), um parágrafo e dois
botões ("abrir o meu Merlin" e "entrar com e-mail"). Ela foi feita para a casa, e para gente de
fora falha em quatro pontos:

- **O produto não aparece.** Ela não mostra nenhuma tela nem nenhum print. Quem chega precisa
  acreditar no texto.
- **O texto usa o vocabulário de dentro.** "O número grande", "a sobra" e "o dia é o único
  lugar com minutos" fazem sentido para quem já usa e soam abstratos para quem nunca viu.
- **Buscador e prévia de link não leem nada.** O HTML servido em `/` é
  `<main id="app"></main>`, vazio, e o texto só existe depois que o React roda. Quando o link é
  colado no WhatsApp, no X ou no LinkedIn, a prévia sai em branco.
- **A página carrega fontes que não usa.** O `index.html` pede cinco famílias, inclusive as três
  da Guessless, para uma página que nunca veste a marca da casa.

## O que vem do Notion, e o que não vem

A página do Notion é **curta**: são oito blocos, uns 4.800px numa tela de 1440, e cada bloco faz
uma coisa só. Essa brevidade é o que mais vale copiar.

| bloco do Notion | o que ele faz | no Merlin |
| --- | --- | --- |
| barra fixa: Produto ▾, Recursos ▾, Preços, Demonstração · Fazer login · **Use de graça** | um CTA sempre à vista | barra curta: produto (âncoras), baixar, entrar · **abrir o meu Merlin** |
| hero: título gigante, uma palavra numa pílula com ponto azul ("● Pensam"), subtítulo de uma linha, dois botões, o produto numa janela com ilustração saindo da moldura | diz o que é e mostra o produto na primeira dobra | igual na forma. A ilustração é a **floresta** (`shared/forest.jsx`), que já existe e acompanha a hora de quem visita |
| faixa de logos colada no pé da primeira dobra | prova social imediata | faixa "funciona com" (ver bloco 2), porque logos de cliente ainda não existem |
| bento "IA onde a sua equipe trabalha": três cartões cinza (dois em cima, um largo embaixo), cada um com um rótulo pequeno, uma frase em negrito, uma seta e o print recortado dentro | os três pilares, com âncora (`#capture` `#find` `#automate`) | os três trabalhos: **construir, distribuir, caber** |
| "Veja o que o Notion pode fazer": cinco cartões pequenos com ícone | casos concretos | seis cartões com gestos do Merlin |
| "Confiável por equipes que entregam": três depoimentos grandes, foto em duotone | confiança | **"o seu dia é só seu"**: os princípios que protegem quem usa (ver D5) |
| faixa de números em loop | escala | só números verdadeiros do produto |
| "Comece hoje mesmo." com os dois botões | fechamento | "o dia de hoje ainda cabe." |
| rodapé: citação de McLuhan e quatro colunas | assinatura | a frase do nome: *o conselheiro do rei Arthur: não governa, aconselha* |

**O que fica de fora, de propósito:**

- **O fundo branco e a ilustração de traço.** Essa é a identidade do Notion. A nossa é o escuro
  com um verde só (`--accent #2EE86B`) e a floresta, e o produto que aparece nos prints é escuro
  (ver D2).
- **"Peça uma demonstração".** O Merlin não tem venda assistida.
- **Logos e depoimentos de terceiros.** Ainda não existe usuário de fora, e inventar um seria
  mentir na primeira tela.
- **Menus suspensos com vinte itens.** Ainda não existem páginas para preencher esses menus.

## O que a página precisa dizer

Uma ideia só, que já está na VISAO 8.1: **construir e distribuir são as duas metades do trabalho,
e as duas disputam minuto no mesmo dia.** O Merlin ajuda nas duas e diz quanto delas cabe hoje.

A página precisa deixar três coisas claras, nesta ordem:

1. o que o Merlin é, em uma frase;
2. que ele é de verdade, com o produto mostrado logo na primeira dobra;
3. que dá para começar agora mesmo, sem cadastro (depende da D1).

## A página, bloco a bloco

### 0 · Barra

`merlin` (logo) · construir, distribuir, o dia (âncoras para `#construir`, `#distribuir` e
`#o-dia`) · entrar · **[abrir o meu Merlin]**. "Baixar" ficou de fora (D7). A barra fica fixa no topo e ganha fundo com desfoque ao rolar.
No celular, ela mostra só o logo e o botão.

### 1 · Hero

- **Título**, com uma palavra na pílula verde com ponto, como o "● Pensam" do Notion. A copy
  final sai na etapa de copy, e estes são os candidatos de partida:
  - "você constrói sozinho. o Merlin faz o dia **● caber**."
  - "construir e distribuir no tempo que **● cabe** hoje."
  - "o assistente de quem faz o próprio **● SaaS**."
  - O título atual ("o dia é o único lugar com minutos") desce para o cartão largo do bloco 3,
    onde já vem explicado.
- **Subtítulo** de uma linha, como no Notion. Rascunho: *Desenhe o app e saia com o prompt para o
  Claude Code, monte o lançamento e saiba quanto disso cabe hoje.*
- **Botões:** "abrir o meu Merlin" como principal e um secundário que depende da D7.
- **A janela:** o início de verdade numa moldura de app, com a pergunta da hora ("Boa noite.
  Como fechamos o dia?", que é o `QUESTION` do `index.jsx`), o cartão do dia com a barra
  **se gastando em tempo real** e a sobra mudando. Ela roda os mesmos `distribute` e `fmt` do
  `day.js`, com dados de vitrine. É o "vídeo" da página: custa pouco e mostra o produto de
  verdade. Com `prefers-reduced-motion`, a janela fica parada.
- **Atrás da janela fica a floresta**, na fase da hora de quem visita (`phaseOf`): de manhã o
  amanhecer, de noite a torre com a janela acesa. É o equivalente das ilustrações do Notion, e é
  SVG, então pesa quase nada.

### 2 · Faixa "funciona com"

GitHub · Claude Code · Postgres · Mermaid · Markdown. A faixa só lista o que quem chega consegue
usar: o Merlin lê o GitHub público, sai com o prompt do Claude Code, o SQL do Postgres, o mermaid
e a especificação em markdown. Windows e Chrome saíram porque nem o app nem a extensão estão
publicados (D7). Os nomes vão escritos em cinza, e não como logotipo: assim não há marca de
terceiro para conferir.

### 3 · Os três trabalhos (bento)

Título candidato: "construir e distribuir disputam o mesmo dia."

| cartão | rótulo | frase | print |
| --- | --- | --- | --- |
| `#construir` | produtos | do conceito ao prompt do Claude Code. | o projeto de app (`apps.html`): o banco desenhado e a saída com SQL, mermaid e spec |
| `#distribuir` | distribuição | o funil de lançamento e as peças que ainda não foram ao ar. | o funil como grafo (`funnels.html`) com o quadro de conteúdo ao lado |
| `#caber` (largo) | hoje | só o dia tem minutos. | a barra que se gasta, a sobra e o rastreador do Windows por cima de outra janela |

### 4 · Veja o que o Merlin faz

Seis cartões pequenos, cada um com um ícone do `NAV_ICONS` e uma frase:

- escrever uma linha e o Merlin decidir se é tarefa, ideia ou pergunta (`routeLine`);
- fechar o dia em um minuto: cada tarefa aberta vira feita, amanhã ou largar;
- sessão de foco com recibo: quanto levou contra o que você estimou;
- "entregue hoje": os commits e PRs do dia, lidos do GitHub;
- começar um funil por um dos 39 modelos;
- um mapa mental que vira mermaid, ou um link só de leitura.

Na primeira versão os cartões não levam a nenhuma página. Páginas por caso de uso ficam fora
deste escopo.

### 5 · O seu dia é só seu

Este bloco fica no lugar dos depoimentos (D5). São três cartões grandes:

- **uma pessoa por vez.** Ninguém mais vê o seu dia, o seu cliente nem o seu financeiro (VISAO 2).
- **o Merlin propõe, você confirma.** Nenhuma resposta vira documento sem um clique.
- **funciona sem conta.** Tudo fica no navegador até você decidir entrar.

Opcional: um bloco do fundador. O Merlin é construído usando o próprio Merlin, e o bloco mostraria
o print de um dia real do Arthur e uma frase dele.

### 6 · Faixa de números

A faixa roda em loop, como a do Notion, e só usa fatos do produto: "39 funis prontos para
começar", "19 mapas prontos", "seis seções, um dia", "nenhum vermelho", "código por e-mail, sem
senha". As contagens precisam ser conferidas no `templates.js` na hora do build, para não
envelhecerem.

### 7 · Fechamento

"o dia de hoje ainda cabe." com os mesmos dois botões do hero.

### 8 · Rodapé

A frase do nome, como a citação de McLuhan no Notion. Colunas: produto, baixar, sobre e legal
(privacidade e termos, que passam a ser obrigatórios se a D1 coletar e-mail).

## Como é feita

- **Texto no HTML, sem depender do JS.** Tudo que é texto chega pronto no HTML, e o CSS entra por
  `<link>` no `<head>`. O React só monta ilhas: a janela do hero e a floresta, que reaproveitam o
  `day.js`, o `tasks.js` e o `forest.jsx`. O `index.jsx` continua sendo baixado por quem está na
  porta, porque é a entrada do `index.html`, e é ele que abre o onboarding no clique. O
  `landing.jsx` é um pedaço à parte (2,7 KB com gzip) que só quem está na porta baixa.
- **A pele é sempre a do Merlin.** Quem está na porta nunca entrou, então nunca tem
  `merlin:brand` nem `html.gl`. O `<link>` de fontes continua o do app, que só baixa as famílias
  que a página usa.
- **Celular:** é a mesma página medida em 390px, como o resto do sistema. O bento vira uma
  coluna, e a janela do hero vira o cartão do dia sozinho.
- **SEO e prévia de link:** `<title>` e description, imagem OG de 1200×630 com o hero, JSON-LD
  `SoftwareApplication`, `robots.txt` e `sitemap.xml`. `curl` em `/` precisa devolver o texto.
- **Orçamento de desempenho:** LCP abaixo de 2s em 4G, ilha com no máximo 50KB gzip, e nenhuma
  imagem rasterizada acima da dobra (a floresta é SVG).
- **Medição (ainda não feita):** Cloudflare Web Analytics para as visitas, porque já estamos na
  Cloudflare e ela não usa cookie, e liga-se pelo painel, sem código. Também um registro anônimo
  de três eventos: clicou em abrir, concluiu o onboarding e criou a primeira tarefa. Os eventos
  pedem uma rota nova e ficaram para depois. Sem eles, a lista de espera é o único número que a
  página produz.

## Decisões

| # | Decisão | Recomendação | Estado |
|---|---|---|---|
| D1 | **O que o botão principal faz.** Abrir sem conta, no navegador, é o que existe hoje, mas quem entra assim fica sem o assistente (`/api/merlin` exige sessão) e sem sincronização. As outras saídas são uma lista de espera ou cadastro aberto com créditos, e o cadastro depende da VISAO 8.6 (preço e créditos). | Abrir sem conta agora, com uma **lista de espera** para a conta com o assistente. O hero vende um assistente, e quem entra sem conta não consegue usá-lo. A página precisa dizer isso com honestidade ou resolver antes de ir ao ar. | **tomada** em 2026-10-10: o fechamento e o terceiro cartão de "o seu dia é só seu" dizem que a conversa e a sincronização pedem conta, e a fila grava em `/api/waitlist` |
| D2 | **Pele:** o escuro do Merlin ou o claro, à moda do Notion. | O escuro, porque é a identidade do Merlin, os prints são escuros e a floresta brilha no escuro. O claro (`html.light`, `#f2f2f0`) pode entrar depois, seguindo o sistema da pessoa. | **tomada**: desenhada no escuro. Como a página só usa os tokens do sistema, o claro veio junto e segue o sistema de quem visita, como o app; os dois foram conferidos |
| D3 | **Onde a página mora.** (a) `/` vira a landing estática e o início muda para `inicio.html`, com um script no `<head>` mandando quem já tem Merlin no navegador para lá antes da primeira pintura. (b) O Worker decide pela sessão (`run_worker_first` em `/`), mas o visitante sem conta não tem cookie e cairia na landing. (c) Um domínio separado só para a página. | (a). O buscador e a prévia de link leem `/`, e o Worker continua sem trabalho. O custo é trocar umas 28 referências ao início em `core.js`, `ui.jsx`, `index.css` e no `lib.rs` do desktop. | **tomada outra**, mais barata que a (a): a landing é escrita no próprio `index.html`, ao lado do `<main id="app">`, e o script do `<head>` põe `html.in` (esconde a landing) ou `html.bare` (esconde a barra e o dock). O buscador lê `/` com o texto inteiro, e o início não mudou de endereço: nenhuma referência, nem o desktop, precisou mudar |
| D4 | **Endereço:** continuar em `merlin.arttreis.com.br` ou ir para um domínio próprio (VISAO 8.6). | Decidir **antes** de publicar. Trocar o endereço depois apaga o que o buscador já aprendeu sobre a página. | em aberto |
| D5 | **Prova social:** sem depoimento de terceiros até existir usuário de fora. | O bloco "o seu dia é só seu", mais o bloco do fundador se o Arthur topar aparecer. | **tomada** sem o bloco do fundador, que depende do Arthur |
| D6 | **Assinatura no rodapé:** Arthur Reis, Guessless ou GL Suite. | — | **tomada** pelo Arthur em 2026-10-10: arttreis. "© 2026 Arthur Reis · arttreis.com.br" |
| D7 | **Baixar:** o app de Windows ainda não tem instalador público (hoje roda por `npm run dev` em `desktop/`). | Enquanto não houver instalador assinado, o botão secundário é "ver como funciona", que rola até o bento, e "baixar" leva só à extensão de Chrome. | **tomada**, mais estrita: a extensão também não está na loja, então "baixar" saiu da barra, e a faixa "funciona com" lista só o que quem chega consegue usar (GitHub, Claude Code, Postgres, Mermaid, Markdown) |

## Escopo

### Dentro

- Os blocos 0 a 8, em HTML estático, com o CSS da página.
- A ilha do hero (a janela com a barra viva e a floresta da hora).
- O redirecionamento de quem já tem Merlin no navegador (conforme a D3).
- Meta, OG, JSON-LD, robots e sitemap.
- A medição mínima (visitas e três eventos).
- A página de privacidade, se a D1 coletar e-mail.

### Fora (decidido, não esquecido)

- Página de preços. Depende dos créditos da VISAO 8.3 e 8.6.
- Páginas por caso de uso, blog e changelog público.
- Versão em inglês.
- Vídeo produzido. A janela viva cumpre esse papel na primeira versão.
- Instalador assinado do Windows, que vira um epic próprio.
- Cadastro aberto, créditos e cobrança.

## Ordem de trabalho

1. **Fechar D1 a D4.** Elas mudam o botão, a pele e o lugar da página.
2. **Copy:** título, subtítulo, as três frases do bento e os seis cartões. Os candidatos acima são
   só o ponto de partida.
3. **Prints:** uma conta de vitrine com dados plausíveis (um app desenhado, um funil, uma semana
   cheia) e o recorte de cada cartão do bento.
4. **Construção:** primeiro o HTML e o CSS, depois a ilha, a troca do início (D3) e por último
   meta, OG e medição.
5. **QA:** 390px e 1440px, Lighthouse, `prefers-reduced-motion`, `curl /` mostrando o texto e a
   prévia do link no WhatsApp.
6. **Publicar.**

Com as decisões fechadas, o `/plan-project` quebra os passos 3 a 5 em tickets.
