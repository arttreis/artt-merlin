# EPIC-1 · Conteúdo que ajuda a criar

**Status:** ✅ Implementado em 2026-10-02 (branch `epic-1-conteudo`)
**Owner:** Arthur Reis
**Criado em:** 2026-10-02 · decisões D1 a D4 fechadas no mesmo dia
**Tela:** `content.html` (`src/content.jsx`, `src/content.css`) e o Merlin (`server/worker.js`)

---

## Objetivo

Fazer a tela de conteúdo **ajudar a criar**, e não só guardar o que já foi criado. Em cada etapa,
de ideia a publicado, a peça aberta oferece o próximo passo criativo pronto para usar: o molde do
formato, os ângulos, o roteiro, os ganchos, a lista de takes, a legenda e as peças derivadas. A
tela também passa a dizer o que falta publicar, não só o que existe.

## Por que agora: o que a tela faz hoje

A tela é um kanban de seis etapas. O cartão guarda título, formato, data, cliente e um roteiro em
markdown. A ajuda à criação se resume a isto:

- **Um único esqueleto para todos os formatos.** `SCRIPT_MOLD` (`src/content.jsx:62`) coloca
  "gancho / desenvolvimento / fechamento" em YouTube, Reels, carrossel, story e e-mail. Carrossel
  é feito de slides, e-mail começa pelo assunto, e nenhum dos dois ganha essa estrutura.
- **O Merlin só chega pela busca.** A ação `script` do assistente (`server/worker.js:849`) escreve
  um roteiro com a mesma estrutura fixa. Ela não sabe o formato, e o contexto da tela leva só o
  nome e o id do cliente (`src/content.jsx:88`). Nicho, oferta, dor e o que já foi publicado ficam
  de fora.
- **A etapa é só um rótulo.** Passar de "roteiro" para "gravar" ou "agendado" não muda nada do que
  o painel oferece.
- **A tela mostra o que existe, não o que falta.** O resumo (`Summary`, `src/content.jsx:193`)
  conta o que está em andamento. A tese do produto é a contrária: a tela mostra **quanto ainda
  cabe**.
- **O quadro vazio é um beco sem saída.** O estado vazio só oferece "primeira ideia", e a pessoa
  continua sem saber sobre o que falar.
- **O método da casa não está na ferramenta.** A skill `roteiro-viral` (parar o scroll, segurar,
  virar, converter, com os slots de prova e insight) e os "5 ângulos × 4 formatos" do
  `montagem-funil` existem, mas não aparecem em lugar nenhum da tela.

## Regras que este epic não pode quebrar

1. **O Merlin propõe, a pessoa decide.** Nada entra na peça ou no quadro sem clique. Toda
   substituição de texto que já existia tem **desfazer** (`notify(..., undo)`), como em toda a casa.
2. **O molde é bullet para falar, não texto para ler.** Isso vale para os moldes e para o que o
   Merlin escreve.
3. **O Merlin não inventa dado.** Número, resultado, preço e case só entram se estiverem no
   contexto. Dado necessário que não foi confirmado entra marcado com `[conferir]`, a regra da
   `roteiro-viral`.
4. **Visual da casa:** monocromático com um verde. Falta não é erro: "faltam 2 reels" sai em tom
   neutro, sem vermelho.
5. **Mesmo teto de uso.** Cada botão do Merlin é uma chamada a `/merlin` e conta nas 30 por hora
   por pessoa que já existem. Não há rota nova nem chave nova.

## Decisões

| # | Decisão | Estado |
|---|---|---|
| D1 | **A lógica da `roteiro-viral` é a base de tudo o que o Merlin recomenda, em qualquer formato:** parar o scroll, segurar, virar e converter. Em Reels e story, essa lógica é a própria estrutura do roteiro. Em YouTube, carrossel e e-mail, o Merlin segue o molde do formato e aplica a lógica dentro dele: gancho que para o scroll, virada antes do fim e CTA amarrado na virada. Ângulos e ganchos seguem a regra do gancho (sem pergunta, sem saudação) em qualquer formato. Continua sendo recomendação, e a pessoa pode descartar. | Tomada pelo Arthur em 2026-10-02 ("no mínimo recomende usando essa lógica"). |
| D2 | **Ritmo de publicação configurável, com padrão de 1 peça por dia** (história 1.5). Ritmo é quantas peças se quer publicar, por dia ou por semana, por cliente e, se quiser, por formato. O conteúdo próprio já nasce com 1 por dia, em qualquer formato. O ritmo se define no topo da tela de conteúdo e fica numa coleção própria, um documento por cliente, com `me` para o conteúdo próprio. Motivo: "meu" não é cliente, e a ficha do cliente já está cheia. | Tomada pelo Arthur em 2026-10-02 ("a meta é 1 diária, mas legal ter isso configurável"). |
| D3 | As seis etapas e os seis formatos não mudam. O epic dá trabalho a cada etapa, não reorganiza o quadro. | Confirmada pelo Arthur em 2026-10-02. |
| D4 | O que o Merlin produz depois do roteiro (produção, publicação) entra **no próprio roteiro, como seção** (`## produção`, `## publicação`), e não em campos novos. A peça continua tendo um único documento de texto. | Confirmada pelo Arthur em 2026-10-02. |

## Escopo

### Dentro

- Molde por formato, aplicado com um clique quando o roteiro está vazio.
- Ações do Merlin dentro da peça, uma por etapa: ângulos, roteiro, ganchos, produção, publicação.
- Desdobrar uma peça em derivadas e puxar pautas de um cliente.
- Ritmo de publicação (quantas peças por dia ou por semana, por cliente e formato), com padrão de
  1 por dia e o topo dizendo o que falta.

### Fora (decidido, não esquecido)

- Publicar nas redes por API (Meta, YouTube) ou agendar fora da tela.
- Gerar imagem, thumb ou vídeo (Nano Banana, HeyGen, Magnific).
- Transcrever vídeo ou áudio para virar roteiro (a ingestão da `roteiro-viral`).
- Métricas de desempenho das peças publicadas.
- Calendário editorial em grade e aprovação do cliente.
- Banco de referências ou swipe file.

---

## Histórias

| ID | Título | Tamanho | Depende de | Executor · gate |
|---|---|---|---|---|
| 1.1 | Molde por formato | P | — | @dev · @ux-design-expert |
| 1.2 | Merlin na peça: ideia e roteiro | G | 1.1 | @dev · @architect |
| 1.3 | Merlin na peça: produção e publicação | M | 1.2 | @dev · @qa |
| 1.4 | Peças novas a partir do que existe: desdobrar e puxar pautas | M | 1.2 | @dev · @architect |
| 1.5 | Ritmo de publicação: o quadro diz o que falta | M | 1.4 | @dev · @ux-design-expert |

**Ordem de execução:** 1.1 → 1.2 → (1.3 ∥ 1.4) → 1.5. A 1.3 e a 1.4 só compartilham a
infraestrutura que a 1.2 cria e podem correr em paralelo.

---

### 1.1 · Molde por formato

Cada formato ganha o seu molde. O molde passa a ser o ponto de partida visível da peça vazia, em
vez de um ícone escondido.

**Onde:** `src/shared/content-script.js` (novo, sem React: entra texto, sai texto), consumido por
`src/content.jsx`. O worker não importa este módulo: quem precisar do molde recebe o texto pelo
contexto (ver 1.2).

**Os moldes** (`{título}` é o título da peça; a linha em itálico é a dica e pode ser apagada):

```markdown
<!-- reels -->
# {título}
*bullets para falar, não texto para ler · 30 a 60s, umas 150 palavras*
## gancho · 0 a 3s
*número, contraste ou case. nunca pergunta, nunca "oi"*
-
## segurar
*abre a curiosidade e só fecha no fim*
-
## virada
*o que faz salvar e mandar para alguém*
-
## cta
-
```

```markdown
<!-- story -->
# {título}
*uma tela, uma ideia · 3 a 5 telas*
## tela 1 · gancho
-
## tela 2
-
## tela 3 · interação
*enquete, caixa de pergunta ou quiz*
-
## tela 4 · cta
*link, dm ou "responde aqui"*
-
```

```markdown
<!-- carrossel -->
# {título}
*um ponto por slide · 6 a 10 slides*
## capa
*a promessa em até 8 palavras*
-
## slide 2 · o problema
-
## slides 3 a 7 · um ponto por slide
-
## penúltimo · a virada
-
## último · cta
*salvar, comentar ou link*
-
```

```markdown
<!-- youtube -->
# {título}
*bullets para falar, não texto para ler*
## título e thumb
*3 opções de título · texto da thumb em até 4 palavras*
-
## gancho · 0 a 30s
*o que a pessoa ganha se ficar até o fim*
-
## capítulos
-
## fechamento
-
## cta
-
```

```markdown
<!-- e-mail -->
# {título}
## assunto
*3 opções · até 45 caracteres*
-
## preheader
-
## abertura
-
## corpo
-
## cta
-
## ps
-
```

`outro` mantém o molde atual (gancho, desenvolvimento, fechamento).

**Critérios de aceite**

1. `moldFor(format, title)` devolve o molde do formato. Formato desconhecido cai no de `outro`.
2. Com o roteiro vazio, o painel mostra uma pílula visível, **"começar pelo molde de {formato}"**,
   no lugar do ícone de arquivo atual (`src/content.jsx:275`). Um clique aplica o molde e abre a
   edição.
3. Trocar o formato de uma peça cujo roteiro **ainda é o molde intocado** do formato anterior
   (comparado sem a linha do título) troca o molde junto. Se o roteiro já foi mexido, nada muda.
4. As linhas `- ` vazias do molde não contam como tópico no cartão. `scriptLines` já exige texto
   depois do traço; isso continua valendo.
5. Teste em `npm test`: um molde por formato, o fallback e a regra do "molde intocado".

---

### 1.2 · Merlin na peça: ideia e roteiro

O painel da peça ganha uma faixa **Merlin** entre a ficha e o roteiro. A faixa mostra as ações da
**etapa atual**. As ações das outras etapas ficam num "outras" discreto. Esta história cria a
infraestrutura e entrega as ações de **ideia** e **roteiro**.

| Etapa | Ação | Tarefa no worker | Volta como | "usar" faz |
|---|---|---|---|---|
| ideia | 5 ângulos | `angles` (lista) | `type` = tipo do ângulo, `title` = título da peça nesse ângulo, `note` = a primeira frase falada | **usar aqui:** troca o título e põe a frase no gancho · **nova peça:** cria em ideia, mesmo formato e cliente, com o molde e esse gancho |
| roteiro | escrever roteiro | `scriptDraft` (texto) | markdown na estrutura do molde do formato | substitui o roteiro |
| roteiro | 3 ganchos | `hooks` (lista) | `title` = a frase, `note` = por que segura | troca a primeira linha da seção de gancho |

**O contexto** (`contentContext(piece)` em `content.jsx`; o worker corta cada campo, no padrão de
`LIST_TASKS`):

- da peça: título, formato (rótulo), etapa, data, roteiro atual (até 4.000 caracteres) e o molde
  do formato (até 1.500);
- do cliente, quando houver: nome, nicho (`niche`), o que vende (`sells`), dor (`pain`), nomes das
  ofertas e a página (`summary`, até 1.200 caracteres);
- títulos das últimas 30 peças do mesmo cliente, para não repetir ângulo nem pauta.

**Critérios de aceite**

1. A faixa Merlin aparece no painel com as ações da etapa atual. Em ideia, "5 ângulos"; em
   roteiro, "escrever roteiro" e "3 ganchos". As ações de outras etapas ficam acessíveis em
   "outras".
2. Ângulos: até 5, cada um com "usar aqui" e "nova peça". "Usar aqui" troca o título e o gancho
   com desfazer. "Nova peça" cria o cartão em ideia sem abri-lo e avisa "criada em ideia".
3. Escrever roteiro: a proposta aparece formatada (`Markdown`) com **usar** e **descartar**. Se já
   havia roteiro que não era o molde intocado, "usar" substitui com desfazer.
4. 3 ganchos: "usar" troca a primeira linha `- ` da primeira seção cujo título contém "gancho" (ou
   "capa", no carrossel; ou "tela 1", no story). Sem essa seção, a frase entra numa
   `## gancho` logo depois do `# título`. A troca é a função pura `setHook(script, line, format)`.
5. `angles`, `scriptDraft` e `hooks` seguem D1. Em Reels e story, o roteiro é o motor da
   `roteiro-viral`. Nos outros formatos, a lógica entra dentro do molde: gancho, virada e CTA
   amarrado. Em todos os formatos, o prompt proíbe número, resultado e case que não estejam no
   contexto e manda marcar com `[conferir]` o dado necessário que não foi confirmado.
6. Enquanto o Merlin pensa, os botões ficam desabilitados e um segundo clique não dispara outra
   chamada. Erros seguem o padrão das outras telas: 401 "entre para usar o Merlin", 503 com a
   mensagem do worker, 429 com a mensagem do teto e o resto com "o Merlin não respondeu".
7. A ação `script` do assistente (`server/worker.js:849`) passa a usar o formato da peça. O
   `setPageContext` da tela de conteúdo inclui o rótulo do formato e o molde.
8. Testes em `npm test` para `setHook` (com seção, sem seção, carrossel e story) e para
   `contentContext` (cortes de tamanho, peça sem cliente).

**Nota técnica: o rascunho com respiro.** O `Piece` grava o roteiro com um debounce de 500 ms e
guarda o texto em `draft` local. Aplicar uma proposta precisa **primeiro dar `flush()`** e depois
atualizar o `draft` **e** o documento. Se só o documento mudar, o próximo `flush` do textarea
grava o texto antigo por cima.

**Padrões a reaproveitar:** a pauta de reunião (`src/clients.jsx:396`) para a proposta em texto
com "usar"; o desdobrar da nota (`src/notes.jsx:265`) para a lista de sugestões.

---

### 1.3 · Merlin na peça: produção e publicação

As etapas do meio e do fim ganham trabalho. As duas ações escrevem **seções do roteiro** (D4) com
`upsertSection(script, heading, body)`: troca a seção se ela já existe, acrescenta no fim se não.

| Etapa | Ação | Tarefa | Seção |
|---|---|---|---|
| gravar, editar | produção | `production` (texto) | `## produção`: takes, B-roll literal por fala, texto na tela e pontos de corte (Reels e story) |
| agendado | publicação | `publish` (texto) | `## publicação`, conforme o formato (ver abaixo) |

O conteúdo de **publicação** depende do formato:

- **Reels, story e carrossel:** legenda (a primeira linha precisa segurar), corpo curto e CTA.
- **YouTube:** 3 títulos, texto da thumb e descrição com os capítulos do roteiro.
- **E-mail:** 3 assuntos e o preheader.

**Critérios de aceite**

1. "Produção" exige roteiro com pelo menos um tópico. Sem roteiro, o botão fica desabilitado e o
   título explica: "precisa de roteiro".
2. As duas propostas aparecem com **usar**, **copiar** e **descartar**. "Usar" grava a seção com
   desfazer. "Copiar" leva o markdown para a área de transferência.
3. Rodar a mesma ação de novo substitui a seção, não duplica.
4. "Virar tarefa" continua como está.
5. Teste em `npm test` para `upsertSection`: seção nova, seção existente, seção no meio do texto e
   roteiro vazio.

---

### 1.4 · Peças novas a partir do que existe: desdobrar e puxar pautas

Ataca a página em branco no nível do quadro. As duas ações devolvem uma lista de peças propostas,
cada uma com `type` = id do formato, `title` e `note`. A pessoa escolhe as que quer num diálogo
com as opções já marcadas, como no desdobrar da nota. Só as escolhidas nascem, todas em **ideia**
e sem data.

- **Desdobrar** (`spinOff`, até 5). O botão fica no painel de qualquer peça com roteiro e aparece
  em destaque em **publicado**. Exemplo: um YouTube vira 3 reels, 1 carrossel e 1 e-mail. As
  derivadas herdam o cliente e ganham `parent` com o id da peça de origem.
- **Puxar pautas** (`pautas`, até 8). O botão fica no topo do quadro **e no estado vazio**. O
  diálogo pergunta o cliente (padrão "meu") e aceita um tema opcional. O contexto é o do cliente
  (1.2) mais os títulos das últimas 30 peças dele, para não repetir.

**Critérios de aceite**

1. Sugestão com `type` que não é formato conhecido é descartada. A lista de formatos aparece nos
   dois lados (`FORMATS` em `content.jsx` e o prompt do worker), com o mesmo comentário de aviso
   que `NODE_TYPES` já tem.
2. `normalize` aceita `parent: String(d.parent || "")`. Documentos antigos continuam válidos.
3. O painel de uma derivada mostra "vem de {título}" com link para a origem. O painel da origem
   lista as derivadas.
4. O estado vazio do quadro oferece "puxar pautas" ao lado de "primeira ideia".
5. Nada nasce sem o clique em "criar". Criar várias peças avisa quantas foram, com desfazer que
   apaga todas.

---

### 1.5 · Ritmo de publicação: o quadro diz o que falta

É a tese do planner ("quanto ainda cabe") aplicada ao conteúdo.

- **Ritmo:** quantas peças se quer publicar, **por dia ou por semana**, por cliente (com `me`
  para o conteúdo próprio) e, se quiser, por formato. **O conteúdo próprio já nasce com 1 peça por
  dia, em qualquer formato, todos os dias** (D2). Os clientes começam sem ritmo. Exemplo de ritmo
  de cliente: "Fulano, 3 reels e 1 carrossel por semana".
- **Onde se define:** no topo da tela de conteúdo ("ritmo"). Dá para mudar a quantidade, o
  período, o formato e os dias que contam, por exemplo sem o fim de semana.
- **O topo:** o `Summary` passa a abrir com o que falta.
  - **Ritmo diário:** "hoje ainda sem peça · faltam **4 dias** nesta semana". A conta vai de hoje
    até domingo. Dia que já passou vazio não vira cobrança, porque o número é do que ainda cabe.
    Um dia está coberto quando tem pelo menos N peças com aquela data, em qualquer etapa.
  - **Ritmo semanal:** "faltam **2 reels** e **1 carrossel** nesta semana", contando as peças com
    data de segunda a domingo.
  - Com tudo coberto, o topo mostra "semana coberta". Com o ritmo zerado, fica como hoje.
- **Preencher:** cada falta é clicável. Abre as ideias sem data daquele cliente (e daquele
  formato, quando o ritmo tiver formato) para escolher. Cada ideia escolhida ganha o próximo dia
  vazio da semana. Se não houver nenhuma, oferece "puxar pautas" (1.4) já com o cliente e o
  formato preenchidos.

**Critérios de aceite**

1. O ritmo de `me` nasce em 1 por dia, em qualquer formato, todos os dias. Quantidade, período,
   formato e dias que contam são editáveis, e o ritmo pode ser zerado. A coleção nova entra em
   `PURGE_TYPES` (`src/shared/core.js:903`).
2. A conta é uma função pura com teste. Casos: ritmo diário com hoje vazio e com hoje coberto;
   dia passado vazio que não conta; dias que contam sem o fim de semana; ritmo semanal com a
   semana virando o mês; peça sem data; ritmo zero.
3. Falta sai em tom neutro, sem vermelho (regra 4).

---

## Critérios de sucesso do epic

- [x] Uma peça nova vai de ideia a roteiro completo, no formato certo, sem a pessoa digitar a
      estrutura.
- [x] Cada uma das seis etapas oferece pelo menos uma ação que produz algo: molde, proposta ou
      peça nova.
- [x] O quadro vazio deixa de ser beco sem saída: dá para sair dele com pautas do cliente.
- [x] Nenhuma ação do Merlin grava sem clique, e toda substituição tem desfazer.
- [x] O topo diz o que falta publicar hoje e no resto da semana, a partir do ritmo de 1 por dia.

**Como vamos saber se funcionou** (sem analytics, olhando os dados depois de 2 a 3 semanas de
uso): a fração de peças em "roteiro" ou depois com roteiro preenchido, e quantas peças nasceram
de "desdobrar" ou de "puxar pautas".

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| O Merlin inventa número ou case do cliente e isso vai ao ar | Alto | Regra 3 no prompt de todas as tarefas, `[conferir]` visível no roteiro, e o contexto limitado à ficha do cliente |
| "Usar" atropela um roteiro escrito à mão | Alto | Desfazer em toda substituição, mais o `flush()` antes de aplicar (nota da 1.2) |
| O teto de 30 por hora acaba numa sessão de criação intensa | Médio | Uma chamada por clique, sem disparo automático, e o botão travado enquanto pensa. Se o teto apertar no uso real, rever `ADVICE_PER_HOUR` |
| O vocabulário de formato diverge entre a tela e o worker | Médio | Descartar o desconhecido na tela, com o comentário nos dois lados (critério 1 da 1.4) |
| O contexto do cliente estoura o tamanho do pedido | Baixo | Corte por campo no worker, no padrão já usado em `LIST_TASKS` |

## Compatibilidade e rollback

- O documento de conteúdo mantém a forma. O único campo novo é `parent`, opcional, e `normalize`
  já espalha `...d`, então campo desconhecido atravessa intacto.
- A rota `/merlin` não muda de contrato: as tarefas novas devolvem `{text}` ou `{suggestions}` com
  os mesmos quatro campos que o worker já filtra.
- Rollback: as histórias são independentes por arquivo. Reverter o commit de uma história não
  quebra as anteriores.

## Definição de pronto

- [x] Critérios de aceite de cada história atendidos.
- [x] `npm test` e `npm run build` passando.
- [ ] Percorrido no navegador: criar uma peça em cada formato, levá-la de ideia a publicado usando
      as ações da etapa e desdobrá-la.
- [x] `VISAO.md` atualizado com a seção de conteúdo e as decisões D1 a D4.
- [ ] Nenhuma regressão no calendário, que lê a data das peças, nem no assistente, que propõe
      roteiro.
