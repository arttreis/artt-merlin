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

### A marca segue quem entrou

Quem entra por um e-mail `@guessless.com.br` vê o Merlin **com a identidade da Guessless**;
todo o resto vê o Merlin. É a mesma decisão do login, aplicada à pele: um deploy, um endereço,
duas caras.

> A marca é só pele. Nenhuma tela muda de comportamento, nenhum dado sabe que ela existe.

A identidade vem do design system dos documentos da casa
(`docs.guessless.com.br/assets/dashboard.css`), que é a fonte de verdade: fundo `#0A0A0A`,
**DM Sans** no display, **Manrope** no corpo, **Instrument Serif** no itálico de ênfase,
**JetBrains Mono** nos rótulos e `#368DFF` no destaque. A mono é a mesma dos dois lados — é por
isso que a troca não desmonta nada. O `#0014FF` que aparece por aí não é a marca; o próprio CSS
da casa anota isso.

Como funciona, em três peças:

- **`html.gl` no `shell.css`** troca o valor dos tokens que já existiam. Nenhum componente
  ganhou regra nova, com duas exceções anotadas lá: o display em DM Sans (o Merlin usa a mesma
  fonte nos dois papéis) e o mono mais aberto da casa.
- **`merlin:brand` no `localStorage`**, escrito junto com `merlin:who` e lido pelo `<head>` de
  cada página **antes da primeira pintura**. Se dependesse do `/me`, a pessoa da casa veria um
  quadro de Merlin antes do próprio Merlin a cada carregamento.
- **O lockup na barra**: o logotipo da Guessless com `merlin` de sub-rótulo, que é como a casa
  já assina os próprios produtos (`[GUESSLESS] docs`). Recolhida, entra o isotipo — ele existe
  exatamente para esse tamanho. O e-mail do código também veste a marca de quem vai recebê-lo:
  ninguém deve abrir um e-mail verde de um produto que não conhece.

Duas coisas ficaram de fora, de propósito:

- **O endereço continua `merlin.arttreis.com.br`.** Um `merlin.guessless.com.br` apontando para
  o mesmo Worker resolve (a Cloudflare aceita mais de um `custom_domain`), mas depende de um
  registro de DNS no domínio da casa — decisão de quem tem a zona, não do código.
- **O token de destaque ainda se chama `--green`** e carrega o azul. São 174 ocorrências em 22
  arquivos: renomear para `--accent` é mecânico e merece um commit só dele, longe deste.

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

### Dois temas

O design system do arttreis.com.br nos dois modos: escuro (`#0d0d0d` e o verde `#2EE86B`) e
claro (`#f2f2f0`, branco, e o verde escurecido `#0d8038` para texto). O botão de tema fica na
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
  `claude-opus-5`) com dez tarefas: **ramos** (mapa mental, nó selecionado), **funil** (o que
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
- **Depois**: entrada em linguagem natural para o sistema todo.

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
| 13 | Entrada em linguagem natural para o sistema todo (seção 4.8) | depois |

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

14. **Inglês em tudo**: identificadores, chaves, campos dos documentos, rotas, tabelas e
    classes de CSS. Só o texto de tela e os comentários seguem em português. Sem migração
    dos dados gravados com os nomes antigos.
15. **Hábitos e planos** (seções 4.9 e 4.10) entram depois da migração terminar.

Em aberto: nada.


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
