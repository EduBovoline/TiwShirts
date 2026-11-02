// Vercel Serverless Function — POST /api/orders
// Processa checkout nativo na loja (sem redirecionar para WhatsApp),
// gera código Pix EMV (Copia e Cola + QR Code) e preferência Mercado Pago (se configurado).

const LINE_PRICES = {
  pf: 139.0,
  casca: 179.0,
  espacoso: 179.0,
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

  let payload =
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { customer, items, payment_method } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Carrinho vazio.' });
    }

    let total = 0;
    const normalizedItems = items.map((it) => {
      const sku = String(it.sku || '');
      const parts = sku.split('_');
      const lineId = parts[1] || 'pf';
      const unitPrice = Number(it.price) || LINE_PRICES[lineId] || 139.0;
      const qty = Math.max(1, Number(it.qty) || 1);
      total += unitPrice * qty;
      return {
        sku,
        qty,
        unit_price: unitPrice,
        name: it.name || 'Camiseta TiwShirts',
        fit: it.fit || 'Linha Clássica 30.1',
        size: it.size || 'M',
      };
    });

    const ts = Date.now().toString(36).toUpperCase().slice(-4);
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    const orderId = `TIW-${ts}-${rand}`;

    const pixCode = buildPixPayload({
      amount: total,
      txid: orderId.replace(/[^A-Z0-9]/g, ''),
    });

    const pixQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(pixCode)}`;

    let mpInitPoint = null;
    if (process.env.MP_ACCESS_TOKEN) {
      try {
        const mpItems = normalizedItems.map((it) => ({
          id: it.sku,
          title: `Camiseta TiwShirts · ${it.fit} · Tam ${it.size}`,
          quantity: it.qty,
          unit_price: Number(it.unit_price),
          currency_id: 'BRL',
        }));
        const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: mpItems,
            payer: {
              name: (customer && customer.name) || 'Cliente TiwShirts',
              email: (customer && customer.email) || undefined,
            },
            external_reference: orderId,
            back_urls: {
              success: `https://tiwshirts.space/?pedido=${orderId}&status=pago`,
              pending: `https://tiwshirts.space/?pedido=${orderId}&status=pendente`,
              failure: `https://tiwshirts.space/?pedido=${orderId}&status=falha`,
            },
            auto_return: 'approved',
          }),
        });
        const mpData = await mpRes.json();
        if (mpData && mpData.init_point) mpInitPoint = mpData.init_point;
      } catch (e) {
        // Segue com Pix nativo na tela
      }
    }

    return res.status(201).json({
      success: true,
      order_id: orderId,
      status: 'aguardando_pagamento',
      payment_method: payment_method || 'pix',
      total,
      pix_code: pixCode,
      pix_qr_url: pixQrUrl,
      init_point: mpInitPoint,
      customer: {
        name: (customer && customer.name) || '',
        email: (customer && customer.email) || '',
        phone: (customer && customer.phone) || '',
        address: (customer && customer.address) || '',
        cep: (customer && customer.cep) || '',
      },
      items: normalizedItems,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Erro ao criar pedido' });
  }
};
