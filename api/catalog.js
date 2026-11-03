// Vercel Serverless Function — GET /api/catalog
// Catálogo vivo oficial TiwShirts (7 estampas × 3 linhas × grade oficial)

const LINES = [
  { id: 'pf',       name: 'Linha Clássica 30.1',    sizes: ['P', 'M', 'G', 'GG'], price: 139.0, wholesale: 69.0 },
  { id: 'casca',    name: 'Linha OverHeavy 220g',   sizes: ['P', 'M', 'G', 'GG'], price: 179.0, wholesale: 89.0 },
  { id: 'espacoso', name: 'Linha OverLight Extra G', sizes: ['G1', 'G2', 'G3'],    price: 179.0, wholesale: 89.0 },
];

const COLORS = [
  { id: 'branco',        name: 'Branco' },
  { id: 'preto',         name: 'Preto' },
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

const CATALOG = [
  { product: 'maconheiro', combos: [ { line: 'pf', color: 'preto' }, { line: 'casca', color: 'preto' }, { line: 'espacoso', color: 'preto' } ] },
  { product: 'legaliza',   combos: [ { line: 'pf', color: 'preto' }, { line: 'casca', color: 'preto' }, { line: 'espacoso', color: 'preto' } ] },
  { product: 'justdoobit', combos: [ { line: 'pf', color: 'branco' }, { line: 'casca', color: 'preto' }, { line: 'espacoso', color: 'preto' } ] },
  { product: 'salvavidas', combos: [ { line: 'pf', color: 'branco' }, { line: 'casca', color: 'preto' }, { line: 'espacoso', color: 'preto' } ] },
  { product: 'tricomas',   combos: [ { line: 'pf', color: 'preto', label: 'Purple Haze' }, { line: 'pf', color: 'azul-marinho', label: 'Sour Diesel' }, { line: 'pf', color: 'offwhite', label: 'OG Kush' } ] },
  { product: 'sugiro',     combos: [ { line: 'pf', color: 'preto' }, { line: 'casca', color: 'preto' }, { line: 'espacoso', color: 'preto' } ] },
  { product: 'medicina',   combos: [ { line: 'pf', color: 'branco' } ] },
];

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
        const isImmediate = combo.line === 'casca' && combo.color === 'preto' && (size === 'M' || size === 'G');
        return {
          size,
          sku,
          finished_qty: isImmediate ? 3 : 0,
          blank_qty: 4,
          status: isImmediate ? 'PRONTA_ENTREGA' : 'SOB_ENCOMENDA',
          label: isImmediate ? '● Pronta entrega (envio imediato)' : '● Disponível (envio em 2 a 4 dias)',
          lead: isImmediate ? null : '2 a 4 dias',
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
    lead_blank: '2 a 4 dias',
    lead_reprint: '7 a 10 dias',
    mercadopago_configured: !!process.env.MP_ACCESS_TOKEN,
    count: products.length,
    products,
  });
};
