# Como o Merlin é construído · o workflow

Uma pessoa decide, agentes executam. O trabalho do humano é **gerir informação e decidir**:
o que construir, o que entra e o que fica de fora, e o que pode ir para a `main`. O código é o
meio. Este documento é o contrato que os agentes seguem (`CLAUDE.md` aponta para cá).

```
ideia ─► descoberta ─► PRD ─► tickets (issues + grafo) ─► ondas ─► PR ─► review humano ─► merge ─► deploy ─► produção
          PM + design   docs/prd   milestone              orquestrador   CI + QA     (você)         próxima onda
```

## As três camadas

### 1. Descoberta → `/discovery`

Uma conversa com o `product-manager` e o `design-specialist` fecha o problema, o escopo, o
**fora de escopo**, a apresentação e o risco. Sai daqui:

- **o PRD** em `docs/prd/<slug>.md`, que é a fonte de verdade da feature. Se a ideia mudar,
  o PRD muda primeiro e o resto deriva dele;
- **os tickets** como GitHub Issues num **milestone**, com as dependências nativas
  (`blocked by`) declaradas explicitamente.

### 2. Execução em ondas → `/wave-orchestrator <milestone>`

O orquestrador **não escreve código**. Ele lê o milestone, monta o grafo de dependências, divide
em ondas, abre um worktree com um agente `implementer` por ticket desbloqueado (T3 Code,
`delegate_task`), monitora PR, CI e reviews e faz a triagem do que volta.

- **O paralelismo vem do grafo**, não da quantidade de tickets. Três tickets sem bloqueador
  entram juntos na primeira onda. Um quarto que depende dos três só começa quando os três
  PRs estiverem **mergeados**.
- **Toda onda nasce da `origin/main` atualizada.** Nenhuma branch depende de código que ainda
  não foi mergeado: menos conflito, e o CI roda contra o que vai para produção.
- **O merge é seu.** O fluxo não faz merge sozinho, porque o review humano é o quality gate.
  Quando você faz o merge, o orquestrador recalcula o grafo e libera a próxima onda.

Dentro de cada worktree, o `implementer` implementa só o ticket. Ele combina o contrato com o
`test-specialist`, que escreve os testes em paralelo, e chama o `qa-tester` para verificar no
navegador. Depois abre o PR com `Closes #n` e reporta ao orquestrador.

### 3. Documentação como fonte de verdade

Com agentes escrevendo o código, ninguém conhece cada detalhe dele. O que mantém o sistema
compreensível é a documentação, e manter documentação atualizada ficou barato. Ela faz parte
de toda entrega:

- `docs/arquitetura/c4.md`: os diagramas C4 (contexto, contêineres, componentes) para
  entender como as partes se relacionam sem descer ao código;
- `PROJETO.md`, `README.md`, `server/README.md`, `src/shared/README.md`: o mapa;
- `VISAO.md`: as decisões e os princípios.

PR que torna um desses documentos falso atualiza o documento no mesmo PR.

## O ticket é o prompt

Um ticket precisa ser **executável por um agente sem contexto implícito**. "Adicionar
transações recorrentes" não é um ticket. O formato está em
[`.github/ISSUE_TEMPLATE/ticket.md`](../.github/ISSUE_TEMPLATE/ticket.md), e todo ticket tem:

- título imperativo e específico
- o problema e por que resolver (com `arquivo:linha` do estado atual)
- escopo e **fora do escopo explícito**
- comportamento esperado, incluindo os estados vazio, de erro e o desfazer
- detalhes técnicos, e os módulos, funções e arquivos afetados
- critérios de aceite verificáveis
- cenários de teste
- `Bloqueado por` (o espelho legível da dependência nativa)
- rollout e kill switch, quando há risco
- como saber se funciona (eventos, métricas, logs)
- dados, privacidade (LGPD) e isolamento por pessoa, quando se aplica

O orquestrador **não despacha** ticket sem critérios de aceite, escopo ou fora de escopo.
Mais agentes não consertam uma especificação ruim.

### Regras de quebra

- cada ticket produz **um PR revisável**, e o alvo é ficar abaixo de ~400 linhas não triviais
- ticket com mais de 5 pontos é quebrado (escala 1, 2, 3, 5)
- nunca há ticket separado só para testes: o teste vai junto com o código que ele prova
- migração e schema ficam no mesmo ticket que os usa
- não existe ticket de "foundation" com funções para uso futuro
- as fatias são verticais: cada ticket entrega algo demonstrável
- feature arriscada já nasce com rollback e observabilidade
- o grafo é declarado explicitamente, nunca inferido pelo título

## Estados no GitHub

O estado do fluxo vive no GitHub, e é por isso que o orquestrador consegue retomar de onde
parou:

| estado | como se vê |
| --- | --- |
| no backlog | issue aberta com a label `ticket` |
| bloqueado | tem algum `blocked by` ainda aberto |
| pronto | todos os bloqueadores estão fechados |
| em andamento | label `em-andamento` (o implementer põe) |
| em review | label `em-review` e um PR aberto com `Closes #n` |
| feito | PR mergeado, e o `Closes` fecha a issue |

O tamanho fica nas labels `pontos:1`, `pontos:2`, `pontos:3` e `pontos:5`.

## Portões de qualidade

1. **No worktree:** os testes afetados, `cd server && npm test` (servidor e navegador) e
   `npm run build`. Se o ticket muda tela, o `qa-tester` verifica os critérios no navegador.
2. **No PR:** o CI (`.github/workflows/ci.yml`) roda o mesmo portão do `npm run deploy`. O
   orquestrador separa falha real de run cancelado por push novo.
3. **Review humano:** você lê o diff contra o ticket e faz o merge.
4. **Depois do merge:** o `.github/workflows/deploy.yml` publica sozinho, com o mesmo
   `npm run deploy` (testes → build → deploy); teste quebrado não sobe. Acompanhe o run em
   Actions (ou `gh run watch`). Para publicar sem merge, rode o workflow à mão
   (`gh workflow run deploy`) ou `cd server && npm run deploy` local. Teste em
   produção o caminho principal, olhe os logs (`npx wrangler tail`) e as métricas que o
   ticket definiu. Se der errado, abra um ticket de correção e o ciclo recomeça.

## Mudanças que não passam pelo fluxo

Documentação, PRD e ajuste trivial de uma linha podem ir direto para a `main`, no estilo de
commit da casa. Todo código de feature passa por ticket e PR.
