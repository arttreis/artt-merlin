# Merlin · instruções para agentes

Sistema pessoal de produtividade: React 19 + Vite no navegador (`localStorage`), sincronizado
por documento num Cloudflare Worker + D1. Comece por aqui e siga os ponteiros, não adivinhe.

## Leia antes de mexer

| arquivo | quando |
| --- | --- |
| [docs/workflow.md](docs/workflow.md) | **sempre**: como o trabalho é feito (descoberta → tickets → ondas → PR → merge) |
| [PROJETO.md](PROJETO.md) | o mapa do código: camadas, páginas, dados, API, convenções |
| [docs/arquitetura/c4.md](docs/arquitetura/c4.md) | como as partes se relacionam, sem descer ao código |
| [VISAO.md](VISAO.md) | decisões e princípios do produto (não re-litigue o que está lá) |
| [src/shared/README.md](src/shared/README.md) | como um módulo é feito |
| [server/README.md](server/README.md) | o Worker: rotas, segredos, segurança do login |
| `docs/prd/` | o PRD da feature em que você está |

## Comandos

```bash
npm install && (cd server && npm install)
npm run dev              # front em http://localhost:8765 (sem API)
cd server && npm run dev # build + wrangler dev: front + API juntos
cd server && npm test    # testes do servidor + do navegador (o portão)
npm run build            # gera server/site/
```

Teste é script Node puro, sem framework: `src/shared/*.test.mjs`, `src/shared/test.mjs` e
`server/test.mjs`. Teste novo entra no mesmo estilo e no script `test` do `package.json`.

## Regras que não se quebram

- Nunca escreva no `localStorage` direto: use `collection()` / `useCollection()`.
- Página nova = `nome.html` na raiz + `src/nome.jsx` + uma aba numa seção de `SECTIONS`
  (`core.js`). Página nova não ganha item próprio na barra.
- Lógica que pode ser pura vai para `src/shared/*.js`, com teste.
- Nenhuma consulta no servidor cruza a coluna `person` (teste `13d`).
- Identificadores, chaves, rotas e classes em inglês; tela e comentários em português, com
  acentuação correta.
- Sem `React.StrictMode`. Criar é um botão "+" que abre `<Form>`. Tela vazia oferece modelos.
- `.claude/`, `AGENTS.md` e `server/site/` são ignorados pelo git. Não os versione.

## Commits

Em português, com o assunto descrevendo **o efeito para quem usa**, numa frase (veja o
`git log`). O corpo explica o porquê e o preço da decisão. Código de feature entra por PR
(`docs/workflow.md`). Só documentação e ajuste trivial vão direto para `main`.

## Quando terminar uma mudança

Atualize a documentação que o seu código tornou falsa (README, PROJETO, C4, PRD) no mesmo PR.
