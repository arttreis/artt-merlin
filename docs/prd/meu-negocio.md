# Meu negócio · caixa da empresa, plano, time e operação

**Status:** 🚧 Em execução. Descoberta feita pelo orquestrador em 2026-10-20, com autonomia dada
pelo Arthur. Decisões **(orq.)** foram tomadas pelo orquestrador e ficam para revisão; as
**(Arthur)** vieram dele.
**Owner:** Arthur Reis
**Criado em:** 2026-10-20
**Origem:** o desenho de 20/10: "meu negócio" → recursos humanos (produtividade, funcionários),
financeiro, vendas (crm, produtos), operação e planejamento (anual, semestral, trimestral). Vem
depois da [saúde completa](saude-completa.md).

## Objetivo

Quem tem um negócio pequeno (dev, founder solo ou com um time curto) diz ao Merlin "recebi 2.400
da Acme na empresa", "meta do tri: 10 clientes", "a Ana entregou a landing", "emiti as notas", e
isso cai numa área própria, separada da vida pessoal. O Merlin passa a responder "como está o caixa
da empresa?" e "como estou na meta?".

## Por que agora

- **O dinheiro da empresa e o pessoal estão misturados.** A coleção `finance` não tem marca de
  livro, e a categoria padrão `"Básicas/PJ"` ao lado de `"Básicas/PF"`
  (`src/shared/finance-data.js:16`) mostra que as pessoas já separam à mão.
- **Não existe planejamento.** Os planos saíram em 09/10 (VISAO §9.3) sem nunca ter tido documento:
  eram três colunas de checklist, sem verbo e sem nada que se medisse sozinho.
- **Time e operação não têm onde morar.** Quem tem um freela fixo ou obrigações mensais (notas,
  DAS, backup) guarda isso fora do Merlin.

## Para quem

O público dev do Merlin que tem um negócio: solo ou com poucas pessoas. O app continua de uma
pessoa só: ninguém do time loga, e os dados do time são anotações do dono.

## Regras que não se quebram

- **Cada aba nasce com o seu verbo na conversa** (VISAO §13.7).
- **Uma página mora numa área só** (`sectionOf`, `core.js:294`). Nada é duplicado no menu.
- **Nada grava sem toque**, e todo registro tem desfazer.
- **Na dúvida entre pessoal e empresa, o Merlin pergunta.** A proposta abre com "pessoal | empresa"
  pré-marcado em pessoal; nunca chuta em silêncio.
- **Time não é vigilância.** Só entregas que o dono anota. Sem horas, ponto, ranking ou login.
- **Nome e salário de gente do time nunca vão para a IA no retrato.** Só contagem e custo total.

## Decisões

- **D1. Vendas fica no inbox (Arthur).** Leads e clientes continuam onde se responde (VISAO §13.1).
  O negócio só **lê** clientes (ex.: "6 clientes ativos") e leva a `clients.html`. Produtos
  continuam abrindo o trabalho (§9.5).
- **D2. A área (orq.).** `{ id: "business", label: "meu negócio" }`, entre trabalho e organização,
  com 4 abas que cabem no dock em 390px sem `spare`: **plano** (`plans.html`), **caixa**
  (`cash.html`), **time** (`team.html`), **operação** (`ops.html`).
- **D3. Caixa = o mesmo financeiro com um livro (orq.).** Todo documento de `finance` ganha
  `book: "personal" | "business"` (ausente = pessoal; nada migra). Um adaptador puro filtra e
  carimba o livro, e a página do caixa reaproveita os componentes do financeiro com a aba Mês, os
  fixos e "a receber", e quatro números no topo: entrou, saiu, sobra do mês e **fôlego** (saldo ÷
  média de saída de 3 meses). Sem 50/30/20, cartão ou dívidas. O financeiro pessoal deixa de ver o
  livro da empresa. `finance-entry` ganha `book`; "a empresa", "PJ", "na empresa" ou um cliente
  citado querem dizer empresa.
- **D4. Plano: ano, semestre e trimestre (Arthur).** Uma meta-norte no ano, uma no semestre e até
  3 no trimestre (o "+" some na 3ª: "três já é muito para um trimestre"). O trimestre fica aberto
  com `PeriodNav`; ano e semestre são uma linha cada, com barra. **A meta se mede sozinha** quando
  escolhe uma fonte: receita do caixa, clientes ativos, leads fechados, produto lançado ou pessoas
  no time; "à mão" é permitido e marcado como tal. Mês e semana ficam com o calendário. Reaproveita
  a coleção `plans` e `plans.html`. Verbo: "meta do tri: 10 clientes" (ação `goal-set`). Isto
  muda VISAO §4.10 e §9.3 de propósito: o que matou os planos foi não ter número nem retorno.
- **D5. Time: cadastro leve (Arthur).** Nome, papel, custo por mês (opcional; com custo, "lançar
  como fixo no caixa" vem marcado) e desde quando. Abrir uma pessoa mostra as entregas anotadas e um
  campo "próxima conversa". "Saiu do time" arquiva e mantém as entregas. Verbos: "a Ana entra como
  designer, 3 mil" e "a Ana entregou a landing". Coleção `team`.
- **D6. Operação: processos com prazo (Arthur).** Processos recorrentes com frequência e dia
  ("emitir notas · todo dia 5"), checklist opcional e "esta semana" no topo. Marcar feito grava a
  data. **O que vence hoje aparece no "o que falta hoje?"**, sem criar tarefa no calendário (a
  rotina é tempo; a operação é prazo). Verbos: "todo dia 5 emito as notas" e "emiti as notas".
  Coleção `ops`.
- **D7. Retrato: seção "negócio" de até 260 caracteres (orq.).** Caixa hoje, fim do mês, fôlego,
  metas do tri com progresso, nº de pessoas no time e custo total, processos que vencem na semana.
  A agenda e a rotina cedem os 260. Fonte "negócio" em `SOURCES` e no Worker. Cai com
  `MERLIN_PORTRAIT_OFF`.
- **D8. Confirmações do chat (orq.).** "✓ lançado no caixa · R$ 2.400 · Acme", "✓ meta do 4º tri ·
  10 clientes ativos (hoje 6)", "✓ no time · Ana · design · R$ 3.000/mês", "✓ anotado · Ana ·
  landing", "✓ feito · emitir notas · outubro".
- **D9. Sem interruptor de servidor novo (orq.).** Nada grava sem toque. Medição: documentos com
  `book: "business"` e em `plans`, `team` e `ops` em produção, e a contagem por ação em `usage`.

## Fora de escopo

Nota fiscal, impostos calculados, DAS automático, folha de pagamento e pró-labore automático;
conciliação bancária, Open Finance, ERP e Stripe; multiusuário e login de funcionário; horas,
ponto e ranking; tela nova de vendas, pipeline com valores e catálogo com preço; OKR em cascata;
planos mensal e semanal; mover lançamentos antigos "PJ" para a empresa automaticamente.

## Riscos e como saber se funcionou

- **Lançamento no livro errado** é o maior risco: por isso o seletor na dúvida e o teste de que o
  pessoal nunca vê o da empresa e vice-versa.
- **O plano morrer de novo:** a medição automática entra no mesmo ticket que a página.
- **Operação × rotina × calendário:** o texto da tela vazia marca que operação é prazo.
- **Retrato no teto:** teste de pior caso `<= 6000` e de que nenhum nome do time aparece.
- **Funcionou se:** em produção, "recebi 2.400 da Acme na empresa" cai no caixa e não no pessoal;
  uma meta com fonte "clientes" anda sozinha; o processo do dia aparece no "o que falta hoje?";
  "como está o caixa da empresa?" responde com o fôlego.

## Tickets

Milestone "meu negócio" (#75 a #80), com as dependências nativas declaradas.

| ticket | o que entrega | bloqueado por | pts |
| --- | --- | --- | --- |
| T1 · #75 | A área "meu negócio" nasce com o caixa da empresa, e "recebi 2.400 da Acme na empresa" vai para lá | — | 5 |
| T2 · #76 | O Merlin responde "como está o caixa da empresa?" | T1 | 3 |
| T3 · #77 | O plano volta com ano, semestre e trimestre, e as metas com número se medem sozinhas | T1 | 5 |
| T4 · #78 | O time ganha aba: quem trabalha com você, quanto custa e o que entregou | T1 | 5 |
| T5 · #79 | A operação ganha aba, e o processo que vence hoje aparece no "o que falta hoje?" | T1 | 5 |
| T6 · #80 | O retrato do negócio ganha metas, time e operação, e o Merlin responde "como estou na meta?" | T2, T3, T4, T5 | 2 |

Ondas: 1) T1 · 2) T2, T3, T4 e T5 · 3) T6.
