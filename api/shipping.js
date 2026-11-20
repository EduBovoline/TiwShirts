// Vercel Serverless Function — /api/shipping
// Integração Oficial API Melhor Envio v2 (https://docs.melhorenvio.com.br/reference/introducao-api-melhor-envio)
// • CEP de Origem Oficial TiwShirts: 18090-602 (Sorocaba/SP)
// • Embalagem Oficial Unificada (1 Pote Hermético c/ camiseta): 12cm (L) × 18cm (A) × 12cm (C) · 0.45kg
// • Suporta cotação em tempo real (POST /api/v2/me/shipment/calculate) + Contingência inteligente por CEP/UF
// • Suporta pré-etiqueta no carrinho do Melhor Envio com Declaração de Conteúdo / DCe (POST /api/v2/me/cart)

const { setCors, parseBody, adminHeaders } = require('./_supabase');

const ORIGIN_CEP = (process.env.MELHOR_ENVIO_FROM_CEP || '18090602').replace(/\D/g, '');
const JAR_SPEC = {
  width: 12,   // cm
  height: 18,  // cm
  length: 12,  // cm
  weight: 0.45 // kg (450g)
};

function getMeBaseUrl() {
  return process.env.MELHOR_ENVIO_SANDBOX === 'true'
    ? 'https://sandbox.melhorenvio.com.br'
    : 'https://melhorenvio.com.br';
}

function getMeHeaders(token) {
  const contactEmail = process.env.MELHOR_ENVIO_CONTACT_EMAIL || 'edubovoline@gmail.com';
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': `TiwShirts (${contactEmail})`,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function lookupViaCep(cep) {
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data || data.erro) return null;
    return {
      cep: String(data.cep || cep).replace(/\D/g, ''),
      street: data.logradouro || '',
      neighborhood: data.bairro || '',
      city: data.localidade || '',
      uf: data.uf || '',
    };
  } catch (e) {
    return null;
  }
}

// Tabela de contingência calibrada a partir de Sorocaba/SP (18090-602) por faixa de CEP e peso (0.45kg/pote)
function buildFallbackQuotes(toCep, totalQty, totalInsurance) {
  const clean = String(toCep || '').replace(/\D/g, '');
  const prefix3 = Number(clean.slice(0, 3) || 0);
  const prefix2 = Number(clean.slice(0, 2) || 0);
  const qty = Math.max(1, Number(totalQty) || 1);
  const extraJars = Math.max(0, qty - 1);
  const insuranceFee = Number(totalInsurance || 139) * 0.01;

  // 1. Sorocaba e região imediata (180xx a 181xx)
  let sedexBase = 16.9;
  let pacBase = 14.9;
  let jadlogBase = 17.5;
  let perJar = 2.2;
  let sedexDays = 2;
  let pacDays = 4;
  let jadlogDays = 3;

  if (prefix3 >= 180 && prefix3 <= 181) {
    sedexBase = 14.9;
    pacBase = 13.5;
    jadlogBase = 15.9;
    perJar = 1.5;
    sedexDays = 1;
    pacDays = 3;
    jadlogDays = 2;
  } else if (prefix2 >= 1 && prefix2 <= 19) {
    // Estado de São Paulo (Capital, Grande SP e Interior)
    sedexBase = 18.9;
    pacBase = 16.4;
    jadlogBase = 18.5;
    perJar = 2.1;
    sedexDays = 2;
    pacDays = 5;
    jadlogDays = 4;
  } else if ((prefix2 >= 20 && prefix2 <= 39) || (prefix2 >= 80 && prefix2 <= 89)) {
    // RJ, ES, MG, PR, SC
    sedexBase = 32.9;
    pacBase = 23.9;
    jadlogBase = 24.9;
    perJar = 3.5;
    sedexDays = 3;
    pacDays = 7;
    jadlogDays = 6;
  } else if ((prefix2 >= 90 && prefix2 <= 99) || (prefix2 >= 70 && prefix2 <= 76) || prefix2 === 78 || prefix2 === 79) {
    // RS, DF, GO, MS, MT, TO
    sedexBase = 39.9;
    pacBase = 27.9;
    jadlogBase = 28.9;
    perJar = 4.2;
    sedexDays = 4;
    pacDays = 8;
    jadlogDays = 7;
  } else if (prefix2 >= 40 && prefix2 <= 65) {
    // Nordeste (BA, SE, AL, PE, PB, RN, CE, PI, MA)
    sedexBase = 52.9;
    pacBase = 34.9;
    jadlogBase = 36.9;
    perJar = 5.4;
    sedexDays = 5;
    pacDays = 10;
    jadlogDays = 9;
  } else {
    // Norte (PA, AM, AC, RO, RR, AP)
    sedexBase = 64.9;
    pacBase = 42.9;
    jadlogBase = 45.9;
    perJar = 6.5;
    sedexDays = 6;
    pacDays = 13;
    jadlogDays = 11;
  }

  const pacPrice = Number((pacBase + extraJars * perJar + insuranceFee).toFixed(2));
  const sedexPrice = Number((sedexBase + extraJars * (perJar * 1.35) + insuranceFee).toFixed(2));
  const jadlogPrice = Number((jadlogBase + extraJars * (perJar * 1.1) + insuranceFee).toFixed(2));

  return [
    {
      id: 1,
      service_id: 1,
      name: 'PAC',
      company: 'Correios',
      price: pacPrice,
      delivery_days: pacDays,
      label: `Correios PAC · até ${pacDays} dias úteis`,
    },
    {
      id: 2,
      service_id: 2,
      name: 'SEDEX',
      company: 'Correios',
      price: sedexPrice,
      delivery_days: sedexDays,
      label: `Correios SEDEX · até ${sedexDays} dias úteis`,
    },
    {
      id: 3,
      service_id: 3,
      name: '.Package',
      company: 'Jadlog',
      price: jadlogPrice,
      delivery_days: jadlogDays,
      label: `Jadlog .Package · até ${jadlogDays} dias úteis`,
    },
  ].sort((a, b) => a.price - b.price);
}

function buildProductsPayload(items, fallbackQty, fallbackValue) {
  if (Array.isArray(items) && items.length > 0) {
    return items.map((it, idx) => ({
      id: String(it.sku || it.id || `pote-${idx + 1}`),
      width: JAR_SPEC.width,
      height: JAR_SPEC.height,
      length: JAR_SPEC.length,
      weight: JAR_SPEC.weight,
      insurance_value: Number(Number(it.unit_price || it.price || 139).toFixed(2)),
      quantity: Math.max(1, Number(it.qty || it.quantity || 1)),
    }));
  }
  const qty = Math.max(1, Number(fallbackQty) || 1);
  const unitVal = Number(Number(fallbackValue || 139).toFixed(2));
  return [
    {
      id: 'pote-tiwshirts',
      width: JAR_SPEC.width,
      height: JAR_SPEC.height,
      length: JAR_SPEC.length,
      weight: JAR_SPEC.weight,
      insurance_value: unitVal,
      quantity: qty,
    },
  ];
}

// Calcula volume consolidado para N potes herméticos (12x18x12cm · 0.45kg cada)
function buildConsolidatedVolume(totalQty) {
  const qty = Math.max(1, Number(totalQty) || 1);
  if (qty === 1) {
    return [{ width: 12, height: 18, length: 12, weight: 0.45 }];
  }
  if (qty === 2) {
    return [{ width: 24, height: 18, length: 12, weight: 0.9 }];
  }
  if (qty <= 4) {
    return [{ width: 24, height: 18, length: 24, weight: Number((qty * 0.45).toFixed(2)) }];
  }
  if (qty <= 6) {
    return [{ width: 36, height: 18, length: 24, weight: Number((qty * 0.45).toFixed(2)) }];
  }
  // Caixa Atacado (até 12 potes por volume: 3x2 na base = 36x24, 2 andares = 36cm altura)
  const boxes = Math.ceil(qty / 12);
  const perBox = Math.ceil(qty / boxes);
  return Array.from({ length: boxes }, () => ({
    width: 36,
    height: 36,
    length: 24,
    weight: Number((perBox * 0.45).toFixed(2)),
  }));
}

async function handleCalculate(req, res, params) {
  const rawCep = params.to_cep || params.cep || '';
  const cleanToCep = String(rawCep).replace(/\D/g, '');
  if (cleanToCep.length !== 8) {
    return res.status(400).json({
      success: false,
      error: 'Informe um CEP válido com 8 dígitos.',
    });
  }

  const products = buildProductsPayload(params.items, params.qty, params.unit_value || params.value);
  const totalQty = products.reduce((s, p) => s + p.quantity, 0);
  const totalInsurance = products.reduce((s, p) => s + p.insurance_value * p.quantity, 0);

  const token = (process.env.MELHOR_ENVIO_TOKEN || '').trim();
  const viaCepPromise = lookupViaCep(cleanToCep);

  if (token) {
    try {
      const mePayload = {
        from: { postal_code: ORIGIN_CEP },
        to: { postal_code: cleanToCep },
        products,
        options: {
          receipt: false,
          own_hand: false,
        },
      };
      if (params.services) {
        mePayload.services = String(params.services);
      }

      const meResp = await fetch(`${getMeBaseUrl()}/api/v2/me/shipment/calculate`, {
        method: 'POST',
        headers: getMeHeaders(token),
        body: JSON.stringify(mePayload),
      });

      if (meResp.ok) {
        const rawList = await meResp.json();
        const list = Array.isArray(rawList) ? rawList : [];
        const validOptions = list
          .filter((item) => !item.error && Number(item.custom_price || item.price) > 0)
          .map((item) => {
            const price = Number(Number(item.custom_price || item.price).toFixed(2));
            const days = Number(item.custom_delivery_time || item.delivery_time || 5);
            const company = (item.company && item.company.name) || 'Transportadora';
            return {
              id: Number(item.id),
              service_id: Number(item.id),
              name: item.name,
              company,
              price,
              delivery_days: days,
              label: `${company} ${item.name} · até ${days} dia(s) úteis`,
            };
          })
          .sort((a, b) => a.price - b.price);

        if (validOptions.length > 0) {
          const destination = await viaCepPromise;
          return res.status(200).json({
            success: true,
            mode: 'melhorenvio_live',
            origin_cep: ORIGIN_CEP,
            to_cep: cleanToCep,
            destination,
            jar_spec: JAR_SPEC,
            total_jars: totalQty,
            options: validOptions,
          });
        }
      }
    } catch (e) {
      // Cai para contingência calibrada
    }
  }

  const destination = await viaCepPromise;
  const fallbackOptions = buildFallbackQuotes(cleanToCep, totalQty, totalInsurance);

  return res.status(200).json({
    success: true,
    mode: token ? 'contingencia_api' : 'contingencia_cep',
    token_configured: Boolean(token),
    origin_cep: ORIGIN_CEP,
    to_cep: cleanToCep,
    destination,
    jar_spec: JAR_SPEC,
    total_jars: totalQty,
    options: fallbackOptions,
  });
}

async function handleAddToCart(req, res, body) {
  const headers = adminHeaders(req);
  if (!headers) {
    return res.status(401).json({ success: false, error: 'Autenticação administrativa necessária.' });
  }

  const token = (process.env.MELHOR_ENVIO_TOKEN || '').trim();
  const recipient = body.recipient || body.customer || {};
  const cleanToCep = String(recipient.cep || recipient.postal_code || '').replace(/\D/g, '');
  if (cleanToCep.length !== 8) {
    return res.status(400).json({ success: false, error: 'CEP do destinatário inválido.' });
  }

  const items = Array.isArray(body.items) && body.items.length > 0
    ? body.items
    : [{ name: 'Camiseta TiwShirts (Pote Hermético)', qty: 1, unit_price: 139 }];

  const totalQty = items.reduce((s, i) => s + Math.max(1, Number(i.qty || i.quantity || 1)), 0);
  const totalInsurance = Number(
    items.reduce((s, i) => s + Number(i.unit_price || i.price || 139) * Math.max(1, Number(i.qty || i.quantity || 1)), 0).toFixed(2)
  );

  const via = await lookupViaCep(cleanToCep);

  // Busca automaticamente os dados reais do remetente autenticado no Melhor Envio (/api/v2/me)
  let meUser = null;
  if (token) {
    try {
      const meResp = await fetch(`${getMeBaseUrl()}/api/v2/me`, { headers: getMeHeaders(token) });
      if (meResp.ok) meUser = await meResp.json();
    } catch (e) {}
  }

  const meAddr = (meUser && meUser.address) || {};
  const meCity = (meAddr.city && meAddr.city.city) || 'Sorocaba';
  const meUf = (meAddr.city && meAddr.city.state && meAddr.city.state.state_abbr) || 'SP';
  const meFullName = meUser ? `${meUser.firstname || ''} ${meUser.lastname || ''}`.trim() : '';

  const sender = {
    name: process.env.MELHOR_ENVIO_FROM_NAME || meFullName || 'TiwShirts',
    phone: (process.env.MELHOR_ENVIO_FROM_PHONE || (meUser && meUser.phone && meUser.phone.phone) || '15981512083').replace(/\D/g, ''),
    email: process.env.MELHOR_ENVIO_FROM_EMAIL || (meUser && meUser.email) || 'edubovoline@gmail.com',
    document: (process.env.MELHOR_ENVIO_FROM_CPF || (meUser && meUser.document) || '').replace(/\D/g, '') || undefined,
    company_document: (process.env.MELHOR_ENVIO_FROM_CNPJ || '').replace(/\D/g, '') || undefined,
    state_register: 'ISENTO',
    address: process.env.MELHOR_ENVIO_FROM_ADDRESS || meAddr.address || 'Rua General Antunes Gurjão',
    number: process.env.MELHOR_ENVIO_FROM_NUMBER || meAddr.number || '196',
    district: process.env.MELHOR_ENVIO_FROM_DISTRICT || meAddr.district || 'Além Ponte',
    city: process.env.MELHOR_ENVIO_FROM_CITY || meCity || 'Sorocaba',
    state_abbr: process.env.MELHOR_ENVIO_FROM_UF || meUf || 'SP',
    country_id: 'BR',
    postal_code: ORIGIN_CEP,
  };

  const toDoc = String(recipient.cpf || recipient.document || '').replace(/\D/g, '');
  const cartPayload = {
    service: Number(body.service_id || 1),
    from: sender,
    to: {
      name: recipient.name || 'Cliente TiwShirts',
      phone: String(recipient.phone || '').replace(/\D/g, ''),
      email: recipient.email || 'cliente@tiwshirts.space',
      document: toDoc || undefined,
      address: recipient.street || recipient.address || (via && via.street) || 'Endereço informado no pedido',
      number: recipient.number || 'SN',
      complement: recipient.complement || '',
      district: recipient.neighborhood || (via && via.neighborhood) || 'Centro',
      city: recipient.city || (via && via.city) || 'São Paulo',
      state_abbr: recipient.uf || (via && via.uf) || 'SP',
      country_id: 'BR',
      postal_code: cleanToCep,
    },
    products: items.map((i) => ({
      name: `${i.name || 'Camiseta TiwShirts'}${i.size ? ' (' + i.size + ')' : ''}`,
      quantity: String(Math.max(1, Number(i.qty || i.quantity || 1))),
      unitary_value: String(Number(i.unit_price || i.price || 139).toFixed(2)),
    })),
    volumes: buildConsolidatedVolume(totalQty),
    options: {
      insurance_value: totalInsurance,
      receipt: false,
      own_hand: false,
      reverse: false,
      non_commercial: true, // Envio com Declaração de Conteúdo / DCe (sem exigir chave NF-e)
      tags: [{ tag: String(body.order_id || 'TIW'), url: 'https://tiwshirts.space/admin' }],
    },
  };

  if (!token) {
    return res.status(200).json({
      success: false,
      token_missing: true,
      error: 'Configure a variável MELHOR_ENVIO_TOKEN na Vercel para enviar direto ao carrinho do Melhor Envio.',
      prepared_payload: cartPayload,
    });
  }

  try {
    const resp = await fetch(`${getMeBaseUrl()}/api/v2/me/cart`, {
      method: 'POST',
      headers: getMeHeaders(token),
      body: JSON.stringify(cartPayload),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res.status(resp.status).json({
        success: false,
        error: (data && (data.message || data.error)) || 'Melhor Envio recusou a pré-etiqueta (verifique CPF do remetente/destinatário).',
        details: data,
        prepared_payload: cartPayload,
      });
    }
    return res.status(200).json({
      success: true,
      melhorenvio_cart_id: data.id,
      protocol: data.protocol,
      price: data.price,
      panel_url: process.env.MELHOR_ENVIO_SANDBOX === 'true'
        ? 'https://sandbox.melhorenvio.com.br/carrinho'
        : 'https://melhorenvio.com.br/carrinho',
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

module.exports = async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      if (req.query && req.query.action === 'status') {
        return res.status(200).json({
          success: true,
          origin_cep: ORIGIN_CEP,
          jar_spec: JAR_SPEC,
          token_configured: Boolean((process.env.MELHOR_ENVIO_TOKEN || '').trim()),
          sandbox: process.env.MELHOR_ENVIO_SANDBOX === 'true',
        });
      }
      return await handleCalculate(req, res, req.query || {});
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      if (body.action === 'add_to_cart') {
        return await handleAddToCart(req, res, body);
      }
      return await handleCalculate(req, res, body);
    }

    return res.status(405).json({ success: false, error: 'Método não permitido.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Erro no cálculo de frete.' });
  }
};
