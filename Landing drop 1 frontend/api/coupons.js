// Vercel Serverless Function — /api/coupons
// GET ?code=XXXX -> Validação pública de cupom no checkout
// GET / POST / PATCH / DELETE (Authorization: Bearer <admin_jwt>) -> Gestão completa de afiliados

const {
  WHATSAPP_TIW,
  setCors,
  adminHeaders,
  parseBody,
  sbFetch,
  isMissingTableError,
  normalizeCouponCode,
  fetchValidCoupon,
} = require('./_supabase');

function buildShareUrl(code) {
  return `https://tiwshirts.space/?cupom=${encodeURIComponent(code)}`;
}

async function handlePublicValidation(res, codeParam) {
  const result = await fetchValidCoupon(codeParam);
  if (result.setupRequired) {
    return res.status(503).json({
      success: false,
      setup_required: true,
      valid: false,
      error: result.message,
    });
  }
  if (!result.valid) {
    return res.status(200).json({
      success: true,
      valid: false,
      message: result.message,
    });
  }
  return res.status(200).json({
    success: true,
    valid: true,
    coupon: {
      code: result.coupon.code,
      partner_name: result.coupon.partner_name,
      discount_pct: result.coupon.discount_pct,
      commission_pct: result.coupon.commission_pct,
    },
  });
}

async function handleAdminList(res, headers) {
  const [couponsRes, partnersRes, ordersRes] = await Promise.all([
    sbFetch('/rest/v1/tiw_coupons?select=*&order=created_at.desc', { headers }),
    sbFetch('/rest/v1/tiw_coupon_partners?select=*', { headers }),
    sbFetch('/rest/v1/tiw_orders?coupon_code=not.is.null&select=order_id,coupon_code,status,total,commission_amount,commission_status,created_at', { headers }),
  ]);

  if (!couponsRes.ok) {
    if (isMissingTableError(couponsRes)) {
      return res.status(200).json({ success: true, setup_required: true, coupons: [] });
    }
    const status = couponsRes.status === 401 || couponsRes.status === 403 ? couponsRes.status : 500;
    return res.status(status).json({ success: false, error: 'Acesso negado ou erro ao consultar cupons.' });
  }

  const coupons = Array.isArray(couponsRes.data) ? couponsRes.data : [];
  const partners = Array.isArray(partnersRes.data) ? partnersRes.data : [];
  const orders = Array.isArray(ordersRes.data) ? ordersRes.data : [];

  const partnerMap = new Map();
  for (const p of partners) partnerMap.set(p.coupon_id, p);

  const metricsMap = new Map();
  for (const ord of orders) {
    const code = normalizeCouponCode(ord.coupon_code);
    if (!code) continue;
    if (!metricsMap.has(code)) {
      metricsMap.set(code, {
        orders_total: 0,
        orders_paid: 0,
        sales_total: 0,
        sales_paid: 0,
        commission_pending: 0,
        commission_paid: 0,
        commission_awaiting_payment: 0,
      });
    }
    const m = metricsMap.get(code);
    const total = Number(ord.total || 0);
    const comm = Number(ord.commission_amount || 0);
    const isCancelled = ord.status === 'cancelado' || ord.commission_status === 'cancelado';
    const isOrderPaid = ord.status === 'pago' || ord.status === 'enviado';

    m.orders_total += 1;
    if (!isCancelled) {
      m.sales_total += total;
    }
    if (isOrderPaid && !isCancelled) {
      m.orders_paid += 1;
      m.sales_paid += total;
      if (ord.commission_status === 'pago') {
        m.commission_paid += comm;
      } else {
        m.commission_pending += comm;
      }
    } else if (!isCancelled && ord.commission_status === 'pendente') {
      m.commission_awaiting_payment += comm;
    }
  }

  const enriched = coupons.map((c) => {
    const partner = partnerMap.get(c.id) || {};
    const m = metricsMap.get(c.code) || {
      orders_total: 0,
      orders_paid: 0,
      sales_total: 0,
      sales_paid: 0,
      commission_pending: 0,
      commission_paid: 0,
      commission_awaiting_payment: 0,
    };
    return {
      id: c.id,
      code: c.code,
      partner_name: c.partner_name,
      discount_pct: Number(c.discount_pct || 0),
      commission_pct: Number(c.commission_pct || 0),
      active: Boolean(c.active),
      max_uses: c.max_uses,
      uses_count: Number(c.uses_count || 0),
      expires_at: c.expires_at,
      created_at: c.created_at,
      partner_phone: partner.partner_phone || '',
      partner_pix: partner.partner_pix || '',
      notes: partner.notes || '',
      share_url: buildShareUrl(c.code),
      orders_total: m.orders_total,
      orders_paid: m.orders_paid,
      sales_total: Number(m.sales_total.toFixed(2)),
      sales_paid: Number(m.sales_paid.toFixed(2)),
      commission_pending: Number(m.commission_pending.toFixed(2)),
      commission_paid: Number(m.commission_paid.toFixed(2)),
      commission_awaiting_payment: Number(m.commission_awaiting_payment.toFixed(2)),
    };
  });

  return res.status(200).json({ success: true, coupons: enriched, whatsapp_tiw: WHATSAPP_TIW });
}

async function handleAdminCreate(res, headers, body) {
  const code = normalizeCouponCode(body.code);
  const partnerName = String(body.partner_name || '').trim();
  const discountPct = body.discount_pct !== undefined && body.discount_pct !== '' ? Number(body.discount_pct) : 10;
  const commissionPct = body.commission_pct !== undefined && body.commission_pct !== '' ? Number(body.commission_pct) : 10;
  const maxUses = body.max_uses !== undefined && body.max_uses !== '' && body.max_uses !== null ? Number(body.max_uses) : null;
  const expiresAt = body.expires_at ? new Date(body.expires_at).toISOString() : null;

  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    return res.status(400).json({ success: false, error: 'Código deve ter 3 a 32 caracteres (A-Z, 0-9, _ ou -).' });
  }
  if (!partnerName) {
    return res.status(400).json({ success: false, error: 'Nome do parceiro é obrigatório.' });
  }
  if (Number.isNaN(discountPct) || discountPct < 0 || discountPct > 50) {
    return res.status(400).json({ success: false, error: 'Desconto deve ficar entre 0% e 50%.' });
  }
  if (Number.isNaN(commissionPct) || commissionPct < 0 || commissionPct > 50) {
    return res.status(400).json({ success: false, error: 'Comissão deve ficar entre 0% e 50%.' });
  }

  const couponRes = await sbFetch('/rest/v1/tiw_coupons', {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: {
      code,
      partner_name: partnerName,
      discount_pct: discountPct,
      commission_pct: commissionPct,
      active: body.active !== undefined ? Boolean(body.active) : true,
      max_uses: maxUses,
      expires_at: expiresAt,
    },
  });

  if (!couponRes.ok) {
    const status = couponRes.status === 409 ? 409 : (couponRes.status === 401 || couponRes.status === 403 ? couponRes.status : 400);
    const errMsg = status === 409 ? `Já existe um cupom com o código ${code}.` : 'Não foi possível criar o cupom.';
    return res.status(status).json({ success: false, error: errMsg, details: couponRes.data });
  }

  const created = Array.isArray(couponRes.data) ? couponRes.data[0] : couponRes.data;

  const partnerPhone = String(body.partner_phone || '').trim();
  const partnerPix = String(body.partner_pix || '').trim();
  const notes = String(body.notes || '').trim();

  if (created && created.id && (partnerPhone || partnerPix || notes)) {
    await sbFetch('/rest/v1/tiw_coupon_partners', {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: {
        coupon_id: created.id,
        partner_phone: partnerPhone || null,
        partner_pix: partnerPix || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      },
    });
  }

  return res.status(201).json({
    success: true,
    coupon: {
      ...created,
      partner_phone: partnerPhone,
      partner_pix: partnerPix,
      notes,
      share_url: buildShareUrl(code),
    },
    share_url: buildShareUrl(code),
  });
}

async function handleAdminPatch(res, headers, body) {
  if (body.action === 'settle_commissions') {
    const code = normalizeCouponCode(body.coupon_code);
    if (!code) {
      return res.status(400).json({ success: false, error: 'coupon_code obrigatório para quitar comissões.' });
    }
    const settleRes = await sbFetch(
      `/rest/v1/tiw_orders?coupon_code=eq.${encodeURIComponent(code)}&status=in.(pago,enviado)&commission_status=eq.pendente`,
      {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: {
          commission_status: 'pago',
          commission_paid_at: new Date().toISOString(),
        },
      }
    );
    if (!settleRes.ok) {
      return res.status(settleRes.status).json({ success: false, error: 'Erro ao quitar comissões.' });
    }
    const settledCount = Array.isArray(settleRes.data) ? settleRes.data.length : 0;
    return res.status(200).json({ success: true, coupon_code: code, settled_count: settledCount });
  }

  const couponId = Number(body.id);
  if (!couponId) {
    return res.status(400).json({ success: false, error: 'id do cupom é obrigatório.' });
  }

  const patchFields = {};
  if (body.active !== undefined) patchFields.active = Boolean(body.active);
  if (body.partner_name !== undefined) patchFields.partner_name = String(body.partner_name).trim();
  if (body.discount_pct !== undefined) patchFields.discount_pct = Number(body.discount_pct);
  if (body.commission_pct !== undefined) patchFields.commission_pct = Number(body.commission_pct);
  if (body.max_uses !== undefined) patchFields.max_uses = body.max_uses === '' || body.max_uses === null ? null : Number(body.max_uses);
  if (body.expires_at !== undefined) patchFields.expires_at = body.expires_at ? new Date(body.expires_at).toISOString() : null;

  if (Object.keys(patchFields).length > 0) {
    const updRes = await sbFetch(`/rest/v1/tiw_coupons?id=eq.${couponId}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: patchFields,
    });
    if (!updRes.ok) {
      return res.status(updRes.status).json({ success: false, error: 'Erro ao atualizar cupom.' });
    }
  }

  if (body.partner_phone !== undefined || body.partner_pix !== undefined || body.notes !== undefined) {
    await sbFetch('/rest/v1/tiw_coupon_partners', {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: {
        coupon_id: couponId,
        partner_phone: body.partner_phone !== undefined ? String(body.partner_phone || '').trim() || null : undefined,
        partner_pix: body.partner_pix !== undefined ? String(body.partner_pix || '').trim() || null : undefined,
        notes: body.notes !== undefined ? String(body.notes || '').trim() || null : undefined,
        updated_at: new Date().toISOString(),
      },
    });
  }

  return res.status(200).json({ success: true, id: couponId });
}

async function handleAdminDelete(res, headers, idParam) {
  const couponId = Number(idParam);
  if (!couponId) {
    return res.status(400).json({ success: false, error: 'id inválido para exclusão.' });
  }
  const delRes = await sbFetch(`/rest/v1/tiw_coupons?id=eq.${couponId}`, {
    method: 'DELETE',
    headers: { ...headers, Prefer: 'return=minimal' },
  });
  if (!delRes.ok) {
    return res.status(delRes.status).json({ success: false, error: 'Erro ao excluir cupom.' });
  }
  return res.status(200).json({ success: true, deleted_id: couponId });
}

module.exports = async (req, res) => {
  setCors(res, 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET' && req.query && req.query.code) {
      return await handlePublicValidation(res, req.query.code);
    }

    const headers = adminHeaders(req);
    if (!headers) {
      return res.status(401).json({ success: false, error: 'Autenticação administrativa necessária.' });
    }

    if (req.method === 'GET') {
      return await handleAdminList(res, headers);
    }

    const body = parseBody(req);
    if (req.method === 'POST') {
      return await handleAdminCreate(res, headers, body);
    }
    if (req.method === 'PATCH') {
      return await handleAdminPatch(res, headers, body);
    }
    if (req.method === 'DELETE') {
      const id = (req.query && req.query.id) || body.id;
      return await handleAdminDelete(res, headers, id);
    }

    return res.status(405).json({ success: false, error: 'Método não permitido.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Erro interno em /api/coupons.' });
  }
};
