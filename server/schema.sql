-- merlin · o banco
--
-- cinco tabelas e nenhuma a mais. o produto guarda um documento por dia por
-- pessoa; o resto aqui existe so para saber quem e voce sem pedir senha e
-- para que ninguem gaste sozinho a chave que e do time.

-- quem usa. o e-mail e a identidade: nao ha nome, nem perfil, nem foto.
-- cada linha aqui e um Merlin inteiro e separado: nenhuma consulta do worker
-- cruza o `person` que veio da sessao, entao duas pessoas na mesma casa nao
-- se veem. o time nao compartilha dado — compartilha a porta de entrada.
CREATE TABLE IF NOT EXISTS people (
  id          TEXT PRIMARY KEY,          -- uuid
  email       TEXT NOT NULL UNIQUE,      -- sempre normalizado em minusculas
  created_at  INTEGER NOT NULL           -- epoch ms
);

-- o codigo que chega por e-mail. guardamos o HASH, nunca o codigo:
-- quem ler o banco nao consegue entrar na conta de ninguem.
-- nada apaga a linha vencida, e esta certo assim: entrar confere o
-- expires_at na hora, e o limite por e-mail so conta as nao vencidas.
-- num time de uma dezena de pessoas a tabela cresce algumas centenas por ano.
CREATE TABLE IF NOT EXISTS codes (
  hash        TEXT PRIMARY KEY,          -- sha-256 de (codigo + email)
  email       TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,          -- epoch ms
  attempts    INTEGER NOT NULL DEFAULT 0,-- erros de digitacao; 5 e queima o codigo
  used        INTEGER NOT NULL DEFAULT 0 -- 1 depois de trocado por sessao
);
CREATE INDEX IF NOT EXISTS codes_email ON codes(email);
CREATE INDEX IF NOT EXISTS codes_expires_at ON codes(expires_at);

-- o dia. um por pessoa por data — e a mesma forma que ja vive no localStorage.
-- guardado como texto JSON: o servidor nao precisa entender tarefa nenhuma,
-- so devolver o documento e dizer qual e mais novo.
CREATE TABLE IF NOT EXISTS days (
  person   TEXT NOT NULL,
  day      TEXT NOT NULL,             -- 'YYYY-MM-DD', a data local de quem escreveu
  doc      TEXT NOT NULL,             -- o estado inteiro, JSON
  v        INTEGER NOT NULL,          -- o mesmo carimbo que o cliente ja usa
  PRIMARY KEY (person, day),
  FOREIGN KEY (person) REFERENCES people(id) ON DELETE CASCADE
);
-- "o que mudou desde a ultima vez que sincronizei" e a unica consulta que o
-- cliente faz alem de ler um dia especifico.
CREATE INDEX IF NOT EXISTS days_person_v ON days(person, v);

-- os documentos dos outros modulos: uma ideia, um cliente, um mapa, um
-- lancamento. mesma forma do dia — JSON opaco com carimbo — mas por (type, id)
-- em vez de por data. o servidor continua nao entendendo o que ha dentro.
CREATE TABLE IF NOT EXISTS docs (
  person   TEXT NOT NULL,
  type     TEXT NOT NULL,             -- 'ideas', 'clients', 'maps', ...
  id       TEXT NOT NULL,             -- o id que o cliente deu ao documento
  doc      TEXT NOT NULL,             -- JSON; {"deleted":true} e um tumulo
  v        INTEGER NOT NULL,
  PRIMARY KEY (person, type, id),
  FOREIGN KEY (person) REFERENCES people(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS docs_person_type_v ON docs(person, type, v);

-- quantos conselhos cada pessoa ja pediu na hora corrente. a chave da
-- Anthropic e uma so para o time inteiro: sem esta conta, uma pessoa sozinha
-- gasta o mes de todo mundo, e ninguem descobre antes da fatura.
-- a coluna hour guarda a hora (epoch ms dividido por 3.600.000) vezes 4, mais
-- a cota: 0 o conselho, 1 a leitura do inicio, 2 a montagem (QUOTA, no
-- worker). sao tres tetos sem tres tabelas. a linha da hora que passou
-- nunca mais e lida. ninguem apaga, e esta certo assim: sao poucas linhas por
-- pessoa por dia, e apagar custaria uma escrita a mais em toda chamada.
CREATE TABLE IF NOT EXISTS advice (
  person  TEXT NOT NULL,
  hour    INTEGER NOT NULL,         -- (epoch ms / 3600000) * 4 + cota
  n       INTEGER NOT NULL,
  PRIMARY KEY (person, hour),
  FOREIGN KEY (person) REFERENCES people(id) ON DELETE CASCADE
);

-- quantos pedidos cada pessoa fez ao Merlin por dia e por tarefa, e quantos
-- tokens eles gastaram (o `usage` que a Anthropic devolve). a `advice` acima
-- e o teto e some de vista a cada hora; esta e a conta: e ela que mostra o que
-- cada tarefa custa, e quanto o retrato deixa a pergunta mais cara.
-- so contagem, nunca o texto do pedido nem o da resposta. o dia e AAAA-MM-DD
-- em UTC (o worker nao sabe o fuso de quem pede). a tarefa e o nome que o
-- worker da ao pedido (usageTasks): assistant:action, capture:task, build:draft...
-- nenhuma rota le esta tabela: ela se consulta pelo `wrangler d1 execute`.
CREATE TABLE IF NOT EXISTS usage (
  person      TEXT NOT NULL,
  day         TEXT NOT NULL,            -- AAAA-MM-DD, UTC
  task        TEXT NOT NULL,
  n           INTEGER NOT NULL,
  tokens_in   INTEGER NOT NULL,
  tokens_out  INTEGER NOT NULL,
  PRIMARY KEY (person, day, task),
  FOREIGN KEY (person) REFERENCES people(id) ON DELETE CASCADE
);

-- o link publico de um mapa ou de um funil. e a UNICA porta deste servidor que
-- responde sem sessao, e por isso ela e a mais estreita de todas: uma linha
-- aqui autoriza a leitura de UM documento, de UM tipo, de UMA pessoa.
--
-- o que a linha guarda nao e o documento, e o endereco dele: o link mostra a
-- versao de agora, e nao a de quando foi criado. e a expectativa de quem manda
-- um funil para o cliente e continua mexendo nele — e o preco e que o que voce
-- escrever ali depois tambem fica publico. apagar a linha corta o acesso na
-- hora, e e por isso que revogar e uma linha de SQL e nao uma expiracao.
--
-- o token e o segredo inteiro: 16 bytes aleatorios em base64url. nao ha
-- adivinhacao possivel, e nao ha enumeracao — a chave primaria e ele, e nao
-- um numero em sequencia.
CREATE TABLE IF NOT EXISTS shares (
  token   TEXT PRIMARY KEY,        -- 22 caracteres base64url
  person  TEXT NOT NULL,
  type    TEXT NOT NULL,           -- 'maps' ou 'funnels', e mais nada
  id      TEXT NOT NULL,           -- o id do documento
  at      INTEGER NOT NULL,        -- epoch ms de quando o link nasceu
  UNIQUE (person, type, id),
  FOREIGN KEY (person) REFERENCES people(id) ON DELETE CASCADE
);
-- "este documento ja tem link?" e a pergunta que a tela faz ao abrir
CREATE INDEX IF NOT EXISTS shares_person ON shares(person, type, id);

-- a lista de espera da landing (index.html, docs/prd/landing.md). quem chega
-- de fora abre o Merlin sem conta, mas a conversa com ele e a sincronizacao
-- pedem uma, e as contas abrem aos poucos (VISAO, 8.6). esta tabela nao tem
-- `person` porque ainda nao ha pessoa: e so o endereco e quando ele chegou.
-- entrar na lista nao abre porta nenhuma — quem entra continua sendo quem
-- esta em OWNER_EMAILS.
CREATE TABLE IF NOT EXISTS waitlist (
  email       TEXT PRIMARY KEY,         -- normalizado em minusculas, como em people
  created_at  INTEGER NOT NULL          -- epoch ms
);
-- o teto da rota conta quantos chegaram na ultima hora
CREATE INDEX IF NOT EXISTS waitlist_created_at ON waitlist(created_at);
