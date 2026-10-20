# A saúde completa · sono, treino, alimentação e diário entram na área

**Status:** ✅ No ar desde 2026-10-20 (versão do worker `4ca6519e`, PRs #68 a #73). Descoberta feita pelo orquestrador em 2026-10-20, com autonomia dada
pelo Arthur (despachar, mergear e publicar). Decisões **(orq.)** foram tomadas pelo orquestrador e
ficam para revisão; as **(Arthur)** vieram dele.
**Owner:** Arthur Reis
**Criado em:** 2026-10-20
**Origem:** o desenho de 20/10, que abre a área saúde em hábitos, diário, treino, sono e
alimentação. Vem depois da [secretária](a-secretaria.md) e do [menu por área](o-menu-por-area.md);
o próximo da fila é "meu negócio".

## Objetivo

A pessoa diz ao Merlin "dormi 7h", "treinei perna 40min", "almocei salada", e isso fica guardado
na área saúde, onde ela vê a semana e corrige. O Merlin passa a responder "como dormi essa
semana?" e lembra do treino do dia no "o que falta hoje?".

## Por que agora

- **A saúde é só hábitos** (`src/shared/core.js:253-257`: "os hábitos são a saúde inteira, por
  enquanto"). A marca do hábito é booleana (`src/shared/habits-data.js:22-42`): "treinei peito
  40min" vira só a marca em "treinar", e o "peito" e os "40min" se perdem. "dormi 7h" não tem
  onde cair.
- **O diário não tem histórico.** A página saiu em 09/10 (VISAO §9.3) e o "como foi o dia" mora
  só no Hoje (`src/shared/today-block.jsx:19-79`), um dia por vez. O que se escreveu antes não se
  relê em lugar nenhum.
- A VISAO §13.7 já previa: "uma gaveta nova (o sono, o treino) é uma aba a mais na área dela", e
  só entra quando tiver um verbo na conversa.

## Para quem

O Arthur e o público dev do Merlin: quem já usa a conversa como entrada e quer que o corpo entre
no mesmo lugar que o trabalho e o dinheiro, sem um app de saúde à parte.

## Regras que não se quebram

- **Cada gaveta nasce com o seu verbo.** Nenhuma aba entra sem o registro pela conversa
  funcionando no mesmo ticket (VISAO §13.7).
- **Nada grava sem toque.** A captura e o chat propõem um cartão; a pessoa confirma; o desfazer
  apaga.
- **Texto livre de saúde nunca vai para a IA no retrato.** Só números agregados de 7 dias.
- **Sem culpa.** Alimentação não tem calorias, nota nem "bom ou ruim". Sono não tem qualidade.

## Decisões

- **D1. Coleções novas, não tipos de hábito (orq.).** `sleep` (um documento por noite, id = data
  em que acordou), `workouts` e `meals` (um por registro). A marca do hábito continua booleana.
  Sem migração no D1: `docs` aceita qualquer tipo que passe em `DOC_TYPE` (`server/worker.js:69`).
- **D2. Uma página e uma aba por gaveta (orq.).** `sleep.html`, `training.html`, `meals.html` e
  `journal.html`, cada uma com o seu `src/*.jsx`, como manda o CLAUDE.md. Ordem em
  `SECTIONS.health`: hábitos, sono, treino, alimentação, diário. Todas mostram a **semana**
  (`PeriodNav`), com `+` que abre `<Form>`, vazio com modelos (`EmptyStart`) e apagar com desfazer.
  Em 390px a semana vira lista vertical.
- **D3. O diário ganha aba em saúde e continua no Hoje (orq.).** A aba é o histórico, em cartões
  por dia, editáveis ali, gravando na mesma coleção `journal`. O bloco do Hoje e o "fechar o dia"
  ficam como estão. A busca passa a levar a `journal.html#data`. `journal` entra em
  `PURGE_TYPES` (`core.js:878`). Exceção consciente: não há `+`, o dia é o `+`.
- **D4. Treino marca o hábito (orq.).** Registrar um treino marca, no mesmo dia, o hábito cujo
  nome casa com "trein*" (ou o hábito citado), se existir. Não cria hábito. O desfazer desfaz os
  dois. A confirmação fica numa linha: "✓ registrado · perna · 40 min · hábito treinar marcado".
- **D5. Verbos novos (orq.).** A captura ganha os kinds `sleep`, `workout` e `meal`; "treinei" sem
  detalhe continua `habit`. O chat ganha as ações `sleep-log`, `workout-log` e `meal-log`.
  Confirmações: "✓ registrado · 7h de sono · noite de 20/10", "✓ registrado · perna · 40 min",
  "✓ anotado · almoço · salada". A data só aparece quando não é hoje. "dormi 7h" grava no dia em
  que acordou.
- **D6. Retrato: uma seção "saúde" de até 160 caracteres (orq.).** Sono e treino em números de 7
  dias, alimentação só como contagem. Hábitos cai de 170 para 120 e a agenda cede o resto, para o
  total seguir abaixo de `PORTRAIT_MAX` (6000). Refeição e diário em texto nunca entram.
- **D7. Interruptor "não mandar saúde ao Merlin" no perfil (Arthur).** Dado de saúde é sensível
  (LGPD, art. 5º, II). Ligado, a seção saúde sai do retrato; hábitos continua. É por pessoa e
  sincroniza como as outras preferências. A página de privacidade continua para depois (D10 da
  secretária).
- **D8. O treino do dia entra no "o que falta hoje?" (Arthur).** Se há um hábito de treino
  esperado hoje (`isExpected`) e nenhum treino nem marca hoje, vira uma quest "treinar" em "agora",
  com o atalho de registrar. É uma exceção estreita à D4 da secretária (hábitos fora das quests):
  só treino, não os outros hábitos.
- **D9. Sem interruptor novo de servidor (orq.).** `MERLIN_PORTRAIT_OFF` já cobre o retrato, e os
  cartões só gravam com toque.
- **D10. Medição (orq.).** O indicador é haver documentos em `sleep`, `workouts` e `meals` em
  produção e a contagem por kind de captura em `usage` quando o caminho passa pelo Worker.

## Fora de escopo

Apple Health, Google Fit e relógios; calorias, macros, peso e IMC; plano de treino, séries e
cargas; qualidade e fases do sono; lembretes e notificações; gráficos além da semana; um conselho
de saúde dedicado; outras quests de hábito além do treino; o diário no retrato; a página de
privacidade; migrar quem já tem um hábito "dormir 7h".

## Riscos e como saber se funcionou

- **Dupla marcação de treino.** Coberto pela D4.
- **Data do sono.** "dormi 7h" às 8h é a noite que terminou hoje; a pílula escreve "noite de dd/mm".
- **Cinco abas no celular.** O dock da área precisa caber em 390px; se não couber, o diário sai do
  dock primeiro (já vive no Hoje).
- **Retrato no teto.** Teste que monta o pior caso e confere `<= 6000` e que nenhum texto de
  refeição ou diário aparece.
- **Funcionou se:** em produção, "dormi 7h", "treinei perna 40min" e "almocei salada" viram
  registros nas abas; "como dormi essa semana?" responde com a média; o interruptor tira a saúde
  do retrato; o treino aparece no "o que falta hoje?" quando é dia de treino.

## Tickets

Milestone "saúde completa" (#62 a #67), com as dependências nativas declaradas.

| ticket | o que entrega | bloqueado por | pts |
| --- | --- | --- | --- |
| T1 · #62 | O diário volta como aba em saúde, com os dias anteriores | — | 2 |
| T2 · #63 | O sono ganha aba e se registra pela conversa ("dormi 7h") | #62 | 5 |
| T3 · #64 | O treino ganha aba, e "treinei perna 40min" grava a sessão e marca o hábito | #63 | 5 |
| T4 · #65 | A alimentação ganha aba, e "almocei salada" vira refeição | #64 | 3 |
| T5 · #66 | O Merlin responde "como dormi essa semana?", e a pessoa pode tirar a saúde dele | #63 | 3 |
| T6 · #67 | O treino do dia aparece no "o que falta hoje?" | #64 | 2 |

Ondas: 1) T1 · 2) T2 · 3) T3 e T5 · 4) T4 e T6.
