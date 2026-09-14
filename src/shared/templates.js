/* merlin · os modelos
   um lugar só para o que já se sabe de cor: a estrutura de cada canal (o
   checklist que nasce no cliente), os funis prontos e os mapas prontos.

   um modelo é dado puro — nada aqui desenha nem grava. as telas pedem
   `buildFunnel` / `buildMap`, recebem nós e arestas com id novo e gravam
   como qualquer documento. dali em diante é um funil comum: o modelo não
   volta a ser consultado, editar não muda o modelo e apagar não some com
   nada. as taxas médias vêm preenchidas como ponto de partida, para serem
   corrigidas com o número real do cliente. */
import { newId } from "./core.js";

/* ================================================================
   canais
   o mesmo vocabulário serve para três coisas: o canal do cliente
   (clients.html), o checklist que ele ganha ao nascer, e o canal a que um
   funil pertence — é o que amarra "esse cliente vende na shopee" ao
   "e o funil da shopee é assim".
   ================================================================ */
export const CHANNEL_TYPES = ["mercadolivre", "shopee", "tiktokshop", "amazon", "site", "instagram", "google", "whatsapp", "email", "other"];

export const CHANNEL_LABEL = {
  mercadolivre: "mercado livre", shopee: "shopee", tiktokshop: "tiktok shop", amazon: "amazon",
  site: "site", instagram: "instagram", google: "google", whatsapp: "whatsapp", email: "e-mail", other: "outro"
};

/* o modelo de cada canal: a estrutura do que precisa existir. entra como
   itens não feitos ao criar o canal, e dali pra frente é só texto editável. */
export const CHANNEL_CHECKLISTS = {
  mercadolivre: ["conta e reputação", "catálogo cadastrado", "fotos e fichas técnicas", "frete/Mercado Envios", "Mercado Ads", "promoções/cupons", "atendimento e perguntas", "avaliações", "integração com ERP"],
  shopee: ["conta e loja", "catálogo", "frete grátis/programa", "Shopee Ads", "cupons e lives", "avaliações", "atendimento"],
  tiktokshop: ["conta seller", "catálogo", "afiliados/creators", "vídeos e lives de produto", "TikTok Ads", "logística"],
  amazon: ["conta seller", "catálogo/ASINs", "FBA/frete", "Amazon Ads", "avaliações", "brand registry"],
  site: ["domínio e hospedagem", "loja/CMS", "checkout (Stripe)", "pixel Meta e GA4", "SEO básico", "e-mail transacional", "políticas"],
  instagram: ["bio e destaques", "linha editorial", "criativos", "Meta Ads", "WhatsApp/DM", "loja no Instagram"],
  google: ["Google Business", "Google Ads", "GA4", "Search Console"],
  whatsapp: ["número business", "catálogo", "automação (Manychat/API)", "scripts de atendimento"],
  email: ["ferramenta", "listas/segmentos", "automações", "templates"],
  other: []
};

/* ================================================================
   funis
   cada modelo tem `stages` (as etapas, na ordem de leitura) e `flow` (quem
   liga em quem). a chave curta da etapa só existe aqui, para o `flow` poder
   apontar; ao construir, vira id de verdade.

     stages: { chave: [tipo, título, campos?] }
     flow:   "a>b 40, b>c 3"   — o número é a taxa média esperada, em %

   `offers`, `automations`, `triggers` e `creatives` são o que fica
   pendurado numa etapa; `node` é a chave da etapa dona.
   ================================================================ */

/* a ordem dos grupos é a ordem da lista na hora de escolher */
export const FUNNEL_GROUPS = [
  ["structures", "estruturas clássicas", "os formatos que servem a quase qualquer negócio"],
  ["launch", "lançamentos e cursos", "quando a venda acontece numa janela, e não todo dia"],
  ["service", "serviços e high ticket", "venda com conversa no meio: diagnóstico, proposta, fechamento"],
  ["retention", "recuperação e recompra", "quem já comprou, ou quase comprou"],
  ["mercadolivre", "mercado livre", "da busca dentro do marketplace até a reputação"],
  ["shopee", "shopee", "vitrine, cupom e a disputa pelo frete grátis"],
  ["tiktokshop", "tiktok shop", "o vídeo e a live como vitrine"],
  ["amazon", "amazon", "catálogo, buy box e Ads dentro da loja"],
  ["site", "site próprio", "a loja onde o cliente e o dado são seus"],
  ["instagram", "instagram", "do perfil e da DM até a venda"],
  ["google", "google", "quem já está procurando pelo que você vende"],
  ["whatsapp", "whatsapp", "a conversa como o próprio checkout"],
  ["email", "e-mail", "a lista, o único público que não se aluga"]
];

export const FUNNEL_TEMPLATES = [
  /* ---------- estruturas clássicas ---------- */
  {
    id: "lead-magnet", group: "structures", channel: "",
    name: "captura com isca digital",
    summary: "o anúncio leva à captura, o e-mail entrega a isca e a oferta vem depois",
    stages: {
      traffic: ["traffic", "tráfego frio", { source: "meta", campaign: "captação" }],
      ad: ["ad", "criativo da isca"],
      lp: ["lp", "página de captura", { cta: "quero o material", ctaTarget: "formulário" }],
      form: ["capture", "formulário", { what: "nome e e-mail" }],
      deliver: ["email", "e-mail 1 · entrega da isca", { sequence: "boas-vindas" }],
      nurture: ["email", "e-mails 2 a 4 · nutrição", { sequence: "nutrição" }],
      checkout: ["checkout", "checkout", { platform: "Stripe" }],
      thanks: ["thanks", "obrigado"]
    },
    flow: "traffic>ad 100, ad>lp 2, lp>form 35, form>deliver 100, deliver>nurture 45, nurture>checkout 6, checkout>thanks 55",
    automations: [{ name: "entrega da isca", trigger: "novo lead", action: "manda o material e começa a sequência", node: "deliver" }],
    triggers: [{ name: "reciprocidade", usage: "a isca entrega resultado antes de pedir dinheiro" }]
  },
  {
    id: "tripwire", group: "structures", channel: "",
    name: "produto de entrada (tripwire)",
    summary: "compra pequena e imediata que paga o tráfego; o lucro está no bump e no upsell",
    stages: {
      traffic: ["traffic", "tráfego frio", { source: "meta", campaign: "tripwire" }],
      ad: ["ad", "criativo de oferta"],
      page: ["product", "página do produto de entrada", { marketplace: "own", cta: "quero agora" }],
      checkout: ["checkout", "checkout de entrada", { platform: "Stripe" }],
      upsell: ["upsell", "oferta seguinte"],
      thanks: ["thanks", "obrigado"],
      post: ["email", "pós-compra e próxima oferta", { sequence: "pós-compra" }]
    },
    flow: "traffic>ad 100, ad>page 2.5, page>checkout 8, checkout>upsell 15, checkout>thanks 100, thanks>post 100",
    offers: [
      { name: "produto de entrada", type: "main", promise: "um resultado pequeno e rápido", node: "checkout" },
      { name: "bump no checkout", type: "bump", node: "checkout" },
      { name: "upsell", type: "upsell", node: "upsell" }
    ]
  },
  {
    id: "vsl-evergreen", group: "structures", channel: "",
    name: "vsl perpétua",
    summary: "vídeo de vendas rodando todo dia, com remarketing para quem assistiu e não comprou",
    stages: {
      traffic: ["traffic", "tráfego frio", { source: "meta", campaign: "vsl" }],
      ad: ["ad", "criativo de gancho"],
      vsl: ["vsl", "página da vsl", { duration: "22 min", cta: "quero garantir", ctaTarget: "checkout" }],
      checkout: ["checkout", "checkout", { platform: "Stripe" }],
      upsell: ["upsell", "upsell pós-compra"],
      thanks: ["thanks", "obrigado"]
    },
    flow: "traffic>ad 100, ad>vsl 2, vsl>checkout 12, checkout>upsell 12, checkout>thanks 100",
    offers: [{ name: "bump no checkout", type: "bump", node: "checkout" }],
    automations: [{ name: "remarketing de quem assistiu", trigger: "viu 50% da vsl e não comprou", action: "anúncio de volta por 7 dias", tool: "meta", node: "vsl" }],
    triggers: [
      { name: "autoridade", usage: "prova e método na primeira metade da vsl" },
      { name: "garantia", usage: "reverte o risco antes de falar de preço" }
    ]
  },
  {
    id: "live-webinar", group: "structures", channel: "",
    name: "webinário ao vivo",
    summary: "inscrição, lembretes, aula ao vivo com oferta no fim e replay para quem faltou",
    stages: {
      traffic: ["traffic", "tráfego", { source: "meta", campaign: "webinário" }],
      ad: ["ad", "criativo de convite"],
      lp: ["lp", "página de inscrição", { cta: "quero minha vaga", ctaTarget: "inscrição" }],
      form: ["capture", "inscrição", { what: "nome, e-mail e whatsapp" }],
      reminders: ["email", "lembretes d-1, 1h e no ar", { sequence: "lembretes" }],
      group: ["group", "grupo dos inscritos", { platform: "whatsapp" }],
      live: ["webinar", "webinário ao vivo", { when: "quinta, 20h", cta: "quero entrar" }],
      checkout: ["checkout", "checkout", { platform: "Stripe" }],
      thanks: ["thanks", "obrigado"],
      replay: ["email", "replay por 48h", { sequence: "replay" }]
    },
    flow: "traffic>ad 100, ad>lp 3, lp>form 40, form>reminders 100, form>group 55, reminders>live 35, group>live 60, live>checkout 11, checkout>thanks 60, form>replay 100, replay>checkout 3",
    triggers: [{ name: "urgência", usage: "a oferta cai quando o replay expira" }]
  },
  {
    id: "challenge", group: "structures", channel: "",
    name: "desafio de 5 dias",
    summary: "cinco dias de tarefa curta no grupo, com a oferta na aula final",
    stages: {
      traffic: ["traffic", "tráfego", { source: "meta", campaign: "desafio" }],
      ad: ["ad", "criativo do desafio"],
      lp: ["lp", "página do desafio", { cta: "entrar no desafio", ctaTarget: "inscrição" }],
      form: ["capture", "inscrição", { what: "nome, e-mail e whatsapp" }],
      group: ["group", "grupo do desafio", { platform: "whatsapp" }],
      lessons: ["email", "aulas dos dias 1 a 5", { sequence: "desafio" }],
      final: ["webinar", "aula final ao vivo", { cta: "quero continuar" }],
      checkout: ["checkout", "checkout", { platform: "Stripe" }],
      thanks: ["thanks", "obrigado"]
    },
    flow: "traffic>ad 100, ad>lp 3.5, lp>form 45, form>group 70, form>lessons 100, group>final 40, lessons>final 20, final>checkout 13, checkout>thanks 60"
  },
  {
    id: "content-organic", group: "structures", channel: "",
    name: "conteúdo orgânico para lista",
    summary: "o conteúdo que já existe (vídeo, artigo, episódio) puxando gente para a base",
    stages: {
      traffic: ["traffic", "audiência do conteúdo", { source: "organic" }],
      content: ["custom", "vídeo/artigo/episódio"],
      lp: ["lp", "página do material", { cta: "baixar o material", ctaTarget: "captura" }],
      form: ["capture", "captura", { what: "e-mail" }],
      nurture: ["email", "sequência de nutrição", { sequence: "nutrição" }],
      checkout: ["checkout", "checkout", { platform: "Stripe" }]
    },
    flow: "traffic>content 100, content>lp 5, lp>form 40, form>nurture 100, nurture>checkout 4"
  },

  /* ---------- lançamentos e cursos ---------- */
  {
    id: "seed-launch", group: "launch", channel: "",
    name: "lançamento semente",
    summary: "sem tráfego pago: pesquisa na base, aulas ao vivo e venda no grupo",
    stages: {
      base: ["custom", "base atual (lista, grupo, seguidores)"],
      survey: ["capture", "pesquisa com a base", { what: "dor principal e o que já tentou" }],
      invite: ["email", "convite para as aulas", { sequence: "convite" }],
      group: ["group", "grupo do lançamento", { platform: "whatsapp" }],
      lives: ["webinar", "3 aulas ao vivo", { cta: "quero entrar na turma" }],
      checkout: ["checkout", "checkout", { platform: "Stripe" }],
      support: ["whatsapp", "atendimento de dúvidas", { flow: "quebra de objeção" }],
      thanks: ["thanks", "obrigado"]
    },
    flow: "base>survey 8, survey>invite 100, invite>group 25, group>lives 45, lives>checkout 15, lives>support 9, support>checkout 35, checkout>thanks 65"
  },
  {
    id: "classic-launch", group: "launch", channel: "",
    name: "lançamento clássico (CPL 1-2-3)",
    summary: "captação, três aulas, carrinho com prazo e remarketing até fechar",
    stages: {
      traffic: ["traffic", "captação paga", { source: "meta", campaign: "lançamento · captação" }],
      ad: ["ad", "criativos de captação"],
      lp: ["lp", "página de inscrição", { cta: "quero participar", ctaTarget: "inscrição" }],
      form: ["capture", "inscrição", { what: "nome, e-mail e whatsapp" }],
      group: ["group", "grupo/lista de avisos", { platform: "whatsapp" }],
      warmup: ["email", "aquecimento pré-evento", { sequence: "aquecimento" }],
      cpl1: ["webinar", "CPL 1 · o problema"],
      cpl2: ["webinar", "CPL 2 · o método"],
      cpl3: ["webinar", "CPL 3 · a transformação", { cta: "quero minha vaga" }],
      checkout: ["checkout", "checkout", { platform: "Stripe" }],
      last: ["email", "últimas horas", { sequence: "fechamento" }],
      thanks: ["thanks", "obrigado"]
    },
    flow: "traffic>ad 100, ad>lp 2.5, lp>form 45, form>group 60, form>warmup 100, warmup>cpl1 35, group>cpl1 55, cpl1>cpl2 65, cpl2>cpl3 70, cpl3>checkout 11, cpl3>last 60, last>checkout 6, checkout>thanks 70",
    automations: [{ name: "remarketing do carrinho", trigger: "assistiu às aulas e não comprou", action: "anúncio até o carrinho fechar", tool: "meta", node: "cpl3" }],
    triggers: [
      { name: "escassez", usage: "vagas e prazo de carrinho" },
      { name: "prova social", usage: "alunos antigos nas três aulas" }
    ]
  },
  {
    id: "course-evergreen", group: "launch", channel: "",
    name: "curso perpétuo",
    summary: "aula gratuita que roda o ano inteiro, com oferta imediata e sequência de 7 dias",
    stages: {
      traffic: ["traffic", "tráfego frio", { source: "meta", campaign: "aula gratuita" }],
      ad: ["ad", "criativo da aula"],
      lp: ["lp", "página da aula gratuita", { cta: "assistir agora", ctaTarget: "inscrição" }],
      form: ["capture", "inscrição", { what: "nome e e-mail" }],
      lesson: ["vsl", "aula gravada", { duration: "45 min", cta: "quero o curso" }],
      checkout: ["checkout", "checkout do curso", { platform: "Stripe" }],
      upsell: ["upsell", "mentoria em grupo"],
      thanks: ["thanks", "obrigado"],
      sequence: ["email", "7 dias de quebra de objeção", { sequence: "objeções" }]
    },
    flow: "traffic>ad 100, ad>lp 2, lp>form 38, form>lesson 55, lesson>checkout 9, checkout>upsell 10, checkout>thanks 100, form>sequence 100, sequence>checkout 5",
    offers: [
      { name: "curso", type: "main", node: "checkout" },
      { name: "material de apoio", type: "bump", node: "checkout" },
      { name: "mentoria", type: "upsell", node: "upsell" }
    ]
  },
  {
    id: "waitlist-cohort", group: "launch", channel: "",
    name: "turma com lista de espera",
    summary: "a lista enche o ano todo e a turma abre em data marcada",
    stages: {
      lp: ["lp", "página da lista de espera", { cta: "avisar quando abrir", ctaTarget: "lista" }],
      form: ["capture", "entrar na lista", { what: "e-mail e whatsapp" }],
      nurture: ["email", "nutrição até abrir", { sequence: "espera" }],
      alert: ["whatsapp", "aviso de abertura", { flow: "primeiro lote" }],
      checkout: ["checkout", "checkout", { platform: "Stripe" }],
      thanks: ["thanks", "obrigado"]
    },
    flow: "lp>form 45, form>nurture 100, form>alert 70, nurture>checkout 3.5, alert>checkout 8, checkout>thanks 70",
    triggers: [{ name: "escassez", usage: "turma com data e número de vagas" }]
  },
  {
    id: "membership", group: "launch", channel: "",
    name: "clube por assinatura",
    summary: "vender é a parte fácil; o funil só fecha no mês 2, com ativação e retenção",
    stages: {
      traffic: ["traffic", "tráfego", { source: "meta", campaign: "clube" }],
      ad: ["ad", "criativo do clube"],
      lp: ["lp", "página do clube", { cta: "quero entrar", ctaTarget: "checkout" }],
      checkout: ["checkout", "assinatura mensal", { platform: "Stripe" }],
      thanks: ["thanks", "boas-vindas"],
      onboarding: ["onboarding", "primeira semana", { milestone: "participou de um encontro", window: 7 }],
      community: ["group", "comunidade", { platform: "circle/whatsapp" }],
      renewal: ["repurchase", "renovação do mês 2", { window: 30 }]
    },
    flow: "traffic>ad 100, ad>lp 2.5, lp>checkout 4, checkout>thanks 100, thanks>onboarding 100, onboarding>community 45, community>renewal 78"
  },

  /* ---------- serviços e high ticket ---------- */
  {
    id: "high-ticket-application", group: "service", channel: "",
    name: "high ticket por aplicação",
    summary: "ninguém compra no site: o formulário filtra e a venda acontece na call",
    stages: {
      traffic: ["traffic", "tráfego qualificado", { source: "meta", campaign: "aplicação" }],
      ad: ["ad", "criativo de autoridade"],
      vsl: ["vsl", "vídeo do método", { duration: "18 min", cta: "quero me candidatar" }],
      form: ["quiz", "formulário de aplicação", { criteria: "faturamento e urgência" }],
      booking: ["booking", "agendamento", { tool: "cal.com", duration: "45 min" }],
      call: ["call", "call de diagnóstico", { owner: "eu" }],
      proposal: ["proposal", "proposta"],
      closing: ["closing", "contrato assinado"]
    },
    flow: "traffic>ad 100, ad>vsl 1.5, vsl>form 11, form>booking 55, booking>call 65, call>proposal 60, proposal>closing 40"
  },
  {
    id: "free-diagnosis", group: "service", channel: "",
    name: "diagnóstico gratuito (agência)",
    summary: "a reunião de diagnóstico é o produto de entrada; a proposta sai dela",
    stages: {
      traffic: ["traffic", "tráfego", { source: "meta", campaign: "diagnóstico" }],
      ad: ["ad", "criativo de dor específica"],
      lp: ["lp", "página do diagnóstico", { cta: "agendar diagnóstico", ctaTarget: "agenda" }],
      booking: ["booking", "agendamento", { tool: "cal.com", duration: "30 min" }],
      confirm: ["email", "confirmação e lembrete", { sequence: "agenda" }],
      call: ["call", "reunião de diagnóstico", { script: "perguntas de contexto e números" }],
      proposal: ["proposal", "proposta"],
      closing: ["closing", "contrato assinado"]
    },
    flow: "traffic>ad 100, ad>lp 2, lp>booking 18, booking>confirm 100, confirm>call 65, call>proposal 70, proposal>closing 35"
  },
  {
    id: "local-service", group: "service", channel: "",
    name: "serviço local",
    summary: "quem busca já quer resolver hoje: o caminho é curto e termina no whatsapp",
    stages: {
      traffic: ["traffic", "busca local", { source: "google", campaign: "serviço + cidade" }],
      ad: ["ad", "anúncio de busca"],
      lp: ["lp", "página do serviço", { cta: "falar agora", ctaTarget: "whatsapp" }],
      whatsapp: ["whatsapp", "atendimento", { flow: "qualificação e agenda" }],
      quote: ["proposal", "orçamento", { scope: "visita ou serviço" }],
      payment: ["payment", "pagamento", { method: "pix" }]
    },
    flow: "traffic>ad 100, ad>lp 6, lp>whatsapp 16, whatsapp>quote 45, quote>payment 40"
  },
  {
    id: "b2b-outbound", group: "service", channel: "",
    name: "prospecção B2B",
    summary: "lista fria, três toques e uma call de descoberta antes de qualquer proposta",
    stages: {
      list: ["custom", "lista de empresas-alvo"],
      cold: ["email", "cold mail 1 a 3", { sequence: "outbound" }],
      dm: ["dm", "toque no linkedin", { channel: "linkedin", opener: "contexto do cliente" }],
      booking: ["booking", "call agendada", { tool: "cal.com", duration: "30 min" }],
      call: ["call", "call de descoberta", { script: "dor, número e decisor" }],
      proposal: ["proposal", "proposta"],
      closing: ["closing", "contrato"]
    },
    flow: "list>cold 100, cold>dm 60, cold>booking 3, dm>booking 8, booking>call 70, call>proposal 55, proposal>closing 30"
  },
  {
    id: "saas-trial", group: "service", channel: "",
    name: "SaaS com teste grátis",
    summary: "a conversão não é a assinatura, é a ativação: chegar ao primeiro valor",
    stages: {
      traffic: ["traffic", "tráfego", { source: "google", campaign: "teste grátis" }],
      ad: ["ad", "criativo de problema"],
      lp: ["lp", "página do produto", { cta: "testar grátis", ctaTarget: "cadastro" }],
      signup: ["capture", "conta de teste", { what: "e-mail e empresa" }],
      emails: ["email", "onboarding d0, d1 e d3", { sequence: "ativação" }],
      activation: ["onboarding", "primeiro valor entregue", { milestone: "primeiro relatório criado", window: 7 }],
      checkout: ["checkout", "assinatura", { platform: "Stripe" }],
      thanks: ["thanks", "assinante"]
    },
    flow: "traffic>ad 100, ad>lp 3, lp>signup 8, signup>emails 100, emails>activation 40, activation>checkout 16, checkout>thanks 95",
    automations: [{ name: "teste expirando", trigger: "14 dias sem assinar", action: "sequência de recuperação e anúncio", tool: "e-mail e meta", node: "signup" }]
  },

  /* ---------- recuperação e recompra ---------- */
  {
    id: "abandoned-cart", group: "retention", channel: "",
    name: "carrinho abandonado",
    summary: "três toques em janelas diferentes: e-mail em 1h, whatsapp em 24h, anúncio em 3 dias",
    stages: {
      cart: ["cart", "carrinho iniciado", { platform: "Shopify/Stripe" }],
      mail: ["email", "e-mail 1 · 1 hora", { sequence: "carrinho" }],
      whatsapp: ["whatsapp", "mensagem · 24 horas", { flow: "dúvida + link" }],
      back: ["checkout", "compra recuperada", { platform: "Stripe" }],
      thanks: ["thanks", "obrigado"]
    },
    flow: "cart>mail 100, cart>whatsapp 70, mail>back 8, whatsapp>back 12, back>thanks 100",
    automations: [
      { name: "carrinho abandonado · e-mail", trigger: "carrinho sem pagamento", action: "e-mail em 1 hora", node: "mail" },
      { name: "carrinho abandonado · whatsapp", trigger: "24h sem pagamento", action: "mensagem com o link do carrinho", node: "whatsapp" },
      { name: "carrinho abandonado · anúncio", trigger: "3 dias sem pagamento", action: "remarketing por 7 dias", tool: "meta", node: "cart" }
    ]
  },
  {
    id: "winback", group: "retention", channel: "",
    name: "reativação de base parada",
    summary: "quem já comprou uma vez custa menos que um lead novo; o cupom só entra no fim",
    stages: {
      base: ["custom", "quem não compra há 90 dias"],
      mail: ["email", "sentimos sua falta", { sequence: "reativação" }],
      whatsapp: ["whatsapp", "mensagem pessoal", { flow: "sem cupom, só conversa" }],
      offer: ["product", "oferta de retorno", { marketplace: "own", cta: "voltar com desconto" }],
      checkout: ["checkout", "checkout", { platform: "Stripe" }],
      thanks: ["thanks", "obrigado"]
    },
    flow: "base>mail 100, base>whatsapp 40, mail>offer 6, whatsapp>offer 15, offer>checkout 30, checkout>thanks 90"
  },
  {
    id: "post-purchase-upsell", group: "retention", channel: "",
    name: "upsell pós-compra",
    summary: "o melhor momento de vender de novo é o minuto seguinte à primeira compra",
    stages: {
      main: ["checkout", "compra principal", { platform: "Stripe" }],
      upsell: ["upsell", "oferta em um clique"],
      downsell: ["downsell", "versão menor da mesma oferta"],
      thanks: ["thanks", "obrigado"],
      post: ["email", "pós-venda d+3", { sequence: "pós-venda" }],
      review: ["custom", "pedido de avaliação"]
    },
    flow: "main>upsell 100, upsell>downsell 80, upsell>thanks 20, downsell>thanks 100, thanks>post 100, post>review 30",
    offers: [
      { name: "oferta principal", type: "main", node: "main" },
      { name: "upsell", type: "upsell", node: "upsell" },
      { name: "downsell", type: "downsell", node: "downsell" }
    ]
  },
  {
    id: "referral", group: "retention", channel: "",
    name: "indicação (member get member)",
    summary: "o cliente satisfeito vira canal: ele indica, o indicado entra com benefício",
    stages: {
      happy: ["custom", "cliente satisfeito"],
      invite: ["email", "convite para indicar", { sequence: "indicação" }],
      lp: ["lp", "página de indicação", { cta: "indicar um amigo", ctaTarget: "formulário" }],
      form: ["capture", "quem foi indicado", { what: "nome e whatsapp do indicado" }],
      contact: ["whatsapp", "contato com o indicado", { flow: "benefício dos dois lados" }],
      checkout: ["checkout", "compra do indicado", { platform: "Stripe" }],
      thanks: ["thanks", "obrigado (e prêmio de quem indicou)"]
    },
    flow: "happy>invite 100, invite>lp 12, lp>form 35, form>contact 100, contact>checkout 25, checkout>thanks 95"
  },
  {
    id: "replenishment", group: "retention", channel: "",
    name: "recompra programada",
    summary: "produto que acaba tem data: o lembrete sai antes de o cliente lembrar sozinho",
    stages: {
      first: ["checkout", "primeira compra", { platform: "Stripe" }],
      remind: ["email", "d+20 · está acabando?", { sequence: "recompra" }],
      whatsapp: ["whatsapp", "lembrete com link", { flow: "1 clique para repetir" }],
      again: ["repurchase", "recompra", { window: 30 }],
      subscription: ["custom", "assinatura de reposição"]
    },
    flow: "first>remind 100, first>whatsapp 60, remind>again 6, whatsapp>again 9, again>subscription 12"
  },

  /* ---------- mercado livre ---------- */
  {
    id: "ml-winning-listing", group: "mercadolivre", channel: "mercadolivre",
    name: "mercado livre · anúncio ganhador",
    summary: "busca e Mercado Ads caem no mesmo anúncio; reputação e avaliação alimentam de volta",
    stages: {
      search: ["traffic", "busca no ML", { source: "organic", campaign: "palavras do produto" }],
      ads: ["ad", "Mercado Ads · product ads", { creative: "foto principal e título" }],
      listing: ["product", "anúncio do produto", { marketplace: "mercadolivre", cta: "comprar agora" }],
      questions: ["custom", "perguntas respondidas"],
      buy: ["checkout", "compra no ML", { platform: "Mercado Livre" }],
      thanks: ["thanks", "venda concluída"],
      review: ["custom", "avaliação positiva"]
    },
    flow: "search>listing 3, ads>listing 4, listing>questions 6, listing>buy 8, questions>buy 25, buy>thanks 100, thanks>review 20, review>listing 100",
    triggers: [{ name: "prova social", usage: "reputação verde e avaliações com foto sobem a conversão do anúncio" }]
  },
  {
    id: "ml-after-sale", group: "mercadolivre", channel: "mercadolivre",
    name: "mercado livre · pós-venda e saída para a base",
    summary: "o marketplace vende, mas o cliente é dele; aqui a segunda compra acontece na casa própria",
    stages: {
      buy: ["checkout", "compra no ML", { platform: "Mercado Livre" }],
      insert: ["custom", "cartão/QR na embalagem"],
      whatsapp: ["whatsapp", "pós-venda no whatsapp", { flow: "garantia e manual" }],
      capture: ["capture", "cadastro na base", { what: "nome, e-mail e whatsapp" }],
      nurture: ["email", "nutrição fora do ML", { sequence: "pós-venda" }],
      site: ["product", "produto na loja própria", { marketplace: "own", cta: "comprar direto" }],
      checkout: ["checkout", "compra no site", { platform: "Stripe" }]
    },
    flow: "buy>insert 100, insert>whatsapp 18, whatsapp>capture 60, capture>nurture 100, nurture>site 20, site>checkout 25"
  },

  /* ---------- shopee ---------- */
  {
    id: "shopee-coupon-ads", group: "shopee", channel: "shopee",
    name: "shopee · cupom e ads",
    summary: "preço, frete e cupom decidem a compra; o ads só acelera o que já converte",
    stages: {
      search: ["traffic", "busca na Shopee", { source: "organic", campaign: "palavras do produto" }],
      ads: ["ad", "Shopee Ads", { creative: "descoberta e busca" }],
      page: ["product", "página do produto", { marketplace: "shopee", cta: "comprar" }],
      buy: ["checkout", "checkout Shopee", { platform: "Shopee" }],
      thanks: ["thanks", "venda concluída"],
      review: ["custom", "avaliação com foto"]
    },
    flow: "search>page 3, ads>page 5, page>buy 6, buy>thanks 100, thanks>review 25, review>page 100",
    offers: [{ name: "cupom da loja", type: "bump", node: "buy" }]
  },
  {
    id: "shopee-live-affiliates", group: "shopee", channel: "shopee",
    name: "shopee · live e afiliados",
    summary: "creators levam audiência de fora para a live, e a live empurra o produto em destaque",
    stages: {
      affiliates: ["custom", "afiliados e creators"],
      social: ["traffic", "audiência do creator", { source: "tiktok", campaign: "divulgação da live" }],
      live: ["webinar", "live de produtos", { cta: "pegar o cupom" }],
      page: ["product", "produto em destaque", { marketplace: "shopee" }],
      buy: ["checkout", "checkout Shopee", { platform: "Shopee" }],
      thanks: ["thanks", "venda concluída"],
      group: ["group", "grupo de ofertas", { platform: "whatsapp" }]
    },
    flow: "affiliates>social 100, social>live 4, live>page 35, page>buy 12, buy>thanks 100, thanks>group 15, group>live 30"
  },

  /* ---------- tiktok shop ---------- */
  {
    id: "tts-creator", group: "tiktokshop", channel: "tiktokshop",
    name: "tiktok shop · creator e afiliado",
    summary: "o creator produz e distribui; a marca cuida da vitrine, do estoque e da avaliação",
    stages: {
      organic: ["traffic", "tiktok orgânico", { source: "tiktok", campaign: "vídeos de produto" }],
      creator: ["custom", "creator/afiliado"],
      video: ["ad", "vídeo com produto marcado"],
      shop: ["product", "vitrine do tiktok shop", { marketplace: "tiktok", cta: "comprar no app" }],
      buy: ["checkout", "checkout tiktok shop", { platform: "TikTok Shop" }],
      thanks: ["thanks", "venda concluída"],
      review: ["custom", "avaliação e recompra"]
    },
    flow: "organic>creator 100, creator>video 100, video>shop 3, shop>buy 10, buy>thanks 100, thanks>review 22, review>shop 100"
  },
  {
    id: "tts-live", group: "tiktokshop", channel: "tiktokshop",
    name: "tiktok shop · live shopping",
    summary: "cupom que só vale durante a live, e remarketing depois para quem assistiu",
    stages: {
      ads: ["traffic", "TikTok Ads", { source: "tiktok", campaign: "chamada da live" }],
      live: ["webinar", "live shopping", { cta: "pegar o cupom" }],
      pinned: ["product", "produto fixado", { marketplace: "tiktok" }],
      buy: ["checkout", "checkout tiktok shop", { platform: "TikTok Shop" }],
      thanks: ["thanks", "venda concluída"]
    },
    flow: "ads>live 2.5, live>pinned 21, pinned>buy 14, buy>thanks 100",
    automations: [{ name: "remarketing da live", trigger: "assistiu e não comprou", action: "anúncio por 3 dias", tool: "tiktok", node: "live" }],
    triggers: [{ name: "urgência", usage: "o cupom morre no fim da transmissão" }]
  },

  /* ---------- amazon ---------- */
  {
    id: "amazon-launch", group: "amazon", channel: "amazon",
    name: "amazon · lançamento de ASIN",
    summary: "as primeiras avaliações compram o ranking; o ads paga esse começo",
    stages: {
      search: ["traffic", "busca na Amazon", { source: "organic", campaign: "palavras do ASIN" }],
      ads: ["ad", "Amazon Ads · sponsored products"],
      page: ["product", "página do ASIN", { marketplace: "amazon", cta: "comprar agora" }],
      buy: ["checkout", "buy box", { platform: "Amazon" }],
      thanks: ["thanks", "venda concluída"],
      review: ["custom", "solicitação de review"]
    },
    flow: "search>page 2, ads>page 4, page>buy 9, buy>thanks 100, thanks>review 12, review>page 100",
    offers: [{ name: "cupom de lançamento", type: "bump", node: "buy" }]
  },
  {
    id: "amazon-repeat", group: "amazon", channel: "amazon",
    name: "amazon · recompra e marca",
    summary: "a segunda compra vem da marca, não do produto: brand store, seguir e assine-e-poupe",
    stages: {
      first: ["checkout", "primeira compra", { platform: "Amazon" }],
      insert: ["custom", "inserto na embalagem"],
      brand: ["product", "brand store", { marketplace: "amazon", cta: "ver a marca" }],
      follow: ["email", "seguir a marca / novidades", { sequence: "marca" }],
      again: ["repurchase", "recompra ou assine e poupe", { window: 60 }]
    },
    flow: "first>insert 100, insert>brand 8, brand>follow 20, follow>again 15, brand>again 10"
  },

  /* ---------- site próprio ---------- */
  {
    id: "site-cold-traffic", group: "site", channel: "site",
    name: "site · tráfego frio para produto",
    summary: "o clássico do e-commerce, com a queda entre carrinho, checkout e pagamento à vista",
    stages: {
      traffic: ["traffic", "tráfego frio", { source: "meta", campaign: "produto" }],
      ad: ["ad", "criativo de produto"],
      page: ["product", "página do produto", { marketplace: "own", cta: "comprar agora" }],
      cart: ["cart", "carrinho", { platform: "Shopify" }],
      checkout: ["checkout", "checkout", { platform: "Stripe" }],
      payment: ["payment", "pagamento aprovado", { method: "mixed" }],
      thanks: ["thanks", "obrigado"],
      post: ["email", "pós-compra", { sequence: "pós-compra" }]
    },
    flow: "traffic>ad 100, ad>page 1.8, page>cart 7, cart>checkout 55, checkout>payment 82, payment>thanks 100, thanks>post 100",
    offers: [{ name: "frete grátis acima de X", type: "bump", node: "cart" }],
    automations: [{ name: "remarketing de visitante", trigger: "visitou e não comprou", action: "anúncio por 7 dias", tool: "meta", node: "page" }]
  },
  {
    id: "site-seo-content", group: "site", channel: "site",
    name: "site · conteúdo e SEO para venda",
    summary: "o artigo responde à dúvida, o produto aparece dentro dela e o cupom pega quem não compra hoje",
    stages: {
      search: ["traffic", "busca orgânica", { source: "organic", campaign: "guias e comparativos" }],
      article: ["lp", "artigo/guia", { cta: "conhecer o produto", ctaTarget: "página do produto" }],
      product: ["product", "página do produto", { marketplace: "own", cta: "comprar agora" }],
      capture: ["capture", "cupom em troca do e-mail", { what: "e-mail" }],
      checkout: ["checkout", "checkout", { platform: "Stripe" }],
      thanks: ["thanks", "obrigado"]
    },
    flow: "search>article 100, article>product 8, article>capture 4, capture>product 25, product>checkout 3.5, checkout>thanks 60"
  },

  /* ---------- instagram ---------- */
  {
    id: "ig-content-dm", group: "instagram", channel: "instagram",
    name: "instagram · conteúdo, DM e venda",
    summary: "a palavra-chave no comentário abre a conversa, e a venda acontece no direct",
    stages: {
      organic: ["traffic", "alcance orgânico", { source: "organic", campaign: "reels e carrosséis" }],
      content: ["custom", "reels/carrossel"],
      dm: ["dm", "direct automático", { channel: "instagram", opener: "comenta EU QUERO" }],
      talk: ["whatsapp", "conversa humana", { flow: "qualificação e oferta" }],
      checkout: ["checkout", "link de pagamento", { platform: "Stripe" }],
      thanks: ["thanks", "obrigado"]
    },
    flow: "organic>content 100, content>dm 3.4, dm>talk 30, talk>checkout 20, checkout>thanks 90"
  },
  {
    id: "ig-ads-whatsapp", group: "instagram", channel: "instagram",
    name: "instagram · anúncio para whatsapp",
    summary: "anúncio curto, página curta, conversa no whatsapp com script; bom para ticket médio",
    stages: {
      ads: ["traffic", "Meta Ads", { source: "meta", campaign: "clique para whatsapp" }],
      ad: ["ad", "criativo de oferta"],
      lp: ["lp", "página curta", { cta: "falar agora", ctaTarget: "whatsapp" }],
      whatsapp: ["whatsapp", "atendimento com script", { flow: "qualificação, oferta, fechamento" }],
      checkout: ["checkout", "link de pagamento", { platform: "Stripe" }],
      thanks: ["thanks", "obrigado"]
    },
    flow: "ads>ad 100, ad>lp 2, lp>whatsapp 19, whatsapp>checkout 18, checkout>thanks 90",
    automations: [{ name: "remarketing de conversa parada", trigger: "conversou e não fechou", action: "anúncio e follow-up por 5 dias", tool: "meta", node: "whatsapp" }]
  },

  /* ---------- google ---------- */
  {
    id: "google-search-intent", group: "google", channel: "google",
    name: "google · busca de intenção",
    summary: "quem digita já quer comprar: uma landing por grupo de termo, sem desvio",
    stages: {
      ads: ["traffic", "Google Ads · busca", { source: "google", campaign: "termos de compra" }],
      ad: ["ad", "anúncio de texto"],
      lp: ["lp", "landing do termo", { cta: "comprar agora", ctaTarget: "checkout" }],
      checkout: ["checkout", "checkout", { platform: "Stripe" }],
      thanks: ["thanks", "obrigado"]
    },
    flow: "ads>ad 100, ad>lp 5, lp>checkout 10, checkout>thanks 60",
    automations: [{ name: "remarketing de visitante", trigger: "visitou a landing e não comprou", action: "display por 14 dias", tool: "google", node: "lp" }]
  },
  {
    id: "google-shopping", group: "google", channel: "google",
    name: "google · shopping e pmax",
    summary: "o catálogo é o criativo: feed limpo, página de produto rápida e recuperação de carrinho",
    stages: {
      pmax: ["traffic", "Google Ads · PMax/Shopping", { source: "google", campaign: "feed do catálogo" }],
      product: ["product", "página do produto", { marketplace: "own", cta: "comprar agora" }],
      cart: ["cart", "carrinho", { platform: "Shopify" }],
      checkout: ["checkout", "checkout", { platform: "Stripe" }],
      payment: ["payment", "pagamento aprovado", { method: "mixed" }],
      post: ["email", "pós-compra", { sequence: "pós-compra" }]
    },
    flow: "pmax>product 100, product>cart 6, cart>checkout 55, checkout>payment 82, payment>post 100",
    offers: [{ name: "frete ou kit", type: "bump", node: "cart" }],
    automations: [{ name: "carrinho abandonado", trigger: "carrinho sem pagamento", action: "e-mail e display por 3 dias", tool: "google e e-mail", node: "cart" }]
  },

  /* ---------- whatsapp ---------- */
  {
    id: "wa-broadcast", group: "whatsapp", channel: "whatsapp",
    name: "whatsapp · disparo para a base",
    summary: "a base segmentada é o canal mais barato que existe — e o que mais queima se abusar",
    stages: {
      base: ["custom", "base segmentada"],
      message: ["whatsapp", "mensagem de oferta", { flow: "1 oferta por disparo" }],
      lp: ["lp", "página da oferta", { cta: "ver a oferta", ctaTarget: "checkout" }],
      checkout: ["checkout", "checkout", { platform: "Stripe" }],
      thanks: ["thanks", "obrigado"]
    },
    flow: "base>message 100, message>lp 16, lp>checkout 8, checkout>thanks 85"
  },
  {
    id: "wa-group", group: "whatsapp", channel: "whatsapp",
    name: "whatsapp · comunidade de ofertas",
    summary: "o grupo vira audiência recorrente: entra uma vez, recebe oferta toda semana",
    stages: {
      traffic: ["traffic", "bio e anúncios", { source: "meta", campaign: "entrada do grupo" }],
      lp: ["lp", "convite do grupo", { cta: "entrar no grupo", ctaTarget: "whatsapp" }],
      join: ["capture", "entrada no grupo", { what: "número de whatsapp" }],
      group: ["group", "comunidade", { platform: "whatsapp" }],
      routine: ["custom", "rotina semanal de ofertas"],
      checkout: ["checkout", "checkout", { platform: "Stripe" }],
      thanks: ["thanks", "obrigado"]
    },
    flow: "traffic>lp 3, lp>join 45, join>group 100, group>routine 100, routine>checkout 5, checkout>thanks 85"
  },

  /* ---------- e-mail ---------- */
  {
    id: "email-nurture", group: "email", channel: "email",
    name: "e-mail · nutrição pós-captura",
    summary: "cinco dias entre virar lead e ver preço: história, prova e só então a oferta",
    stages: {
      lead: ["capture", "novo lead", { what: "e-mail" }],
      d0: ["email", "d0 · boas-vindas e entrega", { sequence: "nutrição" }],
      d1: ["email", "d1 · a história", { sequence: "nutrição" }],
      d3: ["email", "d3 · prova e método", { sequence: "nutrição" }],
      d5: ["email", "d5 · a oferta", { sequence: "nutrição" }],
      checkout: ["checkout", "checkout", { platform: "Stripe" }],
      thanks: ["thanks", "obrigado"]
    },
    flow: "lead>d0 100, d0>d1 55, d1>d3 45, d3>d5 40, d5>checkout 5.4, checkout>thanks 80"
  },
  {
    id: "email-reengagement", group: "email", channel: "email",
    name: "e-mail · reengajamento de base",
    summary: "três e-mails para acordar quem sumiu — e a limpeza da lista para quem não acordar",
    stages: {
      cold: ["custom", "sem abrir há 90 dias"],
      ask: ["email", "ainda quer receber?", { sequence: "reengajamento" }],
      best: ["email", "o melhor conteúdo do ano", { sequence: "reengajamento" }],
      offer: ["email", "oferta de retorno", { sequence: "reengajamento" }],
      checkout: ["checkout", "checkout", { platform: "Stripe" }],
      clean: ["custom", "limpeza da lista"]
    },
    flow: "cold>ask 100, ask>best 12, best>offer 40, offer>checkout 4, cold>clean 85"
  }
];

/* a forma do modelo, para a miniatura da tela de escolher: as etapas como
   barras que afunilam (no máximo sete, senão viram risco) e quantas são. a
   taxa não entra na largura — quem quer o número abre o funil. */
export const funnelShape = (tpl) => {
  const stages = Object.values(tpl.stages || {});
  const n = Math.min(stages.length, 7);
  return stages.slice(0, n).map(([type, title], i) => ({
    type, title,
    pct: Math.round(100 - (i * (68 / Math.max(1, n - 1))))
  }));
};
export const funnelSize = (tpl) => Object.keys(tpl.stages || {}).length;

/* a árvore em dois números: quantos galhos saem da raiz e quantas folhas há
   ao todo. é o que separa "um mapa de cinco decisões" de "um mapa de trinta". */
export const mapShape = (tpl) => (tpl.tree || []).slice(0, 7).map((spec) => ({
  label: Array.isArray(spec) ? spec[0] : spec,
  kids: Array.isArray(spec) && Array.isArray(spec[1]) ? spec[1].length : 0
}));
export const mapSize = (tpl) => (tpl.tree || []).reduce(
  (n, spec) => n + 1 + (Array.isArray(spec) && Array.isArray(spec[1]) ? spec[1].length : 0), 0);

/* o caminho do modelo em uma linha só, para a tela mostrar antes de criar */
export const funnelChain = (tpl) => Object.values(tpl.stages || {}).map(([, title]) => title);

/* devolve os grupos com os modelos dentro, na ordem de FUNNEL_GROUPS. com
   `channel`, só os daquele canal — e, se o canal não tiver nenhum, tudo. */
export function funnelGroups(channel) {
  const list = channel ? FUNNEL_TEMPLATES.filter((t) => t.channel === channel) : FUNNEL_TEMPLATES;
  const pool = list.length ? list : FUNNEL_TEMPLATES;
  return FUNNEL_GROUPS
    .map(([key, label, note]) => ({ key, label, note, items: pool.filter((t) => t.group === key) }))
    .filter((g) => g.items.length);
}

/* "a>b 40, b>c 3" → arestas de verdade, ignorando o que aponta para etapa
   que não existe (erro de digitação no modelo não derruba a criação) */
function parseFlow(flow, ids) {
  return String(flow || "").split(",").map((raw) => {
    const parts = raw.trim().split(/\s+/);
    const [from, to] = String(parts[0] || "").split(">");
    if (!ids.has(from) || !ids.has(to)) return null;
    const rate = parts.length > 1 ? Number(parts[1]) : NaN;
    return { id: newId(), from: ids.get(from), to: ids.get(to), label: "", avgRate: Number.isFinite(rate) ? rate : null };
  }).filter(Boolean);
}

/* o que fica pendurado numa etapa: id novo e `node` traduzido de chave para id */
const linkedItems = (list, defaults, ids) => (list || []).map((item) => ({
  ...defaults, ...item, id: newId(), node: item.node ? (ids.get(item.node) || "") : ""
}));

/* o modelo virando documento: nós sem posição (quem chama roda o layout),
   arestas com a taxa média, e as listas laterais já ligadas às etapas. */
export function buildFunnel(tpl) {
  const ids = new Map();
  const nodes = Object.entries(tpl.stages || {}).map(([key, spec]) => {
    const [type, title, fields] = spec;
    const id = newId();
    ids.set(key, id);
    return { id, type, title: title || "", x: 0, y: 0, fields: { ...(fields || {}) }, number: null, note: "" };
  });
  return {
    nodes,
    edges: parseFlow(tpl.flow, ids),
    creatives: linkedItems(tpl.creatives, { title: "", format: "image", angle: "", url: "", status: "idea" }, ids),
    automations: linkedItems(tpl.automations, { name: "", trigger: "", action: "", tool: "", status: "idea" }, ids),
    offers: linkedItems(tpl.offers, { name: "", price: 0, type: "main", promise: "", guarantee: "" }, ids),
    triggers: linkedItems(tpl.triggers, { name: "", usage: "" }, ids)
  };
}

/* ================================================================
   mapas
   a árvore é literal: um galho é ["título", [filhos]] e uma folha é só o
   texto. a raiz não entra aqui — ela é o nome que o Arthur digitar.
   ================================================================ */

export const MAP_GROUPS = [
  ["campaign", "campanhas e lançamentos", "o que decidir antes de subir anúncio, e o que acompanhar depois"],
  ["offer", "oferta e copy", "a promessa, os argumentos e as objeções, antes de virar texto"],
  ["client", "clientes e canais", "o retrato de um cliente e de onde ele vende"],
  ["business", "negócio e decisão", "para pensar o que não cabe numa lista"]
];

export const MAP_TEMPLATES = [
  /* ---------- campanhas e lançamentos ---------- */
  {
    id: "campaign-plan", group: "campaign",
    name: "plano de campanha",
    summary: "o que precisa estar decidido antes de subir qualquer anúncio",
    tree: [
      ["objetivo", ["meta em número", "prazo", "verba total"]],
      ["público", ["quem é", "dor principal", "objeções"]],
      ["oferta", ["promessa", "preço e parcelamento", "garantia"]],
      ["canais", ["onde anunciar", "formato por canal", "verba por canal"]],
      ["criativos", ["ângulos", "formatos", "quantidade por semana"]],
      ["cronograma", ["pré", "durante", "pós"]],
      ["métricas", ["CPA alvo", "ROAS alvo", "ponto de corte"]]
    ]
  },
  {
    id: "launch-map", group: "campaign",
    name: "mapa do lançamento",
    summary: "as quatro fases de um lançamento e quem responde por cada uma",
    tree: [
      ["pré-lançamento", ["pesquisa com a base", "captação", "aquecimento"]],
      ["evento", ["CPL 1", "CPL 2", "CPL 3", "live de abertura"]],
      ["carrinho", ["abertura", "bônus por lote", "prazo e fechamento"]],
      ["pós", ["entrega e onboarding", "suporte", "remarketing dos que não compraram"]],
      ["equipe e prazos", ["copy", "tráfego", "edição", "suporte"]]
    ]
  },
  {
    id: "content-calendar", group: "campaign",
    name: "linha editorial",
    summary: "pilares, formatos e frequência antes de pensar em post solto",
    tree: [
      ["pilares", ["autoridade", "prova", "bastidor", "oferta"]],
      ["formatos", ["reels", "carrossel", "estático", "story"]],
      ["frequência", ["por semana", "por pilar"]],
      ["ganchos", ["dor", "curiosidade", "número", "contra-intuitivo"]],
      ["chamada", ["comentário", "direct", "link"]],
      ["reaproveitamento", ["corte de live", "e-mail", "artigo"]]
    ]
  },

  /* ---------- oferta e copy ---------- */
  {
    id: "offer-structure", group: "offer",
    name: "estrutura da oferta",
    summary: "tudo que uma oferta precisa ter antes de virar página",
    tree: [
      ["promessa", ["resultado", "prazo", "para quem"]],
      ["mecanismo", ["por que funciona", "por que é diferente"]],
      ["entregáveis", ["o que a pessoa recebe", "formato", "acesso"]],
      ["provas", ["depoimentos", "números", "casos"]],
      ["bônus", ["que resolvem objeção"]],
      ["garantia", ["prazo", "condição"]],
      ["preço", ["à vista", "parcelado", "ancoragem"]],
      ["objeções", ["caro", "não tenho tempo", "não é para mim", "já tentei"]]
    ]
  },
  {
    id: "vsl-script", group: "offer",
    name: "roteiro de vsl",
    summary: "a ordem que segura a atenção até o preço",
    tree: [
      ["gancho", ["promessa em 10 segundos"]],
      ["problema", ["o que dói hoje", "o que já tentaram"]],
      ["história", ["quem sou", "a virada"]],
      ["mecanismo", ["o método", "por que é diferente"]],
      ["prova", ["casos", "números"]],
      ["oferta", ["o que recebe", "preço"]],
      ["bônus", []],
      ["garantia", []],
      ["escassez", ["prazo ou vaga"]],
      ["chamada", ["o que fazer agora"]]
    ]
  },
  {
    id: "avatar", group: "offer",
    name: "avatar",
    summary: "quem é a pessoa do outro lado, em palavras dela",
    tree: [
      ["quem é", ["idade", "trabalho", "renda"]],
      ["dia a dia", ["rotina", "onde perde tempo"]],
      ["dores", ["a que tira o sono"]],
      ["desejos", ["o que quer mostrar", "o que quer sentir"]],
      ["objeções", ["do produto", "do preço", "de si mesma"]],
      ["onde está", ["redes", "grupos", "quem segue"]],
      ["linguagem", ["como fala do problema"]],
      ["o que já tentou", ["e por que não deu certo"]]
    ]
  },
  {
    id: "creative-angles", group: "offer",
    name: "ângulos de criativo",
    summary: "oito entradas diferentes para o mesmo produto",
    tree: [
      ["dor", []], ["desejo", []], ["inimigo comum", []], ["prova social", []],
      ["comparação", []], ["antes e depois", []], ["autoridade", []], ["curiosidade", []]
    ]
  },

  /* ---------- clientes e canais ---------- */
  {
    id: "client-onboarding", group: "client",
    name: "cliente novo",
    summary: "a reunião de entrada: o que perguntar e o que sair pedindo",
    tree: [
      ["contexto", ["o que vende", "há quanto tempo", "time"]],
      ["acessos", ["ads", "analytics", "loja", "domínio"]],
      ["canais", ["quais já operam", "quais estão parados"]],
      ["números atuais", ["faturamento", "ticket", "CAC", "margem"]],
      ["oferta", ["produto principal", "diferencial"]],
      ["concorrentes", ["quem", "o que fazem melhor"]],
      ["primeiros 30 dias", ["o que arruma", "o que testa", "o que mede"]]
    ]
  },
  {
    id: "ecosystem-marketplace", group: "client",
    name: "ecossistema · marketplace",
    summary: "como as peças de um marketplace se sustentam: reputação, catálogo, ads e saída para a base",
    tree: [
      ["conta", ["reputação", "métricas de saúde", "políticas"]],
      ["catálogo", ["títulos e palavras", "fotos e ficha", "variações"]],
      ["preço e frete", ["margem", "frete grátis", "kits"]],
      ["ads", ["produtos que já vendem", "verba", "ACOS alvo"]],
      ["avaliações", ["pedido pós-venda", "resposta a crítica"]],
      ["saída para a base", ["inserto na embalagem", "whatsapp", "loja própria"]],
      ["números", ["visitas", "conversão", "ticket", "recompra"]]
    ]
  },
  {
    id: "ecosystem-owned", group: "client",
    name: "ecossistema · casa própria",
    summary: "site, base e automação: o que não depende de plataforma de ninguém",
    tree: [
      ["site", ["produto", "checkout", "velocidade"]],
      ["tráfego", ["pago", "orgânico", "indicação"]],
      ["captura", ["isca", "pop-up", "cupom"]],
      ["base", ["e-mail", "whatsapp", "segmentos"]],
      ["automações", ["boas-vindas", "carrinho", "pós-compra", "recompra"]],
      ["dados", ["pixel", "GA4", "atribuição"]]
    ]
  },
  {
    id: "ecosystem-social", group: "client",
    name: "ecossistema · social e busca",
    summary: "onde a audiência aparece e como ela vira conversa",
    tree: [
      ["instagram", ["linha editorial", "criativos", "DM"]],
      ["tiktok", ["vídeos", "creators", "live"]],
      ["google", ["busca", "shopping", "perfil da empresa"]],
      ["whatsapp", ["atendimento", "grupo", "disparo"]],
      ["ponte", ["do conteúdo para a base", "da base para a oferta"]]
    ]
  },
  {
    id: "account-audit", group: "client",
    name: "auditoria de conta de anúncios",
    summary: "o roteiro de olhar uma conta que não é sua",
    tree: [
      ["estrutura", ["campanhas", "conjuntos", "nomenclatura"]],
      ["públicos", ["frio", "morno", "quente", "sobreposição"]],
      ["criativos", ["quantidade", "variedade de ângulo", "fadiga"]],
      ["orçamento", ["distribuição", "escala", "desperdício"]],
      ["rastreamento", ["pixel", "eventos", "API de conversões"]],
      ["métricas", ["CPA", "ROAS", "frequência", "CTR"]],
      ["decisões", ["o que cortar", "o que escalar", "o que testar"]]
    ]
  },
  {
    id: "customer-journey", group: "client",
    name: "jornada do cliente",
    summary: "os cinco estágios de consciência e o que cada um precisa ouvir",
    tree: [
      ["não sabe do problema", ["conteúdo que nomeia a dor"]],
      ["sabe do problema", ["conteúdo que explica a causa"]],
      ["compara soluções", ["comparativo", "prova"]],
      ["decide", ["oferta", "garantia", "urgência"]],
      ["compra", ["onboarding", "primeira entrega"]],
      ["indica", ["pedido de avaliação", "programa de indicação"]]
    ]
  },

  /* ---------- negócio e decisão ---------- */
  {
    id: "quarter-okr", group: "business",
    name: "trimestre",
    summary: "um objetivo, resultados em número e a lista do que não vai ser feito",
    tree: [
      ["objetivo", ["em uma frase"]],
      ["resultados-chave", ["número 1", "número 2", "número 3"]],
      ["frentes", ["o que cada uma entrega"]],
      ["riscos", ["o que pode travar"]],
      ["o que não vou fazer", []]
    ]
  },
  {
    id: "media-plan", group: "business",
    name: "plano de mídia",
    summary: "para onde vai a verba, dividida por canal e por etapa do funil",
    tree: [
      ["verba", ["total", "por mês"]],
      ["canais", ["meta", "google", "tiktok", "outros"]],
      ["etapas", ["topo", "meio", "fundo", "remarketing"]],
      ["campanhas", ["objetivo", "público", "criativo"]],
      ["metas", ["CPA", "ROAS", "volume"]],
      ["aprendizados", ["o que testar no próximo ciclo"]]
    ]
  },
  {
    id: "campaign-retro", group: "business",
    name: "retrospectiva da campanha",
    summary: "depois que acaba: o que fica escrito para a próxima",
    tree: [
      ["números", ["investido", "faturado", "CPA", "ROAS"]],
      ["o que funcionou", ["criativo", "público", "oferta"]],
      ["o que não funcionou", []],
      ["hipóteses", ["por que aconteceu"]],
      ["próximos testes", ["um por hipótese"]]
    ]
  },
  {
    id: "agency-process", group: "business",
    name: "processos da agência",
    summary: "o caminho de um cliente dentro da casa, do comercial à renovação",
    tree: [
      ["comercial", ["origem do lead", "diagnóstico", "proposta"]],
      ["onboarding", ["contrato", "acessos", "kickoff"]],
      ["execução", ["rotina semanal", "quem faz o quê"]],
      ["relatório", ["o que mostra", "com que frequência"]],
      ["reunião", ["pauta padrão"]],
      ["renovação", ["sinais de risco", "conversa de renovação"]]
    ]
  },
  {
    id: "decision", group: "business",
    name: "decisão",
    summary: "para quando a cabeça está girando: opções, critérios e prazo",
    tree: [
      ["a pergunta", ["em uma frase"]],
      ["opções", ["A", "B", "não fazer nada"]],
      ["critérios", ["dinheiro", "tempo", "risco", "vontade"]],
      ["a favor", []],
      ["contra", []],
      ["custo de errar", ["dá para voltar atrás?"]],
      ["decisão", ["qual", "até quando"]]
    ]
  },
  {
    id: "brainstorm", group: "business",
    name: "5W2H",
    summary: "a folha em branco com sete perguntas, para destravar qualquer coisa",
    tree: [
      ["o quê", []], ["por quê", []], ["quem", []], ["quando", []],
      ["onde", []], ["como", []], ["quanto custa", []]
    ]
  }
];

export const mapGroups = () => MAP_GROUPS
  .map(([key, label, note]) => ({ key, label, note, items: MAP_TEMPLATES.filter((t) => t.group === key) }))
  .filter((g) => g.items.length);

/* os galhos de primeiro nível, para a tela mostrar antes de criar */
export const mapBranches = (tpl) => (tpl.tree || []).map((spec) => (Array.isArray(spec) ? spec[0] : spec));

/* a árvore do modelo virando raiz de verdade. cada galho de primeiro nível
   ganha uma cor (a cor desce sozinha para os filhos, no desenho do mapa). */
export function buildMap(tpl, name) {
  const node = (spec, color) => {
    const [title, children] = Array.isArray(spec) ? spec : [spec, null];
    return {
      id: newId(), title: String(title), note: "", color, collapsed: false, link: "",
      children: (children || []).map((c) => node(c, 0))
    };
  };
  return {
    id: newId(), title: name || tpl.name, note: "", color: 0, collapsed: false, link: "",
    children: (tpl.tree || []).map((spec, i) => node(spec, (i % 6) + 1))
  };
}

/* ================================================================
   clientes
   ================================================================
   um modelo de cliente é um TIPO DE NEGÓCIO, não um cliente de mentira: ele
   diz com que canais aquele negócio nasce, o que se persegue nele e o que
   precisa estar montado antes de qualquer campanha. o checklist de cada
   canal vem de CHANNEL_CHECKLISTS — o mesmo que o botão "novo canal" usa,
   para o modelo não virar um segundo vocabulário.

     channels: ["mercadolivre", "instagram"]
     goals:    ["texto do objetivo", ...]
     backlog:  ["o que precisa ser feito antes", ...]
   ================================================================ */

export const CLIENT_GROUPS = [
  { key: "marketplace", label: "marketplace", note: "vende dentro da casa dos outros: ML, Shopee, Amazon" },
  { key: "own", label: "loja própria", note: "site próprio, onde o cliente e o dado são dele" },
  { key: "service", label: "serviço", note: "vende hora, projeto ou contrato" },
  { key: "content", label: "conteúdo e infoproduto", note: "vive de audiência antes de viver de venda" }
];

export const CLIENT_TEMPLATES = [
  {
    id: "ml-seller", group: "marketplace", name: "seller no Mercado Livre",
    summary: "vive de um catálogo dentro do ML: reputação, anúncio e Ads no mesmo lugar",
    channels: ["mercadolivre"],
    goals: ["reputação verde e mantida", "os 10 anúncios principais com ficha completa", "ACOS do Mercado Ads no alvo"],
    backlog: ["levantar os 10 anúncios que mais vendem", "revisar título e ficha técnica dos campeões", "conferir o custo de frete por anúncio"]
  },
  {
    id: "multi-seller", group: "marketplace", name: "seller multicanal",
    summary: "o mesmo catálogo em mais de um marketplace, com preço e estoque que precisam bater",
    channels: ["mercadolivre", "shopee", "amazon"],
    goals: ["mesmo catálogo publicado nos três", "margem por canal conhecida", "estoque integrado ao ERP"],
    backlog: ["mapear o que já está publicado em cada canal", "montar a planilha de margem por canal", "definir quem é o canal principal"]
  },
  {
    id: "tiktok-seller", group: "marketplace", name: "loja no TikTok Shop",
    summary: "venda por vídeo e afiliado: o criativo é o anúncio e a vitrine ao mesmo tempo",
    channels: ["tiktokshop", "instagram"],
    goals: ["10 creators afiliados ativos", "3 vídeos de produto por semana", "logística sem atraso"],
    backlog: ["abrir e verificar a conta seller", "escolher os 3 produtos de entrada", "montar o roteiro do primeiro vídeo"]
  },
  {
    id: "dtc-store", group: "own", name: "marca com loja própria",
    summary: "site que vende direto, tráfego pago e a base de e-mail como ativo",
    channels: ["site", "instagram", "email"],
    goals: ["checkout sem atrito medido de ponta a ponta", "base de e-mail crescendo todo mês", "ROAS estável no Meta"],
    backlog: ["conferir pixel e GA4 no checkout", "montar a sequência de boas-vindas", "revisar as fotos da página de produto"]
  },
  {
    id: "store-ads", group: "own", name: "loja que vive de tráfego pago",
    summary: "a operação inteira depende do anúncio: criativo, página e oferta são um só assunto",
    channels: ["site", "instagram", "google"],
    goals: ["criativo novo toda semana", "CPA dentro do teto", "página de produto que converte sem cupom"],
    backlog: ["listar os criativos que já rodaram e o resultado de cada um", "definir o teto de CPA", "revisar a oferta da página principal"]
  },
  {
    id: "local", group: "service", name: "serviço local",
    summary: "quem precisa aparecer no mapa e ser encontrado por quem está perto",
    channels: ["google", "instagram", "whatsapp"],
    goals: ["perfil do Google Business completo e avaliado", "agenda cheia sem depender de indicação", "resposta no WhatsApp em minutos"],
    backlog: ["completar o Google Business com fotos e horário", "pedir avaliação aos últimos 10 clientes", "escrever o script de primeira resposta"]
  },
  {
    id: "b2b", group: "service", name: "consultoria ou B2B",
    summary: "ticket alto e ciclo longo: a conversa vale mais que o clique",
    channels: ["site", "email", "whatsapp"],
    goals: ["reuniões qualificadas por mês", "proposta padrão que não precisa ser reescrita", "follow-up que não depende de memória"],
    backlog: ["montar o modelo de proposta", "definir o que é lead qualificado", "escrever a sequência de follow-up"]
  },
  {
    id: "infoproduct", group: "content", name: "infoprodutor",
    summary: "audiência própria, lançamento e a lista como o único ativo que não se aluga",
    channels: ["instagram", "email", "whatsapp"],
    goals: ["lista crescendo fora da rede social", "uma oferta perene rodando entre lançamentos", "conteúdo semanal sem depender de pico"],
    backlog: ["escolher a isca da captura", "montar o grupo de WhatsApp do lançamento", "definir a oferta perene"]
  },
  {
    id: "creator", group: "content", name: "criador de conteúdo",
    summary: "vive de atenção: a monetização vem depois da constância",
    channels: ["instagram", "tiktokshop", "email"],
    goals: ["calendário editorial que se sustenta", "uma fonte de receita além de publi", "base de e-mail iniciada"],
    backlog: ["definir os três pilares de conteúdo", "montar o calendário do mês", "abrir a captura de e-mail"]
  }
];

export const clientGroups = () => CLIENT_GROUPS
  .map((g) => ({ ...g, items: CLIENT_TEMPLATES.filter((t) => t.group === g.key) }))
  .filter((g) => g.items.length);

/* os canais do modelo em uma linha, para escolher sem abrir nada */
export const clientChannels = (tpl) => (tpl.channels || []).map((c) => CHANNEL_LABEL[c] || c);

/* o modelo virando cliente de verdade. tudo o que ele traz é texto editável
   a partir daqui: o modelo não fica preso ao documento nem volta a mexer
   nele depois. */
export function buildClient(tpl, name) {
  return {
    name: name || tpl.name,
    status: "prospect",
    summary: tpl.summary || "",
    channels: (tpl.channels || []).map((type) => ({
      id: newId(), type, name: CHANNEL_LABEL[type] || type, url: "", note: "",
      items: (CHANNEL_CHECKLISTS[type] || []).map((text) => ({ id: newId(), text, done: false }))
    })),
    goals: (tpl.goals || []).map((text) => ({ id: newId(), text, keyResult: "", due: "", done: false, steps: [] })),
    backlog: (tpl.backlog || []).map((text) => ({ id: newId(), text, min: 0, due: "", done: false, createdAt: Date.now() }))
  };
}

/* ================================================================
   hábitos
   ================================================================
   sugestões, não modelos: um hábito não tem estrutura para montar, tem uma
   frequência e um nome. a lista existe porque a grade vazia não dá ideia
   nenhuma — e porque "que hábito eu deveria ter" é uma pergunta pior de
   responder do que "qual destes é o meu".
   ================================================================ */

export const HABIT_GROUPS = [
  { key: "body", label: "corpo" },
  { key: "mind", label: "cabeça" },
  { key: "work", label: "trabalho" },
  { key: "home", label: "casa e dinheiro" }
];

export const HABIT_SUGGESTIONS = [
  { id: "move", group: "body", name: "mexer o corpo", schedule: { type: "perWeek", times: 4 }, min: 45, color: 5 },
  { id: "walk", group: "body", name: "caminhar 30 minutos", schedule: { type: "daily" }, min: 30, color: 6 },
  { id: "sleep", group: "body", name: "dormir antes das 23h", schedule: { type: "daily" }, min: 0, color: 1 },
  { id: "water", group: "body", name: "beber 2 litros de água", schedule: { type: "daily" }, min: 0, color: 6 },
  { id: "read", group: "mind", name: "ler 20 páginas", schedule: { type: "daily" }, min: 25, color: 4 },
  { id: "write", group: "mind", name: "escrever o dia", schedule: { type: "daily" }, min: 10, color: 4 },
  { id: "nophone", group: "mind", name: "primeira hora sem celular", schedule: { type: "weekdays", weekdays: [1, 2, 3, 4, 5] }, min: 0, color: 3 },
  { id: "study", group: "mind", name: "estudar uma hora", schedule: { type: "perWeek", times: 3 }, min: 60, color: 1 },
  { id: "deep", group: "work", name: "duas horas sem interrupção", schedule: { type: "weekdays", weekdays: [1, 2, 3, 4, 5] }, min: 120, color: 5 },
  { id: "inbox", group: "work", name: "zerar a caixa de entrada", schedule: { type: "weekdays", weekdays: [1, 2, 3, 4, 5] }, min: 20, color: 2 },
  { id: "review", group: "work", name: "revisar a semana", schedule: { type: "weekdays", weekdays: [5] }, min: 30, color: 2 },
  { id: "prospect", group: "work", name: "falar com um cliente novo", schedule: { type: "perWeek", times: 3 }, min: 20, color: 3 },
  { id: "money", group: "home", name: "lançar os gastos do dia", schedule: { type: "daily" }, min: 5, color: 2 },
  { id: "tidy", group: "home", name: "arrumar a mesa antes de sair", schedule: { type: "weekdays", weekdays: [1, 2, 3, 4, 5] }, min: 10, color: 6 },
  { id: "cook", group: "home", name: "cozinhar em casa", schedule: { type: "perWeek", times: 4 }, min: 45, color: 5 }
];

export const habitGroups = () => HABIT_GROUPS
  .map((g) => ({ ...g, items: HABIT_SUGGESTIONS.filter((h) => h.group === g.key) }))
  .filter((g) => g.items.length);

/* ================================================================
   rotina
   ================================================================
   a semana de sempre vazia é uma grade de 168 horas em branco, e ninguém
   lembra da própria semana começando pela meia-noite de domingo. estes são
   os blocos que quase toda semana tem, com dia, hora e duração escolhidos —
   o que muda de pessoa para pessoa é a hora, e ela se arrasta depois.

     days: 0 é domingo · at: minutos desde a meia-noite · reserved: ocupa
     sem ser trabalho (reunião, almoço), como na tarefa
   ================================================================ */

export const ROUTINE_GROUPS = [
  { key: "meetings", label: "reuniões", note: "o que já tem hora marcada com outras pessoas" },
  { key: "breaks", label: "pausas", note: "o que tira tempo do dia sem ser trabalho" },
  { key: "work", label: "trabalho", note: "o que você faz toda semana e sempre esquece de reservar" }
];

const WEEKDAYS_ONLY = [1, 2, 3, 4, 5];
export const ROUTINE_SUGGESTIONS = [
  { id: "daily", group: "meetings", title: "daily", days: WEEKDAYS_ONLY, at: 540, min: 15, reserved: true },
  { id: "weekly", group: "meetings", title: "weekly do time", days: [1], at: 600, min: 60, reserved: true },
  { id: "one-on-one", group: "meetings", title: "1:1", days: [3], at: 900, min: 30, reserved: true },
  { id: "clients", group: "meetings", title: "call de acompanhamento com cliente", days: [4], at: 840, min: 60, reserved: true },
  { id: "lunch", group: "breaks", title: "almoço", days: WEEKDAYS_ONLY, at: 720, min: 60, reserved: true },
  { id: "gym", group: "breaks", title: "academia", days: [1, 3, 5], at: 420, min: 60, reserved: true },
  { id: "plan", group: "work", title: "planejar a semana", days: [1], at: 480, min: 30, reserved: false },
  { id: "inbox", group: "work", title: "zerar a caixa de entrada", days: WEEKDAYS_ONLY, at: 510, min: 20, reserved: false },
  { id: "report", group: "work", title: "relatório dos clientes", days: [5], at: 840, min: 60, reserved: false },
  { id: "review", group: "work", title: "revisar a semana", days: [5], at: 1020, min: 30, reserved: false }
];

export const routineGroups = () => ROUTINE_GROUPS
  .map((g) => ({ ...g, items: ROUTINE_SUGGESTIONS.filter((s) => s.group === g.key) }))
  .filter((g) => g.items.length);

/* ================================================================
   financeiro
   ================================================================
   o esqueleto de um mês: o que se repete todo mês, com o dia do vencimento
   já escolhido e o VALOR EM BRANCO. o valor é a única coisa que ninguém
   pode adivinhar por você — e é justamente o que trava a primeira tela,
   porque preencher uma planilha vazia começa por lembrar de tudo que existe.

   as categorias vêm junto: um modelo que traz "aluguel" mas não traz a
   categoria em que ele cai deixa o trabalho pela metade.

     out: [["nome", diaDoMês, "categoria"], ...]
     in:  o mesmo, para o que entra
   ================================================================ */

export const FINANCE_GROUPS = [
  { key: "pf", label: "pessoa física" },
  { key: "pj", label: "pessoa jurídica" },
  { key: "both", label: "os dois juntos" }
];

export const FINANCE_TEMPLATES = [
  {
    id: "pf-basic", group: "pf", name: "o mês de uma pessoa",
    summary: "moradia, contas de casa e o que entra fixo — o esqueleto mínimo de um mês",
    categories: ["Moradia", "Casa", "Transporte", "Lazer", "Saúde", "Investimento"],
    out: [
      ["aluguel ou financiamento", 5, "Moradia"], ["condomínio", 5, "Moradia"],
      ["energia", 10, "Casa"], ["água", 10, "Casa"], ["internet", 15, "Casa"],
      ["celular", 15, "Casa"], ["mercado", 1, "Casa"], ["transporte", 1, "Transporte"],
      ["plano de saúde", 10, "Saúde"], ["assinaturas", 20, "Lazer"]
    ],
    in: [["salário", 5, "Salário"]]
  },
  {
    id: "pf-lean", group: "pf", name: "só o essencial",
    summary: "quatro linhas: o que não dá para não pagar. bom para começar sem inventar despesa",
    categories: ["Moradia", "Casa", "Transporte", "Investimento"],
    out: [["moradia", 5, "Moradia"], ["contas de casa", 10, "Casa"], ["mercado", 1, "Casa"], ["transporte", 1, "Transporte"]],
    in: [["renda principal", 5, "Salário"]]
  },
  {
    id: "pj-solo", group: "pj", name: "operação de uma pessoa",
    summary: "o custo de manter a empresa de pé: contador, ferramentas, imposto e pró-labore",
    categories: ["Ferramentas", "Impostos", "Serviços", "Pró-labore", "Investimento"],
    out: [
      ["contador", 10, "Serviços"], ["Simples/DAS", 20, "Impostos"],
      ["ferramentas e assinaturas", 5, "Ferramentas"], ["hospedagem e domínios", 5, "Ferramentas"],
      ["pró-labore", 5, "Pró-labore"]
    ],
    in: [["contratos mensais", 10, "Recorrente"]]
  },
  {
    id: "pj-agency", group: "pj", name: "operação com equipe",
    summary: "quando já há gente e mídia no meio: folha, freelas e a verba que passa por você",
    categories: ["Equipe", "Ferramentas", "Impostos", "Mídia", "Serviços", "Recorrente"],
    out: [
      ["folha e freelas", 5, "Equipe"], ["contador", 10, "Serviços"], ["Simples/DAS", 20, "Impostos"],
      ["ferramentas e assinaturas", 5, "Ferramentas"], ["verba de mídia", 1, "Mídia"], ["pró-labore", 5, "Pró-labore"]
    ],
    in: [["contratos mensais", 10, "Recorrente"], ["projetos", 15, "Projeto"]]
  },
  {
    id: "mixed", group: "both", name: "PF e PJ na mesma conta",
    summary: "para quem ainda não separou: as duas listas juntas, marcadas por categoria",
    categories: ["Básicas/PF", "Básicas/PJ", "Ferramentas", "Impostos", "Lazer", "Investimento", "Recorrente"],
    out: [
      ["moradia", 5, "Básicas/PF"], ["contas de casa", 10, "Básicas/PF"], ["mercado", 1, "Básicas/PF"],
      ["contador", 10, "Básicas/PJ"], ["Simples/DAS", 20, "Impostos"],
      ["ferramentas e assinaturas", 5, "Ferramentas"], ["assinaturas pessoais", 20, "Lazer"]
    ],
    in: [["pró-labore", 5, "Recorrente"], ["contratos mensais", 10, "Recorrente"]]
  }
];

export const financeGroups = () => FINANCE_GROUPS
  .map((g) => ({ ...g, items: FINANCE_TEMPLATES.filter((t) => t.group === g.key) }))
  .filter((g) => g.items.length);

/* as linhas fixas do modelo, prontas para virar documentos. o valor nasce em
   zero de propósito: é o único número que só a pessoa sabe, e um valor
   inventado no lugar dele seria pior que um campo em branco — a planilha
   ficaria parecendo pronta. */
export function buildFinance(tpl) {
  const line = ([name, dayOfMonth, category], kind) => ({
    type: "fixed", name, amount: 0, kind, category, dayOfMonth, active: true
  });
  return {
    categories: (tpl.categories || []).slice(),
    fixed: (tpl.out || []).map((l) => line(l, "out")).concat((tpl.in || []).map((l) => line(l, "in")))
  };
}
