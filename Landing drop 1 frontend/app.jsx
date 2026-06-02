// app.jsx — TIWSHIRTS homepage
const { useState, useEffect, useMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "tom": "equilibrio",
  "ordem": "manual-primeiro",
  "paleta": "verde-terra",
  "densidade": "regular",
  "mostrarTicker": true
}/*EDITMODE-END*/;

// ─────────────────────────────────────────────────────────────────────────
// Asset URLs (from live tiwshirts.space CDN — keeps the prototype real)
const ASSET_BASE = "https://tiwshirts.space/Assets/";
const enc = (s) => encodeURI(ASSET_BASE + s);

const HERO_IMG = enc("TiwShirts capa Sugiro maconha bg.webp");
const BUD_FLOWER = enc("Bud Flower - TiwDoo TiwShirts 1 Xilogravura.webp");
const AVATAR = enc("avatar-tiodu xilogravura 1.webp");

const PRODUCTS = [
  {
    slug: "camiseta-legaliza",
    name: "LEGALIZA",
    sub: "pra pobre também",
    chapter: "CAP. 02 · HISTÓRIA",
    img: enc("Legaliza pra pobre tbm 1x1 Tiwshirts image.webp"),
    price: 105,
  },
  {
    slug: "camiseta-just-doob-it",
    name: "JUST DOOB IT",
    sub: "faça você mesmo",
    chapter: "CAP. 06 · USO",
    img: enc("Just Doob It 1x1 Tiwshirts image.webp"),
    price: 105,
  },
  {
    slug: "camiseta-maconha-salva-vidas",
    name: "MACONHA SALVA VIDAS",
    sub: "uso medicinal",
    chapter: "CAP. 07 · SAÚDE",
    img: enc("Maconha salva Vidas 1x1 Tiwshirts image.webp"),
    price: 105,
  },
  {
    slug: "camiseta-nao-somos-ma-pessoa",
    name: "NÃO SOMOS MÁ PESSOA",
    sub: "estigma",
    chapter: "CAP. 08 · GRUPOS",
    img: enc("Não somos má pessoa 1x1 Tiwshirts image.webp"),
    price: 105,
  },
  {
    slug: "camiseta-maconheiro",
    name: "MACONHEIRO",
    sub: "ressignificação",
    chapter: "CAP. 02 · HISTÓRIA",
    img: enc("Maco nheiro 1x1 Tiwshirts image.webp"),
    price: 105,
  },
  {
    slug: "drop-01",
    name: "BAG OF DROP",
    sub: "pacote completo · 5 peças",
    chapter: "DROP COMPLETO",
    img: enc("TiwShirts capa Sugiro maconha bg.webp"),
    price: 475,
    full: true,
  },
];

// 9 chapters from manualdousuario-cannabis.html
const CHAPTERS = [
  { n: "01", h: "#o-que-e", title: "O que é a cannabis", desc: "Planta, canabinoides, THC, CBD, terpenos. O básico — sem mito.", read: "5 min" },
  { n: "02", h: "#historia", title: "História da proibição", desc: "De remédio milenar à criminalização racista. E o caminho de volta.", read: "7 min" },
  { n: "03", h: "#mundo", title: "Cannabis no mundo hoje", desc: "Países que legalizaram, descriminalizaram, regularam. E o Brasil.", read: "6 min" },
  { n: "04", h: "#corpo", title: "O que acontece no corpo", desc: "Sistema endocanabinoide, cérebro, coração, pulmões, sono.", read: "5 min" },
  { n: "05", h: "#tipos", title: "Tipos e formas de uso", desc: "Sativa, indica, edibles, vape, óleo, tópico — diferenças e cuidados.", read: "6 min" },
  { n: "06", h: "#uso-responsavel", title: "Como usar com consciência", desc: "Redução de danos. Set, setting, dose, mistura, direção, consentimento.", read: "7 min" },
  { n: "07", h: "#saude", title: "Cannabis e saúde", desc: "Usos terapêuticos, evidência científica, dependência, ajuda profissional.", read: "6 min" },
  { n: "08", h: "#grupos", title: "Para cada pessoa", desc: "Adolescentes, jovens, adultos, idosos, gestantes, saúde mental, lei.", read: "8 min" },
  { n: "09", h: "#perguntas", title: "Perguntas sem rodeios", desc: "Overdose, porta de entrada, remédios, dirigir, trabalho — fatos.", read: "5 min" },
];

// Path finder paths
const PATHS = [
  {
    id: "curioso",
    n: "P1",
    label: "Sou curioso. Nunca usei mas tenho dúvidas.",
    eyebrow: "Você está chegando agora",
    title: "Comece pelos fundamentos.",
    p: "Antes de qualquer opinião — o que é a planta, o que ela faz no corpo, e por que o debate dura séculos. Sem julgamento, sem incentivo.",
    chips: [
      { t: "O que é", h: "#o-que-e" },
      { t: "História", h: "#historia" },
      { t: "No corpo", h: "#corpo" },
      { t: "Perguntas comuns", h: "#perguntas" },
    ],
    quote: "“A primeira pergunta não é se é certo ou errado. É: o que isso é de verdade?”",
  },
  {
    id: "cetico",
    n: "P2",
    label: "Sou contra. Me convença do contrário — ou não.",
    eyebrow: "Você não precisa concordar",
    title: "Comece pelos dados.",
    p: "Aqui não tem militância barata. Tem o que a ciência diz, o que a lei diz, e o que países que regularam aprenderam. Você lê. Depois decide.",
    chips: [
      { t: "Cannabis no mundo", h: "#mundo" },
      { t: "Saúde — evidências", h: "#saude" },
      { t: "Dependência", h: "#saude" },
      { t: "Mitos comuns", h: "#perguntas" },
    ],
    quote: "“Não pedimos sua aprovação. Pedimos que você pense sobre isso.”",
  },
  {
    id: "usuario",
    n: "P3",
    label: "Já uso. Quero usar melhor.",
    eyebrow: "Você já está dentro",
    title: "Redução de danos.",
    p: "Set, setting, dose, mistura, frequência, consentimento. Não é manual de como começar — é manual de como continuar inteiro.",
    chips: [
      { t: "Uso responsável", h: "#uso-responsavel" },
      { t: "Tipos e formas", h: "#tipos" },
      { t: "Saúde", h: "#saude" },
      { t: "Se ficar difícil", h: "#uso-responsavel" },
    ],
    quote: "“Informação salva vidas. Mais que qualquer slogan.”",
  },
  {
    id: "familia",
    n: "P4",
    label: "Conheço alguém que usa. Quero entender.",
    eyebrow: "Você se importa com alguém",
    title: "Para abrir a conversa.",
    p: "Mãe, pai, parceiro, amigo. A diferença entre julgamento e diálogo geralmente é informação. Aqui tem o que você precisa pra começar uma conversa difícil.",
    chips: [
      { t: "Para cada idade", h: "#grupos" },
      { t: "O que é", h: "#o-que-e" },
      { t: "Saúde mental", h: "#grupos" },
      { t: "Como conversar", h: "#perguntas" },
    ],
    quote: "“Proibir sem dialogar raramente funciona. Conversa sem julgamento funciona.”",
  },
];

const TOM_COPY = {
  acolhedor: {
    eyebrow: "BR · 2026 · MATERIAL EDUCATIVO",
    l1: "Vamos",
    l2: "conversar",
    l3: <>sobre <em>maconha</em>.</>,
    sub: <>Esta é uma sugestão. Não uma cobrança. <em>Saber mais</em> sobre cannabis — sua história, sua ciência, suas leis — é a forma mais pacífica de tirar uma ideia do silêncio.</>,
    ctaA: { k: "ENTRAR PELO", v: "Manual do Usuário" },
    ctaB: { k: "OU PELA", v: "Loja — Drop #01" },
    manifestoA: <>Não vendemos camiseta. <em>Começamos conversa.</em></>,
    manifestoB: <>O resto do site é o silêncio que <em>já vinha sendo quebrado</em>.</>,
    closingH: <>Vista o que você <em>pensa.</em></>,
    closingP: "Quando a estampa fala, você não precisa mais explicar. Mas antes da estampa, vem a leitura.",
  },
  provocativo: {
    eyebrow: "DROP #01 · 100 PEÇAS · 9 CAPÍTULOS",
    l1: "SUGIRO",
    l2: "que saiba",
    l3: <>mais sobre <em>maconha</em>.</>,
    sub: <>A estampa não pede aprovação. <em>O manual também não.</em> Lê quem quer; veste quem assume. Os dois caminhos começam pela mesma porta — esta aqui.</>,
    ctaA: { k: "LER O", v: "Manual do Usuário" },
    ctaB: { k: "VER O", v: "Drop #01" },
    manifestoA: <>Algumas ideias <em>ainda incomodam.</em></>,
    manifestoB: <>Não porque são erradas — mas porque nunca <em>deixaram você pensar sobre elas.</em></>,
    closingH: <>Vista o que você <em>pensa.</em></>,
    closingP: "Roupa não é só roupa. É sinal. É triagem. A camiseta certa atrai quem você quer perto.",
  },
  equilibrio: {
    eyebrow: "EDIÇÃO 2026 · MATERIAL EDUCATIVO + DROP #01",
    l1: "Sugiro",
    l2: "que saiba",
    l3: <>mais sobre <em>maconha</em>.</>,
    sub: <>Duas portas de entrada para a mesma conversa: um <em>manual sério</em>, sem julgamento, e cinco <em>camisetas</em> que vestem o que você acabou de ler. Escolha por onde começar.</>,
    ctaA: { k: "ENTRAR PELO", v: "Manual do Usuário" },
    ctaB: { k: "OU PELA", v: "Loja — Drop #01" },
    manifestoA: <>Não vendemos camiseta. <em>Começamos conversa.</em></>,
    manifestoB: <>A loja é onde a leitura <em>vira posição vestida.</em></>,
    closingH: <>Vista o que você <em>pensa.</em></>,
    closingP: "Você leu, você entendeu, você se reconheceu. Agora você pode vestir — ou só ter lido já valeu.",
  },
};

// ─────────────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <a className="logo" href="#">
          TIWSHIRTS <small>BR · 2026</small>
        </a>
        <div className="nav-links">
          <a href="#manual">Manual</a>
          <a href="#caminho">Por onde começar</a>
          <a href="#drop">Drop #01</a>
          <a href="manifesto.html">Manifesto</a>
          <a href="sobre.html">Sobre</a>
        </div>
        <a className="nav-cart" href="#drop">CARRINHO · 0</a>
      </div>
    </nav>
  );
}

function Hero({ tom }) {
  const c = TOM_COPY[tom] || TOM_COPY.equilibrio;
  return (
    <section className="hero">
      <div className="wrap">
        <div className="eyebrow">
          <b>{c.eyebrow.split(" · ")[0]}</b>
          <span className="dash"></span>
          <span>{c.eyebrow.split(" · ").slice(1).join(" · ")}</span>
        </div>
        <div className="hero-grid">
          <div>
            <h1 className="display hero-headline">
              <span className="l1">{c.l1}</span>
              <span className="l2">{c.l2}</span>
              <span className="l3">{c.l3}</span>
            </h1>
            <div className="hero-sub">
              <div className="mono" style={{ color: "var(--ink-soft)" }}>↳ POR QUÊ</div>
              <p className="hero-sub-text">{c.sub}</p>
            </div>
          </div>
          <div className="hero-art">
            <img src={HERO_IMG} alt="TiwShirts — Sugiro Maconha" />
            <div className="hero-art-tag">EDIÇÃO #01 / 2026</div>
            <div className="hero-art-num">01</div>
          </div>
        </div>
      </div>
      <div className="ctas">
        <a className="cta dark" href="manualdousuario-cannabis.html">
          <div className="cta-num">→ 00 / 01</div>
          <div className="cta-label">
            <span className="k">{c.ctaA.k}</span>
            <span className="v" style={{ fontStyle: "italic" }}>{c.ctaA.v}</span>
          </div>
          <div className="cta-arrow">↗</div>
        </a>
        <a className="cta" href="#drop">
          <div className="cta-num">→ 00 / 02</div>
          <div className="cta-label">
            <span className="k">{c.ctaB.k}</span>
            <span className="v" style={{ fontStyle: "italic" }}>{c.ctaB.v}</span>
          </div>
          <div className="cta-arrow">↗</div>
        </a>
      </div>
    </section>
  );
}

function Ticker() {
  const items = [
    "9 CAPÍTULOS",
    <i key="d1">◇</i>,
    "TIRAGEM LIMITADA · 20 POR ESTAMPA",
    <i key="d2">◇</i>,
    "MANUAL GRATUITO · LEITURA ABERTA",
    <i key="d3">◇</i>,
    "PRODUÇÃO BRASILEIRA",
    <i key="d4">◇</i>,
    "@TIWDOO + @EDU.BOVOLINE",
    <i key="d5">◇</i>,
  ];
  return (
    <div className="ticker">
      <div className="ticker-inner">
        <span>{items}{items}{items}{items}</span>
      </div>
    </div>
  );
}

function Manifesto({ tom }) {
  const c = TOM_COPY[tom] || TOM_COPY.equilibrio;
  return (
    <section className="manifesto">
      <div className="wrap">
        <div className="manifesto-inner">
          <div className="manifesto-side">01 — MANIFESTO</div>
          <div>
            <div className="eyebrow"><b>NOTA</b><span className="dash"></span><span>POR QUE EXISTIMOS</span></div>
            <p className="display">{c.manifestoA}</p>
            <p className="display" style={{ color: "var(--ink-soft)" }}>{c.manifestoB}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Manual() {
  return (
    <section className="manual" id="manual">
      <div className="wrap">
        <div className="section-head">
          <div className="section-num">02 ─ MANUAL DO USUÁRIO</div>
          <div>
            <h2 className="section-title">
              Nove capítulos.<br />
              Um <em>convite</em> sério.
            </h2>
            <p className="section-lede">
              O Manual do Usuário é o coração do que fazemos. É leitura aberta, sem cadastro, sem paywall. Cobre o que a ciência sabe, o que a história ensina, o que a lei brasileira ainda discute — e o que a redução de danos provou que funciona.
            </p>
          </div>
        </div>
        <div className="manual-toc">
          {CHAPTERS.map((ch) => (
            <a className="toc-item" key={ch.n} href={`manualdousuario-cannabis.html${ch.h}`}>
              <div className="num">{ch.n}</div>
              <div>
                <div className="title">{ch.title}</div>
                <div className="desc" style={{ marginTop: 10 }}>{ch.desc}</div>
              </div>
              <div className="meta">
                <span>· {ch.read} de leitura</span>
                <span className="read">LER →</span>
              </div>
            </a>
          ))}
        </div>
        <div className="manual-cta">
          <p>O manual é grátis. Sempre vai ser. Se quiser apoiar — leia, compartilhe, ou vista uma camiseta.</p>
          <a href="manualdousuario-cannabis.html">ABRIR O MANUAL COMPLETO ↗</a>
        </div>
      </div>
    </section>
  );
}

function PathFinder() {
  const [active, setActive] = useState("curioso");
  const path = PATHS.find((p) => p.id === active);
  return (
    <section className="pathfinder" id="caminho">
      <div className="wrap">
        <div className="pf-head">
          <div className="section-num">03 ─ POR ONDE COMEÇAR</div>
          <div>
            <h2>Quem é <em>você</em> nessa conversa?</h2>
            <p>O manual é grande. Você não precisa ler tudo de uma vez. Diga quem você é — sugerimos por onde entrar. Quatro portas, todas válidas, nenhuma melhor.</p>
          </div>
        </div>
        <div className="pf-grid">
          <div className="pf-left">
            {PATHS.map((p) => (
              <button
                key={p.id}
                className={"pf-option" + (active === p.id ? " active" : "")}
                onClick={() => setActive(p.id)}
              >
                <span className="n">{p.n}</span>
                <span className="lbl">{p.label}</span>
                <span className="arr">→</span>
              </button>
            ))}
          </div>
          <div className="pf-right">
            <div className="pf-right-eyebrow">↳ {path.eyebrow}</div>
            <h3>{path.title}</h3>
            <p>{path.p}</p>
            <div className="pf-chips">
              {path.chips.map((c) => (
                <a key={c.t} className="pf-chip" href={`manualdousuario-cannabis.html${c.h}`}>
                  {c.t} →
                </a>
              ))}
            </div>
            <div className="pf-quote">{path.quote}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Drop() {
  return (
    <section className="drop" id="drop">
      <div className="wrap">
        <div className="section-head">
          <div className="section-num">04 ─ DROP #01</div>
          <div>
            <h2 className="section-title">
              Vestir a <em>conversa</em>.
            </h2>
            <p className="section-lede">
              Cinco peças. Cada uma ligada a um capítulo do manual. <strong>20 unidades por estampa</strong>, numeradas à mão. Quando acabar, essa arte nunca mais volta.
            </p>
          </div>
        </div>
        <div className="drop-shelf">
          {PRODUCTS.map((p, i) => (
            <a className="product" key={p.slug} href={`${p.slug}.html`}>
              <div className="product-head">
                <span className="pos">POS · {String(i + 1).padStart(2, "0")} / 06</span>
                <span className="ch">{p.chapter}</span>
              </div>
              <div className="product-img">
                <img src={p.img} alt={p.name} />
              </div>
              <div className="product-foot">
                <div>
                  <div className="name">{p.name}</div>
                  <div className="sub">{p.sub}</div>
                </div>
                <div className="price">
                  R$ {p.price}
                  <small>{p.full ? "PACOTE" : "20 / 20"}</small>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function Closing({ tom }) {
  const c = TOM_COPY[tom] || TOM_COPY.equilibrio;
  return (
    <section className="closing">
      <div className="wrap">
        <div className="closing-inner">
          <h2>{c.closingH}</h2>
          <div className="closing-right">
            <p>{c.closingP}</p>
            <div className="closing-cta">
              <a className="btn btn-primary" href="#drop">ESCOLHER ESTAMPA</a>
              <a className="btn btn-ghost" href="manualdousuario-cannabis.html">LER O MANUAL</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="foot-grid">
          <div>
            <div className="foot-brand">TIWSHIRTS</div>
            <div className="foot-brand-tag">Manual antes da estampa. Conversa antes do consumo.</div>
          </div>
          <div>
            <h4>DROP #01</h4>
            <ul>
              <li><a href="drop-01.html">Ver todas as peças</a></li>
              <li><a href="camiseta-maconheiro.html">Maconheiro</a></li>
              <li><a href="camiseta-nao-somos-ma-pessoa.html">Não Somos Má Pessoa</a></li>
              <li><a href="camiseta-just-doob-it.html">Just Doob It</a></li>
              <li><a href="camiseta-maconha-salva-vidas.html">Maconha Salva Vidas</a></li>
              <li><a href="camiseta-legaliza.html">Legaliza</a></li>
            </ul>
          </div>
          <div>
            <h4>MANUAL</h4>
            <ul>
              <li><a href="manualdousuario-cannabis.html">Manual do Usuário</a></li>
              <li><a href="manifesto.html">Manifesto</a></li>
              <li><a href="sobre.html">Sobre</a></li>
              <li><a href="blog.html">Blog</a></li>
            </ul>
          </div>
          <div>
            <h4>CONTATO</h4>
            <ul>
              <li><a href="tel:+5515981512083">+55 15 98151-2083</a></li>
              <li><a href="https://www.instagram.com/tiwdoo" target="_blank" rel="noreferrer">Instagram · @tiwdoo</a></li>
              <li><a href="https://www.tiktok.com/@tiwdoo" target="_blank" rel="noreferrer">TikTok · @tiwdoo</a></li>
              <li><a href="https://www.youtube.com/@tiwdoo" target="_blank" rel="noreferrer">YouTube · @tiwdoo</a></li>
            </ul>
          </div>
        </div>
        <div className="foot-bot">
          <div>© 2026 TIWSHIRTS · TODOS OS DIREITOS RESERVADOS</div>
          <div>POR @TIWDOO &amp; @EDU.BOVOLINE</div>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────────────────
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Apply palette as CSS vars
  useEffect(() => {
    const r = document.documentElement;
    const palettes = {
      "verde-terra": { primary: "#2d5a27", deep: "#1f3a1c", accent: "#c75b3e", paper: "#f0e7d2", paper2: "#e6dcc4", paper3: "#d9cdaf" },
      "rust-creme":  { primary: "#c75b3e", deep: "#7d2e1c", accent: "#a86a2a", paper: "#f3ead7", paper2: "#e8dec8", paper3: "#dbcfb2" },
      "mono":        { primary: "#1a1a1a", deep: "#000000", accent: "#1a1a1a", paper: "#ece9e0", paper2: "#dfdbcf", paper3: "#cec9bb" },
      "terra-deep":  { primary: "#a86a2a", deep: "#6b3f12", accent: "#c75b3e", paper: "#efe5cf", paper2: "#e3d7bb", paper3: "#cebd99" },
    };
    const p = palettes[t.paleta] || palettes["verde-terra"];
    r.style.setProperty("--primary", p.primary);
    r.style.setProperty("--primary-deep", p.deep);
    r.style.setProperty("--rust", p.accent);
    r.style.setProperty("--paper", p.paper);
    r.style.setProperty("--paper-2", p.paper2);
    r.style.setProperty("--paper-3", p.paper3);
  }, [t.paleta]);

  // Density tweak
  useEffect(() => {
    const r = document.documentElement;
    if (t.densidade === "compacta") r.style.setProperty("font-size", "14.5px");
    else if (t.densidade === "ampla") r.style.setProperty("font-size", "16.5px");
    else r.style.setProperty("font-size", "15.5px");
  }, [t.densidade]);

  // Section order
  const sections = useMemo(() => {
    const m = <Manual key="manual" />;
    const p = <PathFinder key="pf" />;
    const d = <Drop key="drop" />;
    if (t.ordem === "loja-primeiro")    return [d, m, p];
    if (t.ordem === "manual-primeiro")  return [m, p, d];
    if (t.ordem === "alternado")        return [p, m, d];
    return [m, p, d];
  }, [t.ordem]);

  return (
    <>
      <Nav />
      <Hero tom={t.tom} />
      {t.mostrarTicker && <Ticker />}
      <Manifesto tom={t.tom} />
      {sections}
      <Closing tom={t.tom} />
      <Footer />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Tom da copy" />
        <TweakRadio
          value={t.tom}
          options={["acolhedor", "equilibrio", "provocativo"]}
          onChange={(v) => setTweak("tom", v)}
        />
        <TweakSection label="Equilíbrio das seções" />
        <TweakSelect
          label="Ordem"
          value={t.ordem}
          options={[
            { value: "manual-primeiro", label: "Manual → Caminho → Loja" },
            { value: "alternado",       label: "Caminho → Manual → Loja" },
            { value: "loja-primeiro",   label: "Loja → Manual → Caminho" },
          ]}
          onChange={(v) => setTweak("ordem", v)}
        />
        <TweakSection label="Paleta" />
        <TweakSelect
          label="Combo"
          value={t.paleta}
          options={[
            { value: "verde-terra", label: "Verde + Terra (manual)" },
            { value: "rust-creme",  label: "Rust + Creme" },
            { value: "terra-deep",  label: "Terra profundo" },
            { value: "mono",        label: "P&B puro (brutalista)" },
          ]}
          onChange={(v) => setTweak("paleta", v)}
        />
        <TweakSection label="Densidade" />
        <TweakRadio
          value={t.densidade}
          options={["compacta", "regular", "ampla"]}
          onChange={(v) => setTweak("densidade", v)}
        />
        <TweakSection label="Detalhes" />
        <TweakToggle
          label="Mostrar ticker"
          value={t.mostrarTicker}
          onChange={(v) => setTweak("mostrarTicker", v)}
        />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
