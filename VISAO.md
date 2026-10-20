# Merlin · visão

O `artt planner` deixa de ser um app para qualquer pessoa usar e vira **Merlin**: um sistema
de uma pessoa só, com vários módulos ligados entre si. O aparelho do dia continua sendo o
coração — o que muda é o que gira em volta dele.

Nasceu para o Arthur e hoje o time da Guessless entra pelo mesmo endereço, cada um no seu.
"Uma pessoa só" nunca quis dizer "um usuário": quer dizer que o dia, a fila e o número grande
são de quem os vive. Isso não mudou e não vai mudar.

Este documento é a fonte das decisões. O que está aqui é o que o código faz ou vai fazer; o que
não está, não existe ainda.

---

## 1. O nome

**Merlin**, decidido em 06/09/2026. O conselheiro do rei Arthur: não governa, aconselha; sabe o
que ninguém mais viu; está sempre um passo à frente do rei. É o Jarvis certo para alguém chamado
Arthur, e vem do folclore britânico como pedido.

O domínio é **merlin.arttreis.com.br**, também decidido. O nome puxa junto as chaves `merlin:*`
no `localStorage`, o worker `merlin-api` e o remetente `merlin@arttreis.com.br`.

---

## 2. Princípios

### Uma pessoa (07/09/2026: uma pessoa por vez)

O login por e-mail continua existindo porque é o que leva os dados ao celular e ao Safari. O
worker só aceita quem está em `OWNER_EMAILS`, no `wrangler.toml`. Outro endereço recebe uma
resposta idêntica à de sucesso e nenhum código é enviado.

O que mudou é que uma entrada dessa lista pode ser um **domínio** (`@guessless.com.br`), e é
assim que o time entra sem um deploy por pessoa. **Não** virou um sistema de várias pessoas: o
princípio continua inteiro, só passou a valer uma vez por pessoa em vez de uma vez só.

> Abrir a porta não é abrir a gaveta.

Todas as tabelas são por `person`, nenhuma consulta do worker cruza essa coluna, e cada e-mail
que entra ganha um Merlin inteiro. O que o time divide é o endereço, a chave da Anthropic e o
código — nunca o dia, o cliente, o funil nem o financeiro. Não existe responsável em lugar
nenhum, `@` no texto continua sendo cliente e não colega, e a fila do dia segue sendo de quem
vive o dia: é isso que faz o número grande ser confiável.

Duas coisas tiveram que existir para essa frase ser verdade:

- **O navegador guarda o Merlin de uma pessoa só.** As chaves do `localStorage` não têm dono —
  `merlin:ideas` é `merlin:ideas` para quem estiver na frente da tela. Numa máquina dividida
  isso vazava: quem entrasse depois de um colega subiria os documentos dele para a própria
  conta na primeira sincronização. Agora `merlin:who` guarda de quem é o navegador, e quando a
  identidade muda tudo que começa com `merlin:` sai **antes** de qualquer sincronização (tema e
  sidebar atravessam: preferência não é dado). Sair também limpa — a menos que haja coisa por
  subir, porque perder trabalho é pior que deixar dado na máquina, e a próxima pessoa a entrar
  apaga isso de qualquer jeito.
- **O conselheiro tem teto por pessoa.** A chave da Anthropic é uma só para o time. Sem conta,
  uma pessoa sozinha gastaria o mês de todo mundo e ninguém descobriria antes da fatura: a
  tabela `advice` conta os pedidos por pessoa por hora, e o teto é de quem gastou.

O Merlin conselheiro também deixou de falar do Arthur em terceira pessoa: o contexto agora é o
da casa (Guessless, GL Suite, os canais, o Stripe), e ele fala com quem está na tela sem supor
nome nem cargo.

### Uma cara só (19/10/2026)

De 07/09 a 19/10/2026 quem entrava por um e-mail `@guessless.com.br` via o Merlin com a
identidade da Guessless (fundo `#0A0A0A`, DM Sans, Manrope, o azul `#368DFF` e o logotipo da
casa). Saiu junto com o verde: o app inteiro passou a vestir o roxo do chapéu (seção 12), e duas
caras para um personagem só não fazem sentido. O domínio continua abrindo a porta
(`OWNER_EMAILS`); só a pele foi embora — `html.gl`, `merlin:brand` (apagada no navegador na
primeira carga), o lockup na barra e o e-mail azul.

O token de destaque continua se chamando `--accent` (até 08/10/2026 era `--green`).

### Só o dia tem minutos

O produto já tinha uma regra forte: *toda tarefa tem duração, e só existe um dia*. A caixa de
ideias mostrou como conviver com isso: o que está fora do dia **não custa minuto nenhum** até ser
puxado para dentro.

Esse é o princípio do sistema inteiro:

> Ideias, semana, mapas, funis, clientes e financeiro são **reservatórios**. Nenhum deles tem
> hora. O único lugar com hora é o aparelho do dia, e tudo entra nele pelo mesmo gesto: puxar,
> pagar o pedágio da duração, virar banda na barra.

Uma exceção, decidida pelo Arthur: **os cartões da coluna de hoje na semana entram na fila
sozinhos** ao abrir o dia. Vale porque colocar um cartão em "seg 7" já foi a decisão; o cartão
ganha a marca "no dia" e concluir a tarefa fecha o cartão. Prazo vencendo em qualquer outro
lugar continua sendo aviso, nunca tarefa que "rolou sozinha".

### Frentes: saíram (07/09/2026)

Por um tempo tudo no sistema podia pertencer a uma **frente** (a empresa: Artt Reis, Guessless,
GL Suite, o SaaS, Pessoal): cliente pertencia a uma, tarefa, ideia, funil e lançamento apontavam
para uma, e ela aparecia como selo em tudo.

Não pegou. O selo repetia o que o cliente já dizia, o `select` de frente entrava em toda caixa de
criar e a semana quebrava o dia em grupos por empresa sem que isso mudasse o que fazer primeiro.
Foram removidas por inteiro — cadastro, selos, `select`s, o `@frente` da gramática do dia, o
agrupamento da semana e a etiqueta do financeiro —, e o dado apagado: `purgeFronts()` no core roda
uma vez por navegador, apaga a coleção (as lápides sobem e a nuvem esquece junto) e tira o campo
`front` de tudo que já estava gravado. **O cliente é a única classificação que sobrou.**

### No celular

Nenhuma tela é "versão móvel": é a mesma tela, medida em 390px. O que muda é o gesto — a pinça
de dois dedos dá zoom no mapa e no funil, biblioteca e painel viram folhas que sobem de baixo, e
todo alvo de toque tem no mínimo 36px. **Enquadrar tem piso**: caber o funil inteiro numa tela
estreita dava 10% de zoom, com etapa de dois pixels que ninguém lê nem toca; abaixo do piso a
vista encosta no começo do funil e o resto se lê arrastando.

### Criar é sempre o mesmo gesto

Todo "novo X" do sistema é um botão que abre uma caixa (pop-up) com os campos —
`abrirFormulario` no núcleo. Nenhuma tela tem formulário aberto no meio da lista. A única
exceção é o campo do dia, que é a linha de comando do aparelho.

### Sidebar

A navegação é uma coluna fixa à esquerda, como um app: logo, **busca global** (`Ctrl+K`, procura
por título em ideias, clientes, semana, mapas, funis e lançamentos), as sete telas com ícone,
"o que é isso", o tema, e embaixo o cartão da nuvem e quem está entrando. Recolhe para só ícones
(`Ctrl+B`); no celular vira gaveta aberta por uma barra fina no topo.

**Atualização de 19/10/2026 (§13):** não há barra lateral desde 10/10/2026, quando o dock
embaixo tomou o lugar dela (§10). A navegação agora é a da §13: a faixa do alto com o botão
"menu", que abre as cinco áreas, e o dock só com as abas da área aberta.

### Dois temas

Escuro (`#0d0d0d`) e claro (`#f2f2f0`, branco), com o roxo `#8B5CF6` de destaque nos dois
desde 19/10/2026 (até ali era o verde `#2EE86B` do arttreis.com.br). O texto roxo usa
`--accent-ink`: `#A78BFA` no escuro e `#6D28D9` no claro, porque o roxo cheio não lê como
texto nos dois fundos. O botão de tema fica na
barra de navegação; a escolha persiste no navegador e segue o sistema quando não há escolha.

---

## 3. Arquitetura

Cinco páginas novas ao lado do dia, todas sem build e sem CDN, cada uma legível inteira,
como o `index.html` sempre foi. O que é comum vive em `shared/`. Desde 07/09/2026 a
tela é desenhada com o Preact local (`shared/preact.js`, com `htm` no lugar de JSX):
a página continua uma só, o que muda é que o JS descreve a tela em vez de montar string. O
plano e o estado da migração estão em `MIGRACAO.md`.

```
index.html             o dia (aparelho) — o que já existia, com barra de navegação
ideas.html            caixa de ideias com corpo, estágio e desenvolvimento
week.html            a semana em colunas
maps.html             mapa mental
funnels.html             funil: mapa com tipos de nó e vazão
clients.html          clientes, canais, objetivos, backlog
finance.html        do jeito da planilha: mês dia a dia, ano, painel de fixos/cartão/dívidas
shared/
  base.css             tokens dos dois temas + navegação + componentes comuns
  core.js            utilidades, tema, sessão/nuvem, coleções sincronizadas, caixa de entrada do dia
  preact.js            preact + hooks + htm num arquivo, copiado do node_modules (npm run preact)
  ui.js                a camada de tela: hooks que ligam às coleções, diálogo, formulário, selos, ícones
server/              o mesmo worker; ganha /api/docs genérico e a trava de e-mail
```

### Coleções sincronizadas

Cada módulo guarda **documentos por entidade** (uma ideia, um cliente, um mapa) numa coleção. A
coleção mora no `localStorage` em `merlin:<tipo>` e sobe para a tabela `docs` do D1, com o mesmo
carimbo `v` e a mesma regra do dia: o servidor recusa gravação mais velha e devolve a dele. Por
ser por entidade, editar um cliente no celular não sobrescreve uma ideia criada no desktop.

O dia continua sendo um documento por data na tabela `dias`. Nada muda ali.

### Caixa de entrada do dia

Nenhum módulo mexe no documento do dia. Quem quer mandar algo para hoje escreve na fila
`merlin:inbox` (`{titulo, min?, cliente?, origem}`) e o dia a esvazia ao abrir ou ao
receber o evento de `storage`. Com duração, vira tarefa; sem duração, cai na caixa de ideias do
dia e passa pelo pedágio de lá. É um gesto só, sem acoplamento.

### O que não muda

Design system, worker na Cloudflare com D1, login por código, desfazer, "toda tarefa tem
duração", o aparelho e a barra que se gasta.

---

## 4. Os módulos do sistema

### 4.1 O dia (`index.html`)

O que existe, mais:

- `@cliente` no campo de nova tarefa, com selo na linha.
- Caixa de ideias do dia passa a ler a mesma coleção de `ideas.html`.
- Esvazia a caixa de entrada.
- Barra de navegação e tema.

### 4.2 Ideias (`ideas.html`)

Semelhante ao financeiro em estrutura: não é uma lista solta, é um lugar organizado.

- **Corpo**: título e texto livre (markdown simples).
- **Estágio**: `semente → explorando → definida → executando → arquivada`. Filtro por estágio.
- **Ramificações**: lista de próximos passos/perguntas dentro da ideia (checklist).
- **Saídas**: "puxar para o dia", "abrir mapa mental" (cria um mapa com a ideia no centro),
  "virar projeto de cliente" (leva para clientes com o texto).
- **Quadro por estágio** como visão alternativa à lista.
- Sincroniza como coleção; a caixa do dia mostra as não arquivadas.

### 4.3 Semana (`week.html`)

Inspirado no quadro do parceiro no Google Tarefas: colunas `seg · ter · qua · qui · sex · fim
de semana`, e dentro de cada coluna uma lista só de cartões.

- Cartão: título, cliente opcional, duração opcional, feito.
- Arrastar entre colunas.
- "Hoje" é destacado; **puxar para o dia** manda o cartão pela caixa de entrada.
- Semana atual e navegação para a próxima/anterior. O que ficou aberto na semana passada
  aparece numa faixa "ficou de trás", com a escolha de trazer ou arquivar. Nada rola sozinho.
- Modelo de recorrência simples: cartão marcado como "toda semana" reaparece na semana nova.

### 4.4 Mapa mental (`maps.html`)

Referência: MindMaster / XMind. O que faz um mapa ser bom é **teclado e layout automático**.

- `Enter` irmão, `Tab` filho, `Shift+Tab` sobe, `Delete` apaga o ramo (com desfazer), setas
  navegam, `F2`/digitar edita, `Espaço` colapsa/expande.
- Layout automático em árvore, balanceado dos dois lados do centro. Arrastar ramo para outro pai.
- Pan e zoom (scroll, `Ctrl+scroll`, pinça de dois dedos, `Ctrl+0` enquadra).
- Nó: título, nota, cor de ramo (as tintas + o verde), link.
- Exportar PNG e outline em markdown.
- Vários mapas, cada um ligado opcionalmente a ideia, cliente ou funil.
- **Modelos**: 19 mapas prontos (plano de campanha, estrutura da oferta, avatar, roteiro de
  VSL, cliente novo, ecossistema de canal, trimestre, decisão…), escolhidos na mesma caixa de
  criar. O nome digitado vira a ideia central e os galhos do modelo nascem nela, cada um de
  uma cor.
- SVG próprio, sem biblioteca.
- **A barra de cima é só o indispensável**: voltar, o nome, o merlin e o enquadrar. Exportar e
  atalhos moram no "mais" — são coisas de uma vez na vida e não merecem ocupar tela em cima do
  mapa. O `+` flutuante cria filho do nó selecionado, para quem está sem teclado.

### 4.5 Funil (`funnels.html`)

Mapa com **tipos de nó**, **fluxo direcionado** e **números em cima**.

- Grafo em camadas da esquerda para a direita; posição manual permitida.
- **Só etapa entra como nó**, decidido em 07/09/2026. O teste é: dá para dizer "N pessoas
  estiveram aqui" e "X% passaram daqui para a próxima"? O que não passa não é etapa. Por isso
  **CTA** virou campo da página (o clique nele é a *aresta*, não o nó), **bump** virou oferta do
  checkout (acontece na mesma tela, sem passagem) e **remarketing** virou automação (é caminho
  de volta). Funis salvos e modelos antigos migram sozinhos na leitura, com as taxas médias
  multiplicadas na costura: `lp>cta 30%` + `cta>checkout 90%` viram `lp>checkout 27%`.
- 27 tipos, em prateleiras na ordem em que o lead anda: **aquisição** (tráfego, impressão,
  anúncio, clique — separar impressão de clique é o que faz o CTR virar uma taxa visível),
  **página** (LP, VSL, webinar, produto), **captura** (captura, qualificação, DM, grupo),
  **relacionamento** (e-mail, WhatsApp), **venda** (agendamento, call, proposta, fechamento),
  **compra** (carrinho, checkout, pagamento, obrigado — checkout iniciado ≠ pagamento aprovado,
  e é no pix e no boleto que se perde depois da compra), **depois** (upsell, downsell, ativação,
  recompra) e personalizado. Cada um com campos próprios (URL, plataforma, preço, custo). O
  checkout nasce com **Stripe**, que é o da casa. O verde marca só onde entra dinheiro — a
  página de obrigado ficou de fora, porque ela confirma a venda que já entrou no checkout.
- **A próxima etapa aparece sozinha**, decidido em 07/09/2026. Ao soltar uma etapa, até três
  cartões tracejados nascem à direita dela, cada um com o porquê ("a página sem formulário não
  vira lead"); um clique vira etapa de verdade, já ligada, e a nova mostra a tira dela — o funil
  se desenha a clique por etapa. Isso **não** é IA: é uma gramática local de 27 tipos e 65
  passagens, que responde no mesmo quadro, offline e de graça. O Merlin entra só se chamado, na
  linha embaixo da tira, e o que ele faz é trocar o genérico ("checkout") pelo concreto daquele
  funil ("checkout Stripe do plano anual").
- **Vazão**: cada nó tem pessoas no período; cada aresta mostra a taxa real (calculada) e uma
  **taxa média** esperada, digitada. Onde falta número real, o funil projeta a partir da média
  (em cinza, com "~"). A diferença entre real e média é o que a tela quer mostrar. Números
  continuam manuais; Meta Ads e pixel ficam para depois, por decisão.
- **Modelos**: 39 funis prontos, com as etapas, as ligações e as taxas médias esperadas já
  preenchidas — de captura com isca, tripwire, VSL perpétua, lançamento e high ticket a
  carrinho abandonado e recompra. Pelo menos **dois por canal** (mercado livre, shopee, tiktok
  shop, amazon, site, instagram, google, whatsapp, e-mail), que é o que amarra o funil ao canal
  do cliente (4.6). Escolher é um `<select>` na caixa de criar; a taxa média vem como ponto de
  partida, para ser corrigida com o número real.
- Período selecionável; retratos com data para comparar.
- **A barra de cima é só o indispensável**: voltar, o nome, biblioteca, painel, o merlin e o
  "mais" (enquadrar, arrumar, fantasmas, zoom). A roda, a pinça e as teclas `+ - 0` dão zoom,
  então não há régua por cima do palco.
- Pertence a um cliente e a um **canal** (4.6).

### 4.6 Clientes (`clients.html`)

O que um cliente tem:

- **Ficha**: nome, contatos, links (site, redes, Drive, ClickUp, Meta Ads), status
  (`prospecto → proposta → ativo → pausado → encerrado`).
- **Contrato**: escopo, valor, recorrência, início/fim. Não gera "a receber" sozinho: nem
  todo cliente paga fee ao Arthur (decisão).
- **Canais**: Mercado Livre, Shopee, TikTok Shop, Amazon, site próprio, Instagram, etc. Cada
  canal tem a **estrutura** dele: um checklist do que precisa existir (conta, catálogo, frete,
  anúncios, avaliações, pixel…), com o que já foi feito e o que falta. Vem de um modelo por tipo
  de canal, editável por cliente. Um canal pode ter funis ligados — e o "novo funil" dentro do
  canal já oferece os modelos daquele canal, criando o funil ligado ao cliente e ao canal. É o
  que responde "nesse cliente ainda não fiz X".
- **Objetivos** com resultado-chave e prazo, cada um com planejamento (checklist ou mapa).
- **Backlog**: tarefas sem hora, com prazo opcional, cliente já preenchido; "puxar
  para o dia".
- **Diário**: notas de reunião, decisões e entregas com data, só append.
- **Painel do cliente**: objetivos, prazos, canais incompletos, último contato.

- **Cofre**: acessos do cliente (rótulo, usuário, segredo, URL, nota) guardados **cifrados** no
  documento, com AES-GCM e chave derivada de uma senha-mestra por PBKDF2. A senha fica só na
  memória da sessão; o servidor nunca vê texto puro; perder a senha perde o cofre, sem
  recuperação — é escolha.

### 4.7 Financeiro (`finance.html`)

Do jeito da planilha "Controle Financeiro" que o Arthur já usa (redesenhado em 07/09/2026 a
partir dela). Três abas:

- **Mês**: uma linha por dia com entradas, saídas e **saldo previsto** ao fim de cada dia (a
  aba anual da planilha). Em cima: saldo hoje, fim do mês, **diário** (sobra ÷ dias que
  faltam, a mesma lógica da barra do dia), entradas e saídas. A linha expande e mostra o que
  cai naquele dia; o que é projeção (fixo, parcela) se confirma com um clique e vira lançamento.
- **Ano**: os doze meses lado a lado, cada um com o saldo de cada dia — positivo em verde,
  negativo em hachura. Clicar no mês abre a aba do mês.
- **Painel**: as quatro tabelas do DASHBOARD da planilha — **saídas fixas** e **entradas
  fixas** (nome, categoria, dia, valor), **cartão de crédito** (compras parceladas: nome,
  cartão, parcelamento "3/12", total) e **dívidas** (nome, pessoa, valor, pago) — cada uma com
  o total e o "+" que abre a caixa. Embaixo, a **divisão 50/30/20** sobre as entradas fixas e
  a sobra dos fixos.
- **Lançamentos** avulsos: entrada ou saída, valor, data, categoria, pago/previsto.
- **Config**: saldo inicial (o marco a partir do qual a conta anda), percentuais da divisão e
  categorias.

Fora: assinaturas e planos de compra (apagados em 07/09/2026), conta/cartão por lançamento,
conciliação bancária, extrato, NF.

### 4.8 Merlin, o conselheiro

O que só uma IA faz bem, sempre passando pela decisão de quem está na tela: nada entra sozinho.
A sugestão em lote abre num diálogo com caixas de marcar; a sugestão de um item só é desenhada
tracejada no próprio palco, onde ela nasceria, e um clique é que a torna real.

- **Feito**: rota `/api/merlin` no worker (chave `ANTHROPIC_API_KEY` como segredo, modelo
  `claude-opus-5-5`) com dez tarefas: **ramos** (mapa mental, nó selecionado), **funil** (o que
  falta: etapas, automações, criativos, ofertas, gatilhos), **próxima etapa** (o que vem depois
  de uma etapa só, para refinar a tira de fantasmas do funil), **ramificar** (perguntas, caminhos
  e passos para uma ideia), **semana** (resumo do que fechou e ficou), **reunião**
  (pauta com um cliente, que pode ir para o diário), **números** (onde o funil está perdendo),
  **hábitos** (o mês que passou), **revisão** (o período de planejamento) e **delegar**, abaixo.
- **Ramos do mapa como fantasma**, decidido em 07/09/2026. O `S` continua sendo o gatilho, mas
  a resposta deixou de ser um diálogo de caixinhas: os ramos aparecem tracejados no lugar exato
  onde nasceriam, e clicar em um fica com aquele — os outros somem. Eles nunca entram no
  documento (vivem só na árvore que vai para o layout), então o espaço já fica reservado, nada
  pula quando um vira real, e não há o que desfazer se você dispensar com `Esc`.
- **"Dá pra fazer com Claude?"** (`task: "delegate"`), decidido em 07/09/2026. A pergunta que o
  Arthur já faz sozinho o tempo todo vira botão nos dois lugares onde a demanda aparece antes
  de custar minuto: a linha da fila do dia (*isso* dá pra fazer com Claude?) e o item de backlog
  do cliente (*essa demanda* dá pra fazer com Claude?). O Merlin responde com um veredicto —
  **dá**, **dá em parte** ou **não dá** —, o que exatamente o Claude faria e com qual forma
  (Claude Code numa pasta, uma skill, um agente ligado por MCP a uma ferramenta que ele já usa,
  um artifact, um agente agendado, ou a API dentro de um produto), o que precisa existir antes,
  o que continua sendo trabalho do Arthur e, quando há estimativa, em quantos minutos a demanda
  ficaria com o Claude fazendo a parte dele. É o que amarra a feature ao princípio da casa: o
  veredicto mexe em minutos.
  Nada é gravado. Quando o veredicto é de que dá, a resposta termina numa linha `Montar: …` e
  um botão manda **isso** — o que precisa ser montado, não a demanda — para a caixa de entrada
  do dia, sem duração, porque minutos são assunto do dia. Quando não dá, não há linha nem
  botão: o Merlin não inventa trabalho para justificar a própria resposta.
- **O assistente da busca**, decidido em 17/09/2026: a tarefa `assistant` recebe mensagem livre
  e propõe no máximo uma ação de um catálogo fechado de oito tipos (tarefa, nota, bloco de
  rotina, atualização de lead, mapa ou funil de onboarding, roteiro, item de vitrine) —
  `ASSISTANT_ACTIONS` no worker sanitiza tipo e campos antes de qualquer coisa chegar perto de
  um `save()`. A busca global da sidebar ganhou uma faísca que leva o que está escrito para essa
  conversa — ela chegou a perder o filtro por nome nesse dia, e o recuperou em 22/09: achar pelo
  nome e perguntar são dois gestos, e um não faz o trabalho do outro.
- **Tela própria e histórico real**, também 17/09/2026: o que antes era uma caixa em cima da
  busca (parecia chat, mas cada turno subia sozinho pro servidor) virou `assistant.html`, com
  entrada própria na barra. Ela manda o histórico da conversa a cada pergunta, e é o worker quem
  monta os turnos de verdade pro Claude — sem tabela nova no D1. Mapa e funil de onboarding,
  quando confirmados, levam direto ao documento pronto em vez de voltar pra conversa. Isso fecha
  o item 13 da ordem de construção (§5).
- **A conversa passou a ficar**, em 22/09/2026: ela era só estado do React e sumia ao navegar —
  o que transformava cada pergunta num recomeço. Virou a coleção `chats`, local-first como
  todas as outras (nenhuma tabela nova: `docs` guarda documento de qualquer tipo), com endereço
  por conversa e histórico numa coluna ao lado. Junto vieram três começos na tela vazia (mapa
  mental, funil, simulação financeira), que não executam nada — só prefixam a mensagem —, a
  resposta lida como markdown, e o saldo do financeiro disponível de qualquer tela
  (`shared/finance-data.js`), pra "posso assumir 3 mil por mês?" ter resposta sem a pessoa
  precisar abrir o financeiro antes.

---

### 4.9 Hábitos (`habits.html`) — a construir

Pedido do Arthur em 07/09/2026, para depois da migração ao Preact: um lugar para acompanhar o
próprio desenvolvimento, não o trabalho. Um hábito não é tarefa: não tem hora nem duração,
tem **frequência** e um **registro por dia**.

- **Hábito**: nome, frequência (`todo dia`, `N vezes por
  semana`, `dias da semana`), duração sugerida opcional, cor (as tintas + o verde), ordem,
  arquivado.
- **A grade**: hábitos nas linhas, os dias do mês nas colunas, uma marca por célula. É a tela
  inteira: nada de gráfico antes da grade. Ao lado de cada hábito, a sequência atual, o melhor
  mês e a taxa do mês (`feitos ÷ esperados`). Navegação por mês; hoje destacado por borda,
  como na semana.
- **Só o dia tem minutos**: marcar o hábito na grade é registro, não tarefa. Quem quer
  reservar tempo para ele hoje **puxa para o dia** com a duração sugerida
  (`sendToDay({origin:{type:"habit", id}})`); concluir a tarefa no dia marca o hábito na
  data, como a semana faz com `inDay`. O dia continua sem saber o que é hábito.
- **Merlin**: `task: "habits"` recebe o mês (marcas por hábito e frequência esperada) e
  devolve um texto curto: o que segurou, o que caiu, um ajuste para o mês que vem.
- Coleção `habits` (`merlin:habits`), um documento por hábito:
  `{id, name, schedule:{type:'daily'|'perWeek'|'weekdays', times, weekdays:[0-6]},
  min, color, order, archived, marks:{'YYYY-MM-DD': true}, createdAt, updatedAt}`. As marcas
  moram dentro do hábito porque um mês inteiro cabe em poucos bytes e um hábito é editado
  por uma pessoa só.

### 4.10 Planos (`plans.html`) — a construir

O mesmo pedido: planejamento **trimestral, mensal e semanal**, com "o que está aberto no meu
trimestre / no meu mês / na minha semana" visível de um lugar só.

- **Três colunas, três horizontes**: trimestre atual, mês atual, semana atual, lado a lado.
  Cada coluna lista os objetivos daquele período, com feito/aberto e a
  contagem no topo ("4 abertos no trimestre"). Navegação por período em cada coluna.
- **Desdobrar**: um objetivo do trimestre pode ser desdobrado no mês (cria um objetivo no mês
  com `parent` apontando para ele), e o do mês na semana. Concluir todos os filhos não fecha
  o pai sozinho: fechar é decisão, nunca rola.
- **Puxar**: um objetivo da semana vira **cartão da semana** (grava na coleção `week` com
  `origin:{type:"plan", id}`), e dali entra no dia pelo gesto de sempre. É a ponte entre
  planejar e fazer, sem duplicar o aparelho do dia.
- **Revisão**: no fim de cada período, três campos livres — *o que foi*, *o que não foi*,
  *o que muda* — e o Merlin (`task: "review"`) propõe a revisão a partir dos objetivos e do
  que a semana e o dia registraram como feito. Quem escreve é o Arthur; o Merlin só sugere.
- Coleção `plans` (`merlin:plans`), um documento por período:
  `{id, kind:'quarter'|'month'|'week', period:'2026-Q4'|'2026-09'|'2026-W37',
  goals:[{id, text, client, done, parent, order}], review:{went, didnt, next},
  createdAt, updatedAt}`.
- A sidebar ganha duas telas: **hábitos** e **planos**. A busca global passa a procurar em
  objetivos e hábitos.

O que fica fora, de propósito: metas com número (OKR com percentual), lembrete/notificação e
qualquer gráfico antes de existir um mês inteiro de marcas.

### 4.11 Rotina (`routine.html`) — 13/09/2026

A **semana de sempre**: o que se repete toda semana, com dia e hora. Pedido do Arthur, que
escolheu "semana-modelo" entre três leituras de rotina (sequência de blocos, semana-modelo,
checklist recorrente).

Ela já existia espalhada: o botão **"toda semana"** fazia de uma tarefa a mãe que se copiava
para a semana aberta. Não havia onde ver a rotina inteira, mudar a mãe não mudava as cópias e
a cópia era reconhecida pelo título. O botão saiu, e as mães viraram blocos numa migração
(`fromRecurring`, que roda sozinha no calendário e no início).

- **A tela** é a grade de horas da semana sem datas, dom a sáb (a folha é a mesma:
  `shared/week-grid.css`). Clicar num espaço vazio cria ali; arrastar muda dia e hora; a borda
  de baixo muda a duração. Tela vazia oferece blocos prontos (daily, almoço, weekly…).
- **Um bloco, vários dias.** "Almoço 12h, seg a sex" é um bloco só: mudar a hora muda todos
  os dias, porque é isso que a frase quer dizer. Quem quer a sexta diferente tira a sexta do
  bloco e cria outro.
- **Vira tarefa quando a semana chega.** O calendário e o início copiam os blocos para a
  semana que abrem (o início, sempre a atual), com `origin:{type:"routine", id}`. Cada bloco
  guarda em `weeks` os domingos em que já se copiou: apagar a cópia de uma quinta não a faz
  renascer, e as duas telas abertas juntas não duplicam. Dia que já passou não ganha cópia.
  Ao abrir, as duas também recolhem a caixa de entrada do dia (`merlin:inbox`, onde o "puxar
  para o dia" dos hábitos escreve), zerando-a antes de gravar: quem só usa o celular e nunca
  abre o calendário vê a tarefa no início.
- **Uma sobra só (17/10/2026).** A cópia de um bloco do tipo rotina não aparece na lista do
  calendário, mas conta na sobra do dia em todas as telas: o almoço de 60 minutos que vem da
  rotina tira os mesmos 60 minutos no calendário, no início, no rastreador e na resposta do
  Merlin (`dayTasks` em `shared/tasks.js`). Antes, o calendário a tirava da conta junto com a
  lista, e mostrava uma sobra maior que as outras telas.
- **Mudar o bloco muda daqui pra frente, menos o que você mexeu.** Mexer é a cópia ter título,
  hora, duração, cliente ou "reunião" diferente do bloco de antes. Apagar o bloco leva as
  cópias futuras intocadas, com desfazer.
- **Só o dia tem minutos** continua valendo: a rotina é mais um reservatório, e a cópia é uma
  tarefa comum — a semana mostra, o dia cobra.
- **Uma rotina só.** "Semana normal" e "semana de lançamento" ficam para quando fizer falta.
- Coleção `routine` (`merlin:routine`), um documento por bloco:
  `{id, title, days:[0-6], at, min, reserved, client, weeks:{'YYYY-MM-DD': true},
  createdAt, updatedAt}`. A regra inteira mora em `shared/routine.js`, pura e testada.

### 4.12 Conteúdo (`content.html`) — 02/10/2026, EPIC-1

Um kanban de seis etapas (ideia → roteiro → gravar → editar → agendado → publicado), um cartão
por peça, e o roteiro mora dentro do cartão. Desde o EPIC-1 (`docs/prd/epic-1-conteudo-que-ajuda-a-criar.md`)
a tela **ajuda a criar**, e não só guarda o que já foi criado.

- **Molde por formato.** Reels, story, carrossel, YouTube, e-mail e outro têm cada um o seu
  esqueleto de bullets. Com o roteiro vazio, a pílula "começar pelo molde de {formato}" aplica o
  molde. Trocar o formato troca o molde só se ele ainda estiver intocado.
- **O Merlin na peça.** Uma faixa entre a ficha e o roteiro mostra as ações da etapa atual. As
  outras ficam em "outras". As ações são: ideia → 5 ângulos; roteiro → escrever roteiro e 3
  ganchos; gravar e editar → produção; agendado → publicação; publicado → desdobrar. Produção e
  publicação viram **seção do roteiro** (`## produção`, `## publicação`); a peça continua tendo
  um único texto.
- **Peças novas a partir do que existe.** "Desdobrar" transforma uma peça em até 5 derivadas, que
  guardam a origem em `parent` e se mostram dos dois lados. "Puxar pautas" (no topo e no quadro
  vazio) lê a ficha do cliente e propõe até 8 peças. Só as marcadas nascem, todas em ideia e
  sem data, e um desfazer apaga todas.
- **Ritmo: o topo diz o que falta.** O ritmo define quantas peças por dia ou por semana, por
  dono e, se quiser, por formato e por dia da semana. O conteúdo próprio nasce com 1 por dia. O
  topo abre com "hoje ainda sem peça · faltam 3 dias nesta semana" ou "falta 1 carrossel nesta
  semana". Dia que passou vazio não vira cobrança, e a falta sai em tom neutro. Clicar numa
  falta preenche a semana com ideias sem data ou, sem ideia, puxa pautas já com o cliente e o
  formato.
- Coleção `cadence` (`merlin:cadence`), com um documento por dono: id do cliente, ou `me` para o
  conteúdo próprio, no formato `{id, rules:[{id, n, per:"day"|"week", format, days:[0-6]}]}`.
  Ritmo zerado é uma lista vazia gravada, e isso é diferente de nunca ter mexido.
- A regra inteira (moldes, `setHook`, `upsertSection`, `contentContext`, a conta do ritmo) mora
  em `shared/content-script.js`, pura e testada em `content.test.mjs`.

**Decisões do EPIC-1:**
- **D1.** A lógica da `roteiro-viral` (parar o scroll, segurar, virar, converter) é a base de
  toda recomendação. Em Reels e story ela é a própria estrutura; nos outros formatos entra
  dentro do molde.
- **D2.** O ritmo é configurável, com padrão de 1 peça por dia para o conteúdo próprio, e mora
  numa coleção própria.
- **D3.** As seis etapas e os seis formatos não mudam.
- **D4.** O que vem depois do roteiro entra no próprio roteiro, como seção.

O Merlin propõe e a pessoa decide: nada grava sem clique e toda troca tem desfazer. O Merlin
não inventa número nem case, e o dado que falta sai marcado com `[conferir]`. Cada botão é uma
chamada a `/merlin` e conta no teto de 30 por hora.

### 4.13 Projetos de app (`apps.html`) — 08/10/2026

O mapa mental servia para pensar solto, mas desenhar um app nele dava num monte de caixa que não
sabia o que era: uma tela e uma tabela eram o mesmo retângulo, e nada saía dali pronto para
construir. O projeto de app é o mesmo desenho **com forma**.

> O mapa é para pensar. O projeto é para construir.

- **Conceito**: a frase, o problema, para quem, a proposta, a stack e as notas; funcionalidades
  com fase — **primeira versão**, **depois**, **talvez**. Funcionalidade vira tarefa pelo mesmo
  `TaskDialog` de sempre: nada entra no dia sem duração.
- **Dados**: entidades com campos, tipo, chave, obrigatório, único e **relação** (o campo aponta
  para outra entidade). Num palco: a seta sai do campo e chega na tabela apontada.
- **Fluxos**: telas (o que é, o que tem, que dados usa, qual é a entrada) e as **ações** que levam
  de uma à outra. Puxar a bolinha de uma tela até outra cria a ação.
- **Exportar**: o que falta antes de construir (relação sem alvo, tela que nenhum caminho
  alcança…) e cinco saídas — o prompt para o Claude Code, a especificação em markdown, o SQL do
  Postgres, o mermaid do banco e o dos fluxos.
- **Lançamento**: o app se liga a um funil (ou cria o de "SaaS com teste grátis") e às peças de
  conteúdo — que continuam morando nas telas delas, com o campo `app` apontando para cá.
- **Merlin**: rascunha o projeto a partir de duas frases (tarefa `app`) e revisa o que está
  desenhado (`appReview`). O rascunho é **proposta**, como no assistente: aparece inteiro e só
  entra quando a pessoa junta — e juntar nunca troca o que ela escreveu.

É também a aposta do produto: desenhar o app e o funil dele no mesmo lugar, e sair com tudo
pronto para construir e lançar. Ninguém junta produto, marketing e execução assim.

---

## 5. Ordem de construção

| # | Etapa | Estado |
| --- | --- | --- |
| 0 | Fundação: nome, tema claro, navegação, `shared/`, `/api/docs`, trava de e-mail | feito |
| 1 | Ideias | feito |
| 2 | Semana | feito |
| 3 | Clientes com canais | feito |
| 4 | Financeiro | feito |
| 5 | Mapa mental | feito |
| 6 | Funil | feito |
| 7 | Vazão real (Meta Ads, pixel) | depois |
| 8 | Merlin conselheiro (mapa, funil, ideias, semana, reunião, números) | feito |
| 9 | Sidebar, busca global, cofre cifrado, taxa média no funil, cartões de hoje no dia | feito |
| 10 | Migração para o Preact e para o inglês (`MIGRATION.md`) | feito |
| 11 | Hábitos (`habits.html`) e Planos (`plans.html`) | feito |
| 12 | Segunda migração: Preact → React 19 com Vite (`MIGRATION.md`, seção 10) | feito |
| 12b | Rotina (`routine.html`), no lugar do "toda semana" da tarefa (seção 4.11) | feito |
| 13 | Entrada em linguagem natural para o sistema todo (seção 4.8) | feito |

---

## 6. Decidido e em aberto

Decidido em 06/09/2026:

1. **Nome**: Merlin. **Domínio**: merlin.arttreis.com.br.
2. **"TA" no funil** era **CTA** — o tipo já existe como etapa, com texto do botão e destino.
3. **Empresa de tecnologia**: GL Suite (glsuite.io).
4. **Checkout**: Stripe, o padrão do nó de checkout.

Decidido em 07/09/2026:

5. **Cofre de acessos**: dentro do app, com cifra local.
6. **Clientes**: nada de importar; entram conforme a necessidade.
7. **Semana → dia**: os cartões de hoje entram no dia sozinhos.
8. **Vazão no funil**: taxa média digitada por etapa, sem integração por enquanto.
9. **Merlin**: as quatro pontas que faltavam (ideias, semana, reunião, números) foram feitas.
10. **Financeiro ↔ clientes**: contrato não gera "a receber" (nem todo cliente paga fee).
11. **Planilha**: sem importador.
12. **Navegação**: sidebar, não barra no topo.
13. **Stack**: HTML/JS/CSS sem build e sem CDN continua; em 07/09/2026 entrou o Preact local
    como única dependência de tela (ver `MIGRATION.md`). (A página "o que é isso" foi apagada
    em 07/09/2026; a leitura fica neste documento e nos READMEs.)
    **Hospedagem** (revista em 18/10/2026): fica na Cloudflare (Worker + D1 + R2). Site e API
    no mesmo domínio é o que segura o cookie `SameSite=Lax`; o servidor só guarda documentos
    por `person`; custo e operação ficam perto de zero. Vercel + Neon, Supabase, Firebase,
    Fly.io/VPS e Deno Deploy foram comparados e nenhum resolve um problema que o Merlin tem.
    Se um dia precisar de sync em tempo real, a resposta são Durable Objects, sem migrar.
    Só reabrir se o Merlin virar produto para muitos clientes com consultas relacionais
    (aí Postgres) ou se offline com merge de conflitos virar requisito central.

14. **Inglês em tudo**: identificadores, chaves, campos dos documentos, rotas, tabelas e
    classes de CSS. Só o texto de tela e os comentários seguem em português. Sem migração
    dos dados gravados com os nomes antigos.
15. **Hábitos e planos** (seções 4.9 e 4.10) entram depois da migração terminar.

Em aberto: o que a seção 8 deixou em aberto (8.6).


---

## 7. A coletânea de 08/09/2026

Vinte e três incômodos de uma vez, atacados em seis lotes. O que eles tinham em comum não era
uma lista de defeitos: era que o sistema **sabia fazer coisas que ninguém descobria**, e recebia
quem chegava com uma fila de minutos.

### 7.1 O que mudou de estrutural

**O início é a porta, o dia é o destino.** `index.html` deixou de ser o dia e virou uma página
inicial no sentido do navegador: um campo no meio (escreva qualquer coisa — com duração vai para
a fila de hoje, sem duração cai na caixa de ideias) e os atalhos embaixo, cada um dizendo o
número que faria você abrir aquilo. O dia mudou para `day.html`, inteiro, sem perder nada.

A conta do dia saiu para `shared/day.js`. O motivo não é organização: o início e o dia precisam
responder "quanto ainda cabe hoje", e uma sobra calculada de dois jeitos são duas verdades sobre
o mesmo dia — a que aparecer primeiro é a que a pessoa acredita.

**O perfil existe.** `profile.html`: a sessão, a aparência, a apresentação e o inventário do que
está guardado. O tema morava solto no fim da barra, ao lado de nada; agora é uma linha do perfil
— e ganhou a terceira resposta que o interruptor não sabia dar, que é seguir o sistema.

**A apresentação.** Quatro frases na primeira visita: só o dia tem minutos; nada entra sozinho;
criar é sempre o mesmo gesto; o que é seu fica seu. Não é um passo a passo — são quatro cartões,
e quem ler dois e fechar leu o que precisava.

### 7.2 Tela vazia oferece, não avisa

Clientes, financeiro e hábitos começavam com uma frase cinza. Agora começam com uma lista:

- **Clientes**: nove tipos de negócio (seller no ML, marca com loja própria, serviço local,
  infoprodutor…). Escolher um monta os canais com o checklist de cada um, os objetivos que
  aquela operação persegue e o backlog do que precisa existir antes. O mesmo seletor entrou na
  caixa de criar — é o "modelo da página de clientes".
- **Financeiro**: cinco esqueletos de mês, com o dia de vencimento e a categoria de cada linha
  fixa e **o valor em branco**. O valor é a única coisa que ninguém pode adivinhar, e inventar
  um faria a planilha parecer pronta.
- **Hábitos**: quinze sugestões com frequência e duração já escolhidas. Marcar não cria na hora:
  criar um por clique faria a lista sumir embaixo do dedo assim que o primeiro entrasse.

É um componente só (`EmptyStart`), porque era um problema só.

### 7.3 A barra perdeu peso, e o perfil virou o cartão de quem está aqui

Houve uma tentativa de dar às dez tarefas do conselheiro um lugar próprio: um item **merlin** na
barra, abrindo a lista do que ele faz em cada tela. Ela foi construída e desfeita no mesmo dia —
o Arthur olhou e disse que a ideia estava ruim, e ele tem razão pelo motivo mais simples: a barra
é para ir a lugares, e "o que a IA faz aqui" não é um lugar. Um item que abre uma caixa em vez de
trocar de tela quebra a única promessa que uma barra de navegação faz.

O que ficou dessa passada foi a subtração: a segunda lista embaixo do separador saiu inteira. O
tema já tinha ido para o perfil, e o perfil virou **o próprio cartão de quem está aqui** — ele já
mostrava o rosto e o endereço, então uma linha "perfil" logo acima dele dizia a mesma coisa duas
vezes. A barra voltou a ser só os módulos.

As tarefas de IA seguem onde sempre estiveram: no botão da tela que as usa. O que a coletânea
resolveu ali foi o nome, não o endereço — ver 7.4.

### 7.4 O que estava confuso, e por quê

Quase todo item de confusão era o **mesmo gesto com dois nomes**:

- *puxar para o dia* era relógio nas ideias e seta na semana e no dia — e a seta aponta para
  fora, então lia-se "ir para", não "trazer para cá". Agora é sempre o relógio.
- *arquivar* uma ideia era indistinguível de apagar: ela sumia da lista e só aparecia no quadro.
  Agora desce para o rodapé da própria lista, fechada, e volta de lá.
- os *passos* de uma ideia eram bullet notes com caixa de marcar. Ganharam número, "agora" no
  primeiro não feito, setas para mudar a sequência e edição no lugar — sem ordem, "o próximo
  passo" é uma frase sem dono.
- a *atividade* listava só criação e troca de estágio. Passou a registrar passo concluído, que é
  o que responde "isto andou?".

### 7.5 O que era bug

- O dia anunciava "atualizei com o que veio do outro aparelho" **toda vez que abria**: o servidor
  recusa com 409 um dia reenviado com carimbo igual, e o cliente lia todo 409 como novidade.
- **Semana e dia só escutavam num sentido.** Concluir no dia fechava o cartão; fechar o cartão na
  semana deixava a tarefa aberta na fila. E o `inDay` — a afirmação "isto está na fila de hoje" —
  era apagado pelos dois lados, o que abria janela para a mesma coisa entrar duas vezes. Agora o
  dia é o dono do vínculo e reconcilia os dois lados na mesma passada.
- Arrastar no mapa mental contornava a tela de branco: o `pointerdown` não chamava
  `preventDefault`, então o navegador começava uma seleção nativa junto com o pan.

### 7.6 Prints nas ideias (R2)

Uma ideia quase sempre nasce de uma tela. Três gestos para a mesma coisa, porque é assim que uma
captura chega: `ctrl v`, arrastar para o painel, ou escolher o arquivo.

O binário **não entra no documento** — ele subiria e desceria inteiro a cada sincronização, e uma
captura pesa mais que o módulo todo. Vai para um bucket R2 (`merlin-files`), e o documento guarda
só o bilhete `{id, name, type, size}`. A chave de todo objeto começa com o `person` da sessão, e
o worker confere esse prefixo em toda leitura: quem pedir o arquivo de outra pessoa recebe "não
existe", e não "não pode" — responder diferente já contaria que o arquivo existe.

**A consequência honesta**: anexo só existe para quem entrou. Sem sessão não há onde guardar, e
inventar um depósito local seria prometer uma sincronização que não aconteceria. A tela diz isso.

### 7.7 Planos e financeiro

**Planos** perdeu a revisão de dentro das colunas — três campos abertos em cada uma, nove
textareas vazias que era o que a tela dizia o tempo todo. Virou botão e caixa, como todo o resto
do sistema. No lugar delas entrou a única coisa que essa tela faz e uma lista não faria: acender
um objetivo apaga tudo que não tem parentesco com ele nas outras colunas, três gerações de uma
vez — de onde uma semana veio e onde um trimestre aterrissa.

**Financeiro** ganhou a aba **hoje**, que é a primeira e responde as três perguntas que se faz
antes de qualquer outra: quanto tenho, quanto sobra no fim do mês (e por qual buraco ele passa
antes de fechar), e o que vence nos próximos sete dias. Nenhuma conta nova mora ali — saldo e
projeção saem do mesmo `balanceUntil` e `buildMonth` do mês e do ano.

E as **categorias** saíram de dentro da caixa de config, onde eram uma fileira de chips em que um
clique apagava sem perguntar e sem desfazer. Agora cada uma diz quanto passou por ela no mês —
que é a única coisa que faz uma etiqueta valer alguma coisa. Renomear arrasta junto tudo que
estava marcado com o nome antigo; apagar avisa quantos lançamentos ficam órfãos, e volta atrás.

---

## 8. O Merlin sai de casa (09/10/2026)

Até aqui o Merlin era da casa: do Arthur, e depois do time da Guessless, cada um no seu. A partir
de 09/10/2026 ele vira produto para gente de fora. O que não muda: os módulos (seção 4), a
arquitetura (seção 3), a marca que segue quem entrou, e uma pessoa por vez.

### 8.1 Para quem

**Pessoas sozinhas, desenvolvedores, que fazem o próprio SaaS com a IA escrevendo boa parte do
código, e que precisam distribuí-lo.** Não é agência e não é time.

O Merlin já tinha a espinha dessa pessoa sem ter sido feito para ela: o projeto de app (4.13)
desenha o que construir e sai com o prompt para o Claude Code; o funil de lançamento e as peças
de conteúdo ligadas a ele são a distribuição; e o dia diz quanto disso cabe hoje. Construir e
distribuir são as duas metades do trabalho, e o dia é onde as duas disputam minuto.

### 8.2 O conselheiro é o Merlin

Sempre, a partir de agora. Ele deixou de se apresentar como conselheiro do time da Guessless e
de falar do método, das ferramentas e dos clientes "da casa": o `SYSTEM` do worker diz quem ele
é e para quem fala, e o que ele sabe do negócio de cada pessoa chega no contexto do pedido.

### 8.3 Créditos a cada 5 horas

O conselheiro passa a gastar **crédito por pessoa, renovado em janelas de 5 horas**. Substitui o
teto de 30 pedidos por hora (`ADVICE_PER_HOUR`), que existia para conter acidente com uma chave
dividida pelo time, e não para medir uso. Com gente de fora pagando, o crédito é o produto.

### 8.4 Uma pessoa por vez, continua

Nada muda aqui, e nada do que vem depois (8.5) pode mudar. Uma rede social cabe nessa regra se
for **ver e publicar**: o link público de mapa e de funil já é isso. Escrever no Merlin de outra
pessoa — mandar tarefa, ser responsável, dividir cliente — continua fora.

### 8.5 App instalável

O Merlin vira app que se instala: **widget no celular**, e no Windows um **rastreador** que
fica aberto ao lado do trabalho. A barra que se gasta e o número da sobra são o que esse app
mostra sem precisar ser aberto.

Depois, e não agora: uma rede social, e um lugar onde as pessoas entram para trabalhar.

### 8.6 Em aberto

- Quanto crédito cada plano tem, quanto custa, e como cada pedido pesa (o projeto de app gasta
  três vezes a saída de um conselho comum).
- O que substitui `OWNER_EMAILS` como porta: cadastro aberto, convite ou lista de espera. Em
  10/10/2026 a landing passou a guardar uma **lista de espera** (`/api/waitlist`); a porta
  continua sendo `OWNER_EMAILS` até alguém decidir como a fila vira conta
  ([docs/prd/landing.md](docs/prd/landing.md)).
- Os modelos de quem lança SaaS (canais, funis de lançamento, conteúdo de construir em público),
  ao lado dos que já existem.
- Por qual celular começar, e o endereço do produto.

---

## 9. Seis lugares, um por trabalho (09/10/2026)

O Merlin tinha muita coisa e não estava prático. A contagem de produção em 09/10/2026 (só o
número de documentos por tipo, desde 02/09, 3 pessoas) mostrou por quê: sete módulos faziam
quase todo o uso (tarefas 282, financeiro 102, mapas 30, funis 23, notas 20, rotina 17,
hábitos 15), dois nunca tiveram um documento (diário e planos), e a última tarefa gravada era
de 29/09. O dia, que é o coração, estava a dois cliques — atrás de uma home de relógio, frase
e favoritos — e havia sete lugares diferentes para escrever, cada um decidindo sozinho para
onde o texto ia.

### 9.1 A barra

Dezesseis itens em quatro grupos viraram **seis seções**, uma por trabalho e não uma por tipo
de dado. As páginas continuam sendo páginas, com o endereço de sempre; viraram abas da seção,
e as abas só aparecem na seção em que você está (`SECTIONS` no `core.js`).

| seção | abas |
| --- | --- |
| **hoje** | calendário (dia, semana, mês), rotina, hábitos |
| **ideias** | notas, mapas |
| **produtos** | o projeto de app |
| **distribuição** | funis, conteúdo |
| **clientes** | leads (a prospecção), clientes |
| **dinheiro** | financeiro, vitrine |

Fora das seções: a porta de quem nunca entrou (`index.html`), a conversa com o Merlin
(chega-se pelo `Ctrl+K`), o perfil (o cartão embaixo da barra), o rastreador e o link público.

**Atualização de 19/10/2026 (§13):** as seis seções viraram cinco **áreas** da vida (saúde,
trabalho, organização, finanças, inbox), abertas por um menu no alto. A regra continua: página
nova é aba de uma área, nunca item próprio. A tabela que vale é a da §13.

### 9.2 O dia é a primeira tela

`index.html` deixou de ser a home: quem já entrou é encaminhado para o calendário antes de ver
qualquer coisa, e só quem nunca esteve aqui vê a porta. Do bento saíram o relógio, a citação e
os favoritos; os **hábitos do dia** e o **"como foi o dia"** foram para o lado da fila
(`shared/today-block.jsx`). A apresentação foi junto: aparece uma vez no Hoje e se revê pelo
perfil (`shared/tour.jsx`), reescrita para as seis seções.

**Atualização de 19/10/2026 (§13):** o dia não é mais a primeira tela. Desde a secretária
(17/10/2026, §10) a primeira tela é a conversa do início, e o calendário é a primeira aba de
organização. A apresentação saiu do calendário: abre uma vez no início, reescrita para as áreas.

### 9.3 Diário e planos saíram

Nenhum dos dois teve um documento em produção. Os endereços encaminham para o Hoje, e as
coleções não foram apagadas. Do diário ficou a pergunta do fim do dia, que grava na mesma
coleção `journal` de antes.

**Atualização de 20/10/2026:** o diário voltou, como aba de saúde (`journal.html`). A página
é o histórico: a semana em cartões, um por dia, editáveis ali, gravando na mesma coleção
`journal`. O bloco do Hoje e o "fechar o dia" ficam como estão, e a busca leva ao cartão do
dia. Texto de diário nunca vai ao retrato (`docs/prd/saude-completa.md`, D3).

### 9.4 Uma regra só para escrever

O `Ctrl+K` virou o campo de tudo, em qualquer tela (`routeLine` no `tasks.js`, com teste):

- com **"?"** no começo ou no fim → pergunta ao Merlin;
- com **duração** ("45m", "1h30") → tarefa de hoje;
- começando com **palavra de pergunta** ("como", "qual", "devo", "me ajuda"…) → pergunta ao Merlin;
- **sem duração** → ideia (uma nota).

Desde 09/10/2026 o campo do início segue a mesma regra e perdeu as abas de tarefa/pergunta/nota:
embaixo dele, uma linha diz para onde o Enter vai mandar o texto antes de mandar.

A primeira linha da lista diz o que o Enter vai fazer antes de ele fazer; embaixo vem o que já
existe com aquele nome, e com o campo vazio, as seis seções. `Ctrl+J` pergunta direto. O campo
do dia e o do rastreador continuam cobrando a duração: neles a pessoa já disse "é para hoje".

**Atualização de 19/10/2026 (§13):** com o campo vazio, o `Ctrl+K` lista as abas pela área, uma
linha por aba ("finanças · financeiro"), na ordem do menu. O que fica sem duração vira **nota**,
e o aviso diz "guardado em notas".

### 9.5 O produto é o centro

Abrir um produto mostra primeiro a **visão geral**: construir (o que está desenhado e o que
falta, com o prompt para o Claude Code a um clique), distribuir (o funil ligado e as peças que
ainda não foram ao ar) e pensar (os mapas ligados a ele). O mapa ganhou o campo `app`, e o
produto liga, desliga e cria mapa já ligado. A aba "lançamento" passou a se chamar
"distribuição", como a seção.

---

## 10. O Merlin é um assistente (10/10/2026)

O Arthur, depois da seção 9: ainda não era um assistente pessoal. Agora o **início é uma conversa**:

- **onboarding em conversa** (nome, trabalho, o que está construindo, janela do dia, um hábito); cada resposta cria o documento na hora, e o perfil (`profile/me`) vai em todo pedido ao conselheiro (`profileOf` no worker);
- **a pergunta segue a hora**: de manhã "o que precisa caber hoje?", à tarde "como está indo?", à noite "como fechamos o dia?";
- **fechar o dia**: cada tarefa aberta vira feito, amanhã ou largar, mais o "como foi o dia"; os dias fechados formam a **sequência** (`closes`);
- **revisão da semana** (sexta à noite até domingo) e **do mês** (três últimos dias), na coleção `reviews`;
- **a floresta** (`shared/forest.jsx`), escolhida entre quatro temas, acompanha a hora;
- **dock embaixo no lugar da barra lateral**, com o início, as seis seções e o "+".

**Atualização de 17/10/2026 (a secretária, `docs/prd/a-secretaria.md`, D2 e D5):** o início ficou
só com a conversa. Abre com uma frase só, "Bom dia, Arthur. Como posso te ajudar hoje?" (boa tarde
e boa noite pela hora), e o campo, sobre a floresta. Saíram a pergunta que mudava com a hora, a
fala do Merlin (a tarefa `checkin`, que continua no Worker mas não é mais chamada), a linha de dias
seguidos, o botão da noite e os blocos de baixo (o dia, hábitos, agenda, a semana, entregue hoje,
revisões). O dia inteiro e os hábitos continuam no calendário. Fechar o dia e revisar passaram a
ser **pedidos**: escrever "fechar o dia" no campo abre o fechamento, e "revisar a semana" ou
"revisar o mês" abre a revisão do período corrente, a qualquer dia. É regra local (`askIntent`, em
`shared/tasks.js`), sem crédito, com ou sem o "?" no fim ("fechar o dia?"); com duração ("fechar o dia 30m") continua sendo tarefa. A
sequência de dias fechados continua gravando em `closes`. Quem pede isso ao Merlin na conversa
ouve que é só escrever "fechar o dia" no início.

**Atualização de 19/10/2026 (§13):** o dock não tem mais as seções. No início não há dock; nas
outras telas ele fica com o início, as abas da área aberta e o "+". Trocar de área é pelo menu
do alto.

---

## 11. O que veio do Promethee (10/10/2026)

O Arthur pediu para estudar o Promethee (um app de foco instalado na máquina dele) e trazer o
que servisse. A leitura dos textos da interface dele mostrou sete pilares: a sessão de foco
como unidade, um mentor de IA que sabe o que você fez, rastreamento automático de apps, uma
camada de jogo (XP, ligas, temporadas, cartas), metas de horas e teto de reunião, guildas e
um ambiente com som e paisagem.

**Entrou:**

- **A sessão de foco** (`shared/focus.js`). Começa na tarefa da vez — no rastreador (o início
  também começava, até 17/10/2026) — e termina com um **recibo**: quanto levou contra o que você estimou. É o que o
  Merlin tem e o Promethee não: a estimativa é o que faz a sobra do dia ser honesta, e a
  sessão diz se ela estava certa. Uma sessão por vez; a coleção é `sessions`.
- **A meta de horas e o teto de reunião** (perfil, "o seu ritmo"). O foco da semana é a soma
  das sessões; a reunião da semana são as reservas com cara de reunião (a mesma lista que faz
  "daily" virar reserva). O teto é limite, não meta: passar dele tira o destaque, como o dia
  que estoura — não há vermelho.
- **O GitHub**, só o público e só leitura. O navegador lê os eventos do usuário direto da
  `api.github.com` — nada passa pelo servidor e nenhum token é guardado. Os commits e PRs do
  dia aparecem no fechamento do dia (no início, o "entregue hoje" e a fala do Merlin saíram em
  17/10/2026, com a secretária).
  Repositório privado fica de fora até existir um token opcional.

**Ficou de fora, de propósito:**

- **XP, ligas, temporadas e cartas.** Brigam com o princípio do número neutro: ranking de horas
  premia esticar o dia, e o Merlin existe para fazer o dia caber. A sequência de dias fechados
  é a única recompensa.
- **Som ambiente.** O Arthur preferiu sem.
- **Rastreamento automático de apps e abas, e bloqueio de sites.** Invasivos e dependentes de
  permissão de sistema; se vierem, vêm opcionais e só no app de desktop.

**Mapeado para depois: as guildas.** No Promethee, uma guilda é um grupo pequeno que foca
junto — fundadores, uma turma, o time do standup —, com página própria, painel da semana,
chat, convites, moderação e um placar do grupo. É a forma do "lugar onde as pessoas entram
para trabalhar" da seção 8.5, e cabe na regra de uma pessoa por vez (8.4) se ficar em **ver e
publicar**: a guilda vê que você está em sessão, quanto focou na semana e o que entregou; ela
nunca escreve no seu dia, no seu cliente nem no seu financeiro. O que precisa existir antes:
perfil público (o que de você outra pessoa pode ver), sessões públicas como opção por sessão,
e o feed. O placar, se existir, mede dias fechados, e não horas.

---

## 12. O Merlin ganha rosto (17/10/2026)

Veio o pedido de um personagem "igual o Grok Bot, mas com formato de chapéu de mago". Ficou um
**chapéu de mago desenhado inteiro em código** (`shared/hat.js`), como a floresta: nada é imagem
nem keyframe. Cada humor é um alvo para uns trinta números (quanto a ponta tomba, para onde os
olhos olham, quanto a pálpebra desce), e uma mola leva de um para o outro. Qualquer humor vira
qualquer outro sem corte, até no meio de uma troca.

O chapéu é o que se reconhece do Merlin em qualquer tamanho, até em 16px. A ponta virou um
segundo rosto: balança quando ele pensa, enrola num "?" quando ele não entende e fica em pé
quando ele presta atenção.

**A cor dele virou a do app.** Em 17/10 o roxo `#8B5CF6` com olho branco foi decidido só para
o chapéu, para ele não disputar com os botões verdes. Em 19/10 o app inteiro foi para o roxo:
`--accent` é o roxo, e a pele da Guessless saiu (seção 2, "Uma cara só"). Os motivos que
valeram para o chapéu valem para o app: roxo lê como mago, e passa de 3:1 nos dois temas (4,6:1
no escuro, 3,8:1 no claro) — o verde dava 1,46:1 no claro. O preço é que o chapéu agora tem a
cor do botão; ele se separa pela forma e pelo movimento, não mais pela cor. `--merlin` continua
existindo como o token do personagem, com o mesmo valor.

**O chapéu é o logotipo (19/10/2026).** O monograma antigo saiu de todo lugar: barra, favicon
(`public/merlin.svg`), landing, privacidade, rastreador, link compartilhado e o ícone do app de
desktop. É o mesmo chapéu de `hat.js`, parado no humor de repouso. Ficou de fora só a imagem de
prévia de link (`public/og.jpg`), que é uma foto pronta.

**Onde ele aparece.** Primeiro no chat (`assistant.html`): grande na abertura, no lugar da
faísca, e pequeno ao lado do campo durante a conversa. Ali ele ouve quando a pessoa escreve,
pensa enquanto espera, trabalha enquanto monta um rascunho, fica pronto quando chega uma
proposta ou um rascunho e fica confuso no erro. A palavra continua escrita ("pensando…"), porque
o leitor de tela não vê o chapéu e nem todo mundo olha para o canto. Com movimento reduzido, ele
só pisca e troca de humor.

A faísca continua nos botões de IA ("Merlin rascunha", "puxar pautas"): ali ela quer dizer "ação
do Merlin", e não o Merlin.

**Depois:** o início sobre a floresta, quando ele virar só a conversa (D2 de
`docs/prd/a-secretaria.md`). Lá o chapéu pode dormir quando a floresta está de noite. Os outros
humores do desenho (feliz, triste, dormindo, aviso…) entram no `MOODS` quando uma tela precisar
deles, não antes.

---

## 13. O menu por área (19/10/2026)

O desenho de 17/10 ("merlin deve agir como uma secretária") tinha duas metades. A primeira, a
secretária (`docs/prd/a-secretaria.md`), deixou o início só com a conversa. A segunda é esta: o
resto do Merlin sai da frente da conversa e vai para um **menu oculto**, organizado pelas
**áreas da vida** e não pelos tipos de trabalho (`docs/prd/o-menu-por-area.md`).

Faltava a casca acompanhar. Com o início sendo a conversa, o dock das seis seções aparecia
embaixo dela com o mesmo peso, e as seções (hoje, ideias, produtos, distribuição, clientes,
dinheiro) eram a navegação da §9, pensada para quando o calendário era a primeira tela. As
gavetas que o desenho promete (sono, treino, alimentação, meu negócio) não tinham onde se
encaixar. O argumento da contagem de 09/10 continua: o que a conversa traz de volta vive, e o
que espera visita numa gaveta morre. Com a conversa trazendo o dia de volta, a gaveta pode ficar
fechada, desde que se ache em um gesto.

### 13.1 As áreas

Na ordem do desenho do Arthur. A primeira aba é a porta da área (`SECTIONS`, no `core.js`).

| área | id | ícone | abas, na ordem |
| --- | --- | --- | --- |
| **saúde** | `health` | `habits` | hábitos, sono, treino, alimentação, diário |
| **trabalho** | `work` | `apps` | produtos, conteúdo, funis, mapas |
| **meu negócio** | `business` | `business` | caixa, time, operação |
| **organização** | `organization` | `calendar` | calendário, rotina, notas |
| **finanças** | `money` | `finance` | financeiro |
| **inbox** | `inbox` | `inbox` | o que falta, leads, clientes |

Os endereços não mudaram: `finance.html` continua sendo o financeiro, e nenhum favorito quebrou.
O produto abre o trabalho porque é o centro (§9.5). O calendário e as notas ficam em organização,
que é onde se **arruma** o tempo; o inbox fica com o lado de **fazer**. Três escolhas são
discutíveis, e cada uma muda numa linha de `SECTIONS`, sem migração:

- **a rotina** fica em organização, ao lado do calendário, porque é a semana-modelo que só existe
  para virar tarefa (§4.11). A seta "inbox → rotina" do desenho foi lida como a rotina de cumprir
  o que falta, que é o cartão da próxima coisa;
- **leads e clientes** ficam no inbox, porque o desenho põe o "crm" ali: são as pessoas que
  esperam uma resposta. A alternativa era o trabalho, que ficaria com seis abas;
- **os mapas** vão para o trabalho, porque o desenho põe o mapa mental em "desenhos", dentro do
  trabalho.

A saúde era só os hábitos; o diário voltou como aba em 20/10/2026, e o sono, o treino e a
alimentação entraram no mesmo dia, cada um com o seu verbo ("dormi 7h", "treinei perna 40min",
"almocei salada", §13.7; `docs/prd/saude-completa.md`). O treino marca o hábito de treino do dia,
sem criar hábito. A alimentação não tem caloria, nota nem "bom ou ruim": só o que se comeu e em
que refeição. O id `inbox` da área não tem relação com a fila
`merlin:inbox` (§3), e o comentário de `SECTIONS` diz isso. "inbox" e "lead" ficaram como o
Arthur escreveu: são as palavras que esse público usa.

**Meu negócio** entrou em 20/10/2026, entre o trabalho e a organização (`docs/prd/meu-negocio.md`,
D2), com o **caixa** da empresa: o mesmo financeiro, num livro separado (`book: "business"` no
documento; sem o campo, é pessoal, e nada migrou). O financeiro pessoal não vê o livro da empresa,
nem o caixa vê o pessoal. O verbo é o mesmo lançamento da conversa ("recebi 2.400 da Acme na
empresa"), com o seletor "pessoal | empresa" na caixa: na dúvida, pessoal, e a pessoa decide. O
**time** veio em seguida (D5), com os seus dois verbos ("a Ana entra como designer, 3 mil", "a Ana
entregou a landing"): cadastro leve de quem trabalha com você, com o custo, que vira um fixo no
caixa da empresa, e as entregas que o dono anota. Sem horas, ponto, ranking nem login; "saiu do
time" arquiva e mantém as entregas. O plano e a operação entram na mesma área, na ordem plano,
caixa, time, operação; vendas continua no inbox (D1).

A **operação** (D6) é a última aba: os processos recorrentes da empresa ("emitir notas · todo dia
5"), e marcar feito vale pelo período. Operação é **prazo, não tempo**: a rotina diz quando se
trabalha na semana, e a operação só diz até quando algo tem de estar feito. Por isso ela não cria
tarefa no calendário, e o que vence hoje entra no "o que falta hoje?"; a caixa do processo diz
que é prazo. Os verbos são "todo dia 5 emito as notas" e "emiti as notas".

### 13.2 O menu

Um botão "menu" na faixa do alto, logo depois da marca, **em toda tela e do mesmo jeito no
desktop e no celular** (no celular, só o ícone). Ficar sempre no mesmo canto vale mais do que
ficar perto do polegar: no início, o polegar já tem o campo. É o único caminho do início para uma
área com o mouse ou o dedo.

Ele abre um painel com as áreas e **todas as abas de uma vez**, cada aba um link, sem
segundo nível: cabem numa olhada. A área e a aba de onde se está ficam marcadas.
No desktop o painel desce do botão, com as áreas em colunas; no celular ocupa a largura toda, com
as áreas numa coluna e alvos de toque de 36px. Fecha com `Esc` (o foco volta ao botão), clicando
fora, no botão de novo ou num link. Durante o onboarding o botão some, como a busca.

**Não há atalho de teclado para o menu.** Quem usa o teclado tem o `Ctrl+K`, que com o campo
vazio lista as mesmas abas pela área (§9.4). Um atalho a mais é uma coisa a mais para lembrar.

### 13.3 O dock encolheu

No início não há dock: só a faixa do alto, a saudação e o campo. Nas outras telas o dock fica com
o início, as abas da área em que se está e o "+"; na conversa (`assistant.html`) e no perfil, que
não são de área nenhuma, com o início e o "+". O "+" e o `Ctrl+K` continuam em toda tela que não
seja o início e o rastreador; no início, o próprio campo é esse gesto.

A saúde tem cinco abas, e no celular (até 600px) elas não cabem no dock: o diário sai dele, mesmo
na página dele, e continua no menu e no Hoje (`spare` em `SECTIONS`). As outras quatro cabem de
360px para cima.

### 13.4 "O que falta" no inbox

A sessão de foco não ganhou página. A aba "o que falta" do inbox leva a `index.html#next`, e o
início abre com a pergunta "o que falta hoje?" já feita e o cartão da próxima coisa respondido,
sem crédito, como se a pessoa tivesse escrito. É no cartão que a sessão de foco começa (D6 da
secretária). O endereço perde o `#next` depois de responder, e recarregar não pergunta de novo.

### 13.5 A vitrine saiu

A vitrine não tinha lugar nas áreas. `wishlist.html` passou a levar ao financeiro, para onde o
"comprei" sempre desaguou, e ela saiu da busca e do catálogo do chat. **Os dados ficaram**: a
coleção `wishlist` continua no navegador e no D1, sem tela, como o diário e os planos (§9.3), e
os lançamentos que vieram de uma compra continuam no financeiro. Uma proposta antiga de vitrine
numa conversa guardada responde "tipo de ação desconhecido" e não grava nada.

### 13.6 A apresentação e as palavras

A apresentação foi reescrita para as áreas, em seis passos: fale com o Merlin; o que falta, uma
coisa por vez; o resto mora no menu; só o dia tem minutos (organização); do produto a quem usa
(trabalho e inbox); dinheiro e hábitos (finanças e saúde). Ela saiu do calendário e abre **uma
vez no início**, depois do onboarding. A marca mudou de `tour` para `tour-areas`, para quem já
tinha visto a antiga ver a nova uma vez: a navegação mudou inteira para quem já usa. O perfil
revê e esquece a marca nova.

"Ideias" deixou de ser um lugar, e o texto acompanhou: o que fica sem duração "vira nota" e é
"guardado em notas". Os nomes internos (`kind: "note"`, a coleção `notes`) não mudaram.

### 13.7 Gaveta nova só com um verbo

Nenhuma área ganhou lugar "em breve": o que não está, não existe ainda. Sono, treino,
alimentação, dashboard, meu negócio, o diário de volta e as outras gavetas do desenho ficaram de
fora, e cada uma é uma descoberta própria. **Uma gaveta nova só entra quando tiver um verbo na
conversa** ("dormi 6h", "treinei perna"): é a conversa que a traz de volta, e é isso que mantém
um módulo vivo, não o lugar no menu. Quando entrar, é uma aba numa área de `SECTIONS`, nunca um
item próprio.
