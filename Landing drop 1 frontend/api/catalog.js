// Vercel Serverless Function — GET /api/catalog
// Catálogo vivo oficial TiwShirts (7 estampas × 3 linhas × estoque real de pronta-entrega e bases lisas)

const LINES = [
  { id: 'pf',       name: 'Linha Clássica 30.1',    sizes: ['P', 'M', 'G', 'GG'], price: 139.0, wholesale: 69.0 },
  { id: 'casca',    name: 'Linha OverHeavy 220g',   sizes: ['P', 'M', 'G', 'GG'], price: 179.0, wholesale: 89.0 },
  { id: 'espacoso', name: 'Linha OverLight Extra G', sizes: ['G1', 'G2', 'G3'],    price: 179.0, wholesale: 89.0 },
];

const COLORS = [
  { id: 'branco',        name: 'Branca' },
  { id: 'preto',         name: 'Preta' },
  { id: 'offwhite',      name: 'Off-White' },
  { id: 'verde-militar', name: 'Verde Militar' },
  { id: 'azul-marinho',  name: 'Azul Marinho' },
];

const PRODUCTS = [
  { id: 'maconheiro', name: 'Maconheiro' },
  { id: 'legaliza',   name: 'Legaliza Pra Pobre Também' },
  { id: 'justdoobit', name: 'Just Doob It' },
  { id: 'salvavidas', name: 'Maconha Salva Vidas' },
  { id: 'tricomas',   name: 'Eu Amo Tricomas' },
  { id: 'sugiro',     name: 'Sugiro Maconha (se informar sobre)' },
  { id: 'medicina',   name: 'Medicina Ancestral' },
];

// Combos oficiais comercializados (Medicina Ancestral exclusivamente em Branca e Off-White)
const CATALOG = [
  {
    product: 'maconheiro',
    combos: [
      { line: 'pf',       color: 'preto' },
      { line: 'casca',    color: 'preto' },
      { line: 'espacoso', color: 'preto' },
    ],
  },
  {
    product: 'legaliza',
    combos: [
      { line: 'pf',       color: 'preto' },
      { line: 'casca',    color: 'preto' },
      { line: 'espacoso', color: 'preto' },
    ],
  },
  {
    product: 'justdoobit',
    combos: [
      { line: 'pf',       color: 'preto' },
      { line: 'pf',       color: 'branco' },
      { line: 'casca',    color: 'preto' },
      { line: 'casca',    color: 'offwhite' },
      { line: 'espacoso', color: 'preto' },
      { line: 'espacoso', color: 'branco' },
      { line: 'espacoso', color: 'offwhite' },
    ],
  },
  {
    product: 'salvavidas',
    combos: [
      { line: 'pf',       color: 'preto' },
      { line: 'pf',       color: 'branco' },
      { line: 'casca',    color: 'preto' },
      { line: 'casca',    color: 'offwhite' },
      { line: 'espacoso', color: 'preto' },
      { line: 'espacoso', color: 'branco' },
      { line: 'espacoso', color: 'offwhite' },
    ],
  },
  {
    product: 'tricomas',
    combos: [
      { line: 'pf',       color: 'preto',        label: 'Purple Haze' },
      { line: 'pf',       color: 'azul-marinho', label: 'Sour Diesel' },
      { line: 'pf',       color: 'offwhite',     label: 'OG Kush' },
      { line: 'casca',    color: 'preto',        label: 'Purple Haze' },
      { line: 'casca',    color: 'offwhite',     label: 'OG Kush' },
      { line: 'espacoso', color: 'preto',        label: 'Purple Haze' },
      { line: 'espacoso', color: 'offwhite',     label: 'OG Kush' },
    ],
  },
  {
    product: 'sugiro',
    combos: [
      { line: 'pf',       color: 'preto' },
      { line: 'casca',    color: 'preto' },
      { line: 'espacoso', color: 'preto' },
    ],
  },
  {
    product: 'medicina',
    combos: [
      { line: 'pf',       color: 'branco' },
      { line: 'casca',    color: 'offwhite' },
      { line: 'espacoso', color: 'branco' },
      { line: 'espacoso', color: 'offwhite' },
    ],
  },
];

// Inventário físico real — 11 peças estampadas prontas (Envio imediato / 24h)
const FINISHED_INVENTORY = {
  'justdoobit_casca_preto_m':      1,
  'justdoobit_pf_preto_g':         1,
  'justdoobit_pf_branco_g':        1,
  'tricomas_pf_azul-marinho_m':    1,
  'tricomas_pf_preto_g':           1,
  'sugiro_pf_preto_gg':            1,
  'salvavidas_casca_preto_g':      1,
  'medicina_casca_offwhite_g':     1,
  'salvavidas_casca_offwhite_g':   1,
  'medicina_pf_branco_m':          1,
  'salvavidas_pf_preto_m':         1,
};

// Inventário físico real — 9 bases lisas em estoque (Envio em 3 dias úteis)
const BLANK_INVENTORY = {
  'casca:offwhite:M':     1,
  'casca:preto:GG':       1,
  'espacoso:preto:G1':    1,
  'espacoso:preto:G2':    2,
  'espacoso:preto:G3':    1,
  'espacoso:offwhite:G1': 1,
  'espacoso:branco:G1':   2,
};

function resolveAvailability(sku, lineId, colorId, size) {
  const finishedQty = FINISHED_INVENTORY[sku] || 0;
  const blankQty = BLANK_INVENTORY[`${lineId}:${colorId}:${size}`] || 0;

  if (finishedQty > 0) {
    return {
      finished_qty: finishedQty,
      blank_qty: blankQty,
      status: 'PRONTA_ENTREGA',
      label: '● Envio imediato (24h)',
      lead: '24h',
    };
  }
  if (blankQty > 0) {
    return {
      finished_qty: 0,
      blank_qty: blankQty,
      status: 'ENVIO_3_DIAS',
      label: '● Envio em 3 dias úteis',
      lead: '3 dias úteis',
    };
  }
  return {
    finished_qty: 0,
    blank_qty: 0,
    status: 'PRE_COMPRA',
    label: '● Envio em 7 a 10 dias úteis',
    lead: '7 a 10 dias úteis',
  };
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const combosById = {};
  for (const entry of CATALOG) combosById[entry.product] = entry.combos;

  const products = PRODUCTS.map((prod) => {
    const combos = combosById[prod.id] || [];
    const options = combos.map((combo) => {
      const line = LINES.find((l) => l.id === combo.line);
      const color = COLORS.find((c) => c.id === combo.color);
      const sizes = (line ? line.sizes : []).map((size) => {
        const sku = `${prod.id}_${combo.line}_${combo.color}_${size.toLowerCase()}`;
        return {
          size,
          sku,
          ...resolveAvailability(sku, combo.line, combo.color, size),
        };
      });
      return {
        key: `${combo.line}:${combo.color}`,
        line_id: combo.line,
        line_name: line ? line.name : combo.line,
        color_id: combo.color,
        color_name: color ? color.name : combo.color,
        label: combo.label || null,
        price: line ? line.price : 0,
        price_label: line ? `R$ ${line.price.toFixed(0)}` : '',
        sizes,
      };
    });
    return { id: prod.id, name: prod.name, options };
  });

  res.status(200).json({
    success: true,
    lead_immediate: '24h',
    lead_blank: '3 dias úteis',
    lead_reprint: '7 a 10 dias úteis',
    checkout_provider: 'infinitepay',
    infinitepay_handle: (process.env.INFINITEPAY_HANDLE || 'edu_bovoline').replace(/^\$/, ''),
    count: products.length,
    products,
  });
};
