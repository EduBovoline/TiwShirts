// Vercel Serverless Function — /api/orders
// 1. InfinitePay Checkout Integrado (Pix R$ 0,00 + Cartão até 12x)
// 2. Pix EMV Direto na Tela (QR Code + Copia e Cola — Taxa R$ 0,00)
// 3. Suporte a cupons 10+10, cálculo exato em centavos e persistência no Supabase

const {
  WHATSAPP_TIW,
  setCors,
  anonHeaders,
  adminHeaders,
  parseBody,
  sbFetch,
  isMissingTableError,
  fetchValidCoupon,
} = require('./_supabase');
const { quoteShippingOptions } = require('./shipping');

const LINE_PRICES = {
  pf: 139.0,
  casca: 179.0,
  espacoso: 179.0,
};

const LINE_NAMES = {
  pf: 'Linha Clássica 30.1',
  casca: 'Linha OverHeavy 220g',
  espacoso: 'Linha OverLight Extra G',
};

function emvField(id, value) {
  const str = String(value);
  const len = String(str.length).padStart(2, '0');
  return `${id}${len}${str}`;
}

function crc16ccitt(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function buildPixPayload({ key, merchantName, merchantCity, amount, txid }) {
  const cleanKey = key || process.env.PIX_KEY || '+5515981512083';
  const name = (merchantName || 'TIWSHIRTS').slice(0, 25);
  const city = (merchantCity || 'SOROCABA').slice(0, 15);
  const cleanTxid = (txid || 'TIWSHIRTS').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || '***';

  const gui = emvField('00', 'br.gov.bcb.pix');
  const keyField = emvField('01', cleanKey);
  const mai = emvField('26', gui + keyField);

  const payload =
    emvField('00', '01') +
    mai +
    emvField('52', '0000') +
    emvField('53', '986') +
    (amount > 0 ? emvField('54', Number(amount).toFixed(2)) : '') +
    emvField('58', 'BR') +
    emvField('59', name) +
    emvField('60', city) +
    emvField('62', emvField('05', cleanTxid)) +
    '6304';

  return payload + crc16ccitt(payload);
}

async function createInfinitePayCheckout({ handle, orderId, orderNsu, items, shipping, customer, siteOrigin }) {
  const cleanHandle = String(handle || process.env.INFINITEPAY_HANDLE || 'edu_bovoline').replace(/^\$/, '').trim();
  const baseUrl = siteOrigin || process.env.PUBLIC_SITE_URL || 'https://tiwshirts.space';
  const redirectUrl = `${baseUrl}/?pedido=${encodeURIComponent(orderId)}&status=pago`;
  const nsu = String(orderNsu || orderId).slice(0, 50);

  // Descrições neutras de vestuário para evitar bloqueios por palavras-chave nas adquirentes
  const infiniteItems = items.map((it) => {
    const parts = String(it.sku || '').split('_');
    const refCode = (parts[0] || 'tiw').toUpperCase();
    const lineLabel = LINE_NAMES[parts[1]] || it.fit || 'Streetwear';
    const colorLabel = (parts[2] || '').toUpperCase();
    const desc = `Camiseta TiwShirts ${lineLabel} ${colorLabel} (${it.size}) [${refCode}]`.replace(/\s+/g, ' ').trim();
    return {
      name: desc,
      description: desc,
      quantity: Number(it.qty) || 1,
      price: Number(it.discounted_unit_cents || Math.round(Number(it.unit_price) * 100)),
    };
  });

  if (shipping && Number(shipping.price) > 0) {
    const shipCents = Math.round(Number(shipping.price) * 100);
    const shipDesc = `Frete ${shipping.company || ''} ${shipping.name || ''}`.replace(/\s+/g, ' ').trim();
    infiniteItems.push({
      name: shipDesc,
      description: shipDesc,
      quantity: 1,
      price: shipCents,
    });
  }

  const cleanPhone = String((customer && customer.phone) || '').replace(/\D/g, '');
  const formattedPhone = cleanPhone
    ? (cleanPhone.startsWith('55') ? `+${cleanPhone}` : `+55${cleanPhone}`)
    : undefined;
  const cleanCep = String((customer && customer.cep) || '').replace(/\D/g, '');

  const queryParams = new URLSearchParams();
  queryParams.set(
    'items',
    JSON.stringify(
      infiniteItems.map((i) => ({
        name: i.name,
        price: i.price,
        quantity: i.quantity,
      }))
    )
  );
  queryParams.set('order_nsu', nsu);
  queryParams.set('redirect_url', redirectUrl);
  if (customer && customer.name) queryParams.set('customer_name', customer.name);
  if (customer && customer.email) queryParams.set('customer_email', customer.email);
  if (cleanPhone) queryParams.set('customer_cellphone', cleanPhone);
  if (cleanCep) queryParams.set('address_cep', cleanCep);

  let checkoutUrl = `https://checkout.infinitepay.io/${encodeURIComponent(cleanHandle)}?${queryParams.toString()}`;

  try {
    const apiPayload = {
      handle: cleanHandle,
      order_nsu: nsu,
      redirect_url: redirectUrl,
      webhook_url: `${baseUrl}/api/orders?webhook=infinitepay`,
      items: infiniteItems.map((i) => ({
        quantity: i.quantity,
        price: i.price,
        description: i.description,
      })),
    };
    if (customer && (customer.name || customer.email || formattedPhone)) {
      apiPayload.customer = {
        name: customer.name || undefined,
        email: customer.email || undefined,
        phone_number: formattedPhone,
      };
    }
    if (cleanCep && cleanCep.length === 8) {
      apiPayload.address = {
        cep: cleanCep,
        street: (customer && customer.address) || 'Endereco informado no pedido',
        number: 'SN',
      };
    }

    const headers = { 'Content-Type': 'application/json' };
    if (process.env.INFINITEPAY_API_KEY) {
      headers['X-Api-Key'] = process.env.INFINITEPAY_API_KEY;
    }

    const endpoint = 'https://api.checkout.infinitepay.io/links';

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(apiPayload),
    });
    if (resp && resp.ok) {
      const data = await resp.json();
      if (data && (data.url || data.checkout_url)) {
        checkoutUrl = data.url || data.checkout_url;
      }
    }
  } catch (e) {
    // Mantém a URL universal do Checkout Integrado InfinitePay
  }

  return checkoutUrl;
}

module.exports = async (req, res) => {
  setCors(res, 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // GET: Consultar pedidos registrados (somente admin autenticado)
  if (req.method === 'GET') {
    const headers = adminHeaders(req);
    if (!headers) {
      return res.status(401).json({ success: false, error: 'Autenticação administrativa necessária.' });
    }
    try {
      const result = await sbFetch('/rest/v1/tiw_orders?select=*&order=created_at.desc', { headers });
      if (!result.ok) {
        const status = result.status === 401 || result.status === 403 ? result.status : 500;
        return res.status(status).json({ success: false, error: 'Erro ao consultar pedidos.' });
      }
      return res.status(200).json({ success: true, orders: Array.isArray(result.data) ? result.data : [] });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // PATCH: Atualizar status do pedido ou comissão (somente admin autenticado)
  if (req.method === 'PATCH') {
    const headers = adminHeaders(req);
    if (!headers) {
      return res.status(401).json({ success: false, error: 'Autenticação administrativa necessária.' });
    }
    try {
      const body = parseBody(req);
      const { order_id, status, commission_status } = body;
      if (!order_id) return res.status(400).json({ success: false, error: 'order_id obrigatório' });

      const patchData = {};
      if (status) patchData.status = status;
      if (status === 'cancelado') {
        patchData.commission_status = 'cancelado';
      } else if (commission_status) {
        patchData.commission_status = commission_status;
        if (commission_status === 'pago') {
          patchData.commission_paid_at = new Date().toISOString();
        }
      }

      if (Object.keys(patchData).length === 0) {
        return res.status(400).json({ success: false, error: 'Informe status ou commission_status.' });
      }

      const updRes = await sbFetch(`/rest/v1/tiw_orders?order_id=eq.${encodeURIComponent(order_id)}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: patchData,
      });

      if (!updRes.ok) {
        return res.status(updRes.status).json({ success: false, error: 'Erro ao atualizar pedido.' });
      }

      return res.status(200).json({ success: true, order_id, ...patchData });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // DELETE: Excluir pedido (ex.: pedido de teste — somente admin autenticado)
  if (req.method === 'DELETE') {
    const headers = adminHeaders(req);
    if (!headers) {
      return res.status(401).json({ success: false, error: 'Autenticação administrativa necessária.' });
    }
    const orderId = (req.query && req.query.order_id) || '';
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'order_id obrigatório para exclusão.' });
    }
    try {
      const delRes = await sbFetch(`/rest/v1/tiw_orders?order_id=eq.${encodeURIComponent(orderId)}`, {
        method: 'DELETE',
        headers: { ...headers, Prefer: 'return=minimal' },
      });
      if (!delRes.ok) {
        return res.status(delRes.status).json({ success: false, error: 'Erro ao excluir pedido.' });
      }
      return res.status(200).json({ success: true, deleted_order_id: orderId });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const body = parseBody(req);

    // Webhook da InfinitePay
    if (req.query && req.query.webhook === 'infinitepay') {
      const rawNsu = body.order_nsu || body.order_id || '';
      const orderNsu = String(rawNsu).match(/^(TIW-[A-Z0-9]+-[A-Z0-9]+)/i)
        ? String(rawNsu).match(/^(TIW-[A-Z0-9]+-[A-Z0-9]+)/i)[1]
        : rawNsu;
      const secretOk = !process.env.INFINITEPAY_WEBHOOK_SECRET || req.query.secret === process.env.INFINITEPAY_WEBHOOK_SECRET;
      if (orderNsu && secretOk && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          await sbFetch(`/rest/v1/tiw_orders?order_id=eq.${encodeURIComponent(orderNsu)}`, {
            method: 'PATCH',
            headers: {
              apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: { status: 'pago' },
          });
        } catch (e) {}
      }
      return res.status(200).json({
        success: true,
        received: true,
        order_nsu: orderNsu || null,
      });
    }

    const { customer, items, payment_method, coupon_code, shipping } = body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Carrinho vazio.' });
    }

    let validCoupon = null;
    if (coupon_code) {
      const check = await fetchValidCoupon(coupon_code);
      if (check.valid) {
        validCoupon = check.coupon;
      } else if (!check.setupRequired) {
        return res.status(400).json({ success: false, error: check.message || 'Cupom inválido.' });
      }
    }

    const discountPct = validCoupon ? validCoupon.discount_pct : 0;
    const commissionPct = validCoupon ? validCoupon.commission_pct : 0;

    let subtotalCents = 0;
    let totalCents = 0;

    const normalizedItems = items.map((it) => {
      const sku = String(it.sku || '');
      const parts = sku.split('_');
      const lineId = parts[1] || 'pf';
      const unitPrice = Number(LINE_PRICES[lineId] || it.price || 139.0);
      const qty = Math.max(1, Number(it.qty) || 1);
      const unitCents = Math.round(unitPrice * 100);
      const discountedUnitCents = Math.round((unitCents * (100 - discountPct)) / 100);

      subtotalCents += unitCents * qty;
      totalCents += discountedUnitCents * qty;

      return {
        sku,
        qty,
        unit_price: Number((discountedUnitCents / 100).toFixed(2)),
        original_unit_price: Number((unitCents / 100).toFixed(2)),
        discounted_unit_cents: discountedUnitCents,
        name: it.name || 'Camiseta TiwShirts',
        fit: it.fit || 'Linha Clássica 30.1',
        size: it.size || 'M',
        lead: it.lead || null,
      };
    });

    const subtotal = Number((subtotalCents / 100).toFixed(2));
    const productsTotal = Number((totalCents / 100).toFixed(2));
    const discountAmount = Number((subtotal - productsTotal).toFixed(2));

    // Validação estrita de frete no servidor (nunca confia no shipping.price enviado pelo navegador)
    let shippingAmount = 0;
    let shippingInfo = null;
    const cleanCustomerCep = String((customer && customer.cep) || '').replace(/\D/g, '');
    if (cleanCustomerCep.length === 8) {
      try {
        const serverQuote = await quoteShippingOptions({
          to_cep: cleanCustomerCep,
          items: normalizedItems,
        });
        if (serverQuote && serverQuote.success && Array.isArray(serverQuote.options) && serverQuote.options.length > 0) {
          const requestedServiceId = shipping ? Number(shipping.service_id || shipping.id) : null;
          const matched = (requestedServiceId
            ? serverQuote.options.find((opt) => Number(opt.service_id) === requestedServiceId)
            : null) || serverQuote.options[0];
          shippingAmount = Number(Number(matched.price || 0).toFixed(2));
          shippingInfo = {
            service_id: Number(matched.service_id || matched.id || 1),
            name: String(matched.name || ''),
            company: String(matched.company || 'Correios'),
            price: shippingAmount,
            delivery_days: Number(matched.delivery_days || 5),
            verified_server_side: true,
          };
        }
      } catch (e) {}
    }

    const total = Number((productsTotal + shippingAmount).toFixed(2));
    const commissionAmount = validCoupon ? Number(((productsTotal * commissionPct) / 100).toFixed(2)) : 0;
    const commissionStatus = validCoupon ? 'pendente' : 'sem_comissao';

    const ts = Date.now().toString(36).toUpperCase().slice(-4);
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    const orderId = `TIW-${ts}-${rand}`;
    const orderNsu = validCoupon ? `${orderId}-${validCoupon.code}`.slice(0, 50) : orderId;

    const pixCode = buildPixPayload({
      amount: total,
      txid: orderNsu.replace(/[^A-Z0-9]/g, ''),
    });

    const pixQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(pixCode)}`;

    const checkoutUrl = await createInfinitePayCheckout({
      orderId,
      orderNsu,
      items: normalizedItems,
      shipping: shippingInfo,
      customer,
    });

    const customerData = {
      name: (customer && customer.name) || '',
      email: (customer && customer.email) || '',
      phone: (customer && customer.phone) || '',
      cpf: (customer && customer.cpf) || '',
      address: (customer && customer.address) || '',
      cep: (customer && customer.cep) || '',
      shipping: shippingInfo,
    };

    const baseRecord = {
      order_id: orderId,
      status: 'aguardando_pagamento',
      payment_method: payment_method || 'pix',
      total,
      customer: customerData,
      items: normalizedItems,
      pix_code: pixCode,
      checkout_url: checkoutUrl,
    };

    const extendedRecord = {
      ...baseRecord,
      subtotal,
      discount_amount: discountAmount,
      coupon_code: validCoupon ? validCoupon.code : null,
      commission_pct: commissionPct,
      commission_amount: commissionAmount,
      commission_status: commissionStatus,
    };

    try {
      const insertRes = await sbFetch('/rest/v1/tiw_orders', {
        method: 'POST',
        headers: anonHeaders({ Prefer: 'return=minimal' }),
        body: extendedRecord,
      });

      // Fallback caso as novas colunas ainda não tenham sido migradas no Supabase
      if (!insertRes.ok && (insertRes.status === 400 || isMissingTableError(insertRes))) {
        await sbFetch('/rest/v1/tiw_orders', {
          method: 'POST',
          headers: anonHeaders({ Prefer: 'return=minimal' }),
          body: baseRecord,
        });
      }
    } catch (dbErr) {
      console.error('Erro ao gravar pedido no Supabase:', dbErr);
    }

    const itemsSummary = normalizedItems.map((i) => `• ${i.qty}x ${i.name} (${i.fit}, ${i.size})`).join('\n');
    const couponLine = validCoupon
      ? `\n*Cupom aplicado:* ${validCoupon.code} (-${discountPct}% · Desc. R$ ${discountAmount.toFixed(2).replace('.', ',')})`
      : '';
    const shippingLine = shippingInfo
      ? `\n*Frete (${shippingInfo.company} ${shippingInfo.name}):* R$ ${shippingAmount.toFixed(2).replace('.', ',')} (até ${shippingInfo.delivery_days} dias úteis)`
      : '';
    const waPixText = encodeURIComponent(
      `Olá TiwShirts! Acabei de gerar o pedido *${orderId}* no valor de *R$ ${total.toFixed(2).replace('.', ',')}* via Pix.${couponLine}${shippingLine}\n\n` +
        `*Cliente:* ${customerData.name}\n` +
        `*WhatsApp:* ${customerData.phone}\n` +
        `*Endereço de Entrega:* ${customerData.address}, CEP ${customerData.cep}\n\n` +
        `*Peças:*\n${itemsSummary}\n\n` +
        `Segue o comprovante de pagamento!`
    );
    const waUrl = `https://wa.me/${WHATSAPP_TIW}?text=${waPixText}`;

    return res.status(201).json({
      success: true,
      order_id: orderId,
      order_nsu: orderNsu,
      status: 'aguardando_pagamento',
      payment_method: payment_method || 'pix',
      checkout_provider: 'infinitepay',
      subtotal,
      discount_amount: discountAmount,
      shipping_amount: shippingAmount,
      shipping: shippingInfo,
      total,
      coupon_code: validCoupon ? validCoupon.code : null,
      discount_pct: discountPct,
      commission_pct: commissionPct,
      commission_amount: commissionAmount,
      pix_code: pixCode,
      pix_qr_url: pixQrUrl,
      checkout_url: checkoutUrl,
      init_point: checkoutUrl,
      wa_url: waUrl,
      customer: customerData,
      items: normalizedItems,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Erro ao criar pedido' });
  }
};
