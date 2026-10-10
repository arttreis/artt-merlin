# o app de desktop

O Merlin instalado no Windows (e, depois, no Mac): a janela inteira do sistema, o
**rastreador** — uma janela pequena que fica por cima do trabalho dizendo quanto ainda
cabe no dia — e um ícone na bandeja. É a VISAO, 8.5.

## Uma casca, e não uma cópia

As duas janelas abrem o site publicado (`merlin.arttreis.com.br`). Nada do front é
empacotado aqui, e isso foi escolha:

- **o login continua funcionando sem mudar nada.** A sessão é um cookie `SameSite=Lax`,
  que só vale no domínio do site (`server/README.md`). Com o site empacotado dentro do
  app, a página rodaria em outra origem, o cookie viraria de terceiro e o login não
  grudaria — seria preciso trocar a sessão por token.
- **o que sai num deploy aparece no app** sem reinstalar e sem atualizador.

O preço: **o app precisa de rede para abrir.** Depois de aberto, ele funciona sem conexão
como o site funciona (os dados estão no navegador embutido); abrir do zero sem rede mostra
o erro do WebView2. Um service worker resolve isso, e é o próximo passo.

A página do rastreador é `tracker.html`, na raiz do site, como qualquer outra. **Ela
precisa estar publicada** (`cd server && npm run deploy`) antes de o app apontado para
produção conseguir mostrá-la.

## O que só o app tem

Tudo em [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs):

| o quê | como |
| --- | --- |
| rastreador | `tracker.html` numa janela de 380 de largura, sem moldura, sempre por cima, fora da barra de tarefas. Em repouso é uma **faixa** de 48px: o número, o que é agora e a barra do dia como um fio. Clicar abre o cartão; voltar para o trabalho (ou `Esc`) recolhe. A altura é sempre a do conteúdo, e perto do pé da tela ela cresce para cima. Nasce no canto de baixo à direita; depois fica onde você deixou (arrasta pelo logo) |
| bandeja | clique mostra ou esconde a faixa; o menu abre o Merlin, liga "abrir com o Windows" e sai. O tooltip repete o número grande (`merlin · 2h31 ainda cabe · agora: …`) |
| atalho global | `Alt+Shift+M` de qualquer programa abre o rastreador com o cursor no campo |
| fechar | fechar a janela grande (ou dar `Alt+F4` no rastreador) esconde. Quem sai é o "Sair" da bandeja |
| abrir com o sistema | desligado até você ligar no menu. Aberto assim, entra só o rastreador |
| uma instância | abrir o app de novo traz a janela do que já está aberto |

O site fala com o app por [`src/shared/desktop.js`](../src/shared/desktop.js), que no
navegador vira nada. A capability [`remote.json`](src-tauri/capabilities/remote.json)
deixa só os endereços do Merlin pedirem alguma coisa ao app — e só cinco coisas: arrastar
a janela, mudar o texto da bandeja, abrir a janela grande, esconder o rastreador e
ajustar a altura dele.

## Rodar

Uma vez por máquina: o [Rust](https://rustup.rs) e as Ferramentas de Build do Visual
Studio com o C++ (o WebView2 já vem no Windows 11).

```bash
cd desktop
npm install
npm run dev          # compila e abre o app apontado para produção
```

Para apontar para o que está na sua máquina, `MERLIN_URL` troca o endereço:

```powershell
$env:MERLIN_URL = "http://localhost:8787"   # o `npm run dev` do server/: site + API
npm run dev
```

(`http://localhost:8765`, o `npm run dev` da raiz, também serve: é só o site, sem login.)

## Empacotar

```bash
npm run build
```

Sai um instalador em `src-tauri/target/release/bundle/nsis/Merlin_<versão>_x64-setup.exe`.
Ele instala por usuário, sem pedir administrador.

Os ícones saem do [`icon.svg`](icon.svg) a cada `dev` e `build` (`npm run icons`); os PNG,
o `.ico` e o `.icns` não são versionados.

**O instalador não é assinado.** O Windows mostra o aviso do SmartScreen ("o Windows
protegeu o computador") até haver um certificado de assinatura de código. Para o time,
basta "mais informações → executar assim mesmo"; para distribuir para fora, assinar é
obrigatório.

## O Mac

O mesmo projeto, compilado num Mac: `npm run build` lá gera o `.app` e o `.dmg`. A bandeja
vira o ícone da barra de menus, e o número grande aparece ao lado dele (`set_status`). O
"abrir com o Windows" vira "abrir ao iniciar a sessão". Para distribuir, a Apple exige
assinatura e notarização com uma conta de desenvolvedor.
