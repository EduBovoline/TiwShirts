// Vercel Serverless Function — /api/partner-requests
// GET   -> Admin lista todas as solicitações; Parceiro lista suas solicitações + extrato dos seus cupons
// POST  -> Parceiro autenticado solicita geração de cupom 10+10
// PATCH -> Admin aprova (gera cupom 10+10 e vincula ao parceiro) ou recusa solicitação

const {
  SUPABASE_URL,
  SUPABASE_KEY,
  setCors,
  parseBody,
  adminHeaders,
  sbFetch,
  normalizeCouponCode,
  isMissingTableError,
} = require('./_supabase');

function extractBearer(req) {
  const auth = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function buildShareUrl(code) {
  const site = (process.env.PUBLIC_SITE_URL || 'https://tiwshirts.space').replace(/\/$/, '');
  return `${site}/?cupom=${encodeURIComponent(code)}`;
}

async function getAuthenticatedUser(req) {
  const token = extractBearer(req);
  if (!token) return null;
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!resp.ok) return null;
    const user = await resp.json();
    if (!user || !user.id) return null;
    const isAdmin = Boolean(user.app_metadata && user.app_metadata.role === 'admin');
    return { user, token, isAdmin };
  } catch (e) {
    return null;
  }
}

module.exports = async (req, res) => {
  setCors(res, 'GET, POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const auth = await getAuthenticatedUser(req);
  if (!auth) {
    return res.status(401).json({ success: false, error: 'Faça login para acessar a área de parceiros.' });
  }

  const userHeaders = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${auth.token}`,
    'Content-Type': 'application/json',
  };

  try {
    // ================= GET =================
    if (req.method === 'GET') {
      const scope = (req.query && req.query.scope) || (auth.isAdmin ? 'admin' : 'partner');

      if (scope === 'admin') {
        if (!auth.isAdmin) {
          return res.status(403).json({ success: false, error: 'Acesso restrito ao administrador.' });
        }
        const reqsRes = await sbFetch('/rest/v1/tiw_partner_requests?select=*&order=created_at.desc', {
          headers: userHeaders,
        });
        if (!reqsRes.ok) {
          if (isMissingTableError(reqsRes)) {
            return res.status(200).json({ success: true, setup_required: true, requests: [] });
          }
          return res.status(reqsRes.status).json({ success: false, error: 'Erro ao carregar solicitações.' });
        }
        return res.status(200).json({
          success: true,
          requests: Array.isArray(reqsRes.data) ? reqsRes.data : [],
        });
      }

      // Partner view: own requests + own approved coupons dashboard
      const [reqsRes, dashRes] = await Promise.all([
        sbFetch(`/rest/v1/tiw_partner_requests?user_id=eq.${encodeURIComponent(auth.user.id)}&select=*&order=created_at.desc`, {
          headers: userHeaders,
        }),
        sbFetch('/rest/v1/rpc/get_my_partner_dashboard', {
          method: 'POST',
          headers: userHeaders,
          body: {},
        }),
      ]);

      if (!reqsRes.ok && isMissingTableError(reqsRes)) {
        return res.status(200).json({
          success: true,
          setup_required: true,
          requests: [],
          coupons: [],
        });
      }

      const coupons = Array.isArray(dashRes.data)
        ? dashRes.data.map((c) => ({
            ...c,
            discount_pct: Number(c.discount_pct || 0),
            commission_pct: Number(c.commission_pct || 0),
            orders_total: Number(c.orders_total || 0),
            orders_paid: Number(c.orders_paid || 0),
            sales_paid: Number(c.sales_paid || 0),
            commission_pending: Number(c.commission_pending || 0),
            commission_paid: Number(c.commission_paid || 0),
            commission_awaiting_payment: Number(c.commission_awaiting_payment || 0),
            share_url: buildShareUrl(c.code),
          }))
        : [];

      return res.status(200).json({
        success: true,
        user: { id: auth.user.id, email: auth.user.email },
        requests: Array.isArray(reqsRes.data) ? reqsRes.data : [],
        coupons,
      });
    }

    // ================= POST (Partner submits request) =================
    if (req.method === 'POST') {
      const body = parseBody(req);
      const requestedCode = normalizeCouponCode(body.requested_code || body.code);
      const partnerName = String(body.partner_name || '').trim();
      const instagram = String(body.instagram || '').trim();
      const whatsapp = String(body.whatsapp || '').trim();
      const pixKey = String(body.pix_key || '').trim();
      const notes = String(body.notes || '').trim();

      if (!requestedCode || requestedCode.length < 3) {
        return res.status(400).json({ success: false, error: 'Escolha um código de cupom com pelo menos 3 caracteres (letras e números).' });
      }
      if (!partnerName) {
        return res.status(400).json({ success: false, error: 'Informe seu nome ou nome da sua marca/perfil.' });
      }
      if (!whatsapp || !pixKey) {
        return res.status(400).json({ success: false, error: 'WhatsApp e chave Pix são obrigatórios para receber suas comissões.' });
      }

      // Check if code already exists in active coupons
      const checkRes = await sbFetch(`/rest/v1/tiw_coupons?code=eq.${encodeURIComponent(requestedCode)}&select=code&limit=1`, {
        headers: { apikey: SUPABASE_KEY },
      });
      if (checkRes.ok && Array.isArray(checkRes.data) && checkRes.data.length > 0) {
        return res.status(409).json({
          success: false,
          error: `O código ${requestedCode} já está em uso. Escolha outra variação (ex.: ${requestedCode}10).`,
        });
      }

      const insertRes = await sbFetch('/rest/v1/tiw_partner_requests', {
        method: 'POST',
        headers: { ...userHeaders, Prefer: 'return=representation' },
        body: {
          user_id: auth.user.id,
          email: auth.user.email,
          partner_name: partnerName,
          requested_code: requestedCode,
          instagram: instagram || null,
          whatsapp,
          pix_key: pixKey,
          notes: notes || null,
          status: 'pendente',
        },
      });

      if (!insertRes.ok) {
        if (isMissingTableError(insertRes)) {
          return res.status(503).json({ success: false, setup_required: true, error: 'Portal de parceiros ainda não inicializado no banco.' });
        }
        return res.status(insertRes.status).json({ success: false, error: 'Não foi possível enviar a solicitação.' });
      }

      const created = Array.isArray(insertRes.data) ? insertRes.data[0] : insertRes.data;
      return res.status(201).json({ success: true, request: created });
    }

    // ================= PATCH (Admin approves or rejects) =================
    if (req.method === 'PATCH') {
      if (!auth.isAdmin) {
        return res.status(403).json({ success: false, error: 'Apenas o administrador pode aprovar ou recusar solicitações.' });
      }
      const headers = adminHeaders(req);
      const body = parseBody(req);
      const requestId = Number(body.id);
      const action = String(body.action || '').trim().toLowerCase();

      if (!requestId || !['approve', 'reject'].includes(action)) {
        return res.status(400).json({ success: false, error: 'Informe id e action (approve ou reject).' });
      }

      const reqRes = await sbFetch(`/rest/v1/tiw_partner_requests?id=eq.${requestId}&select=*&limit=1`, { headers });
      const pr = reqRes.ok && Array.isArray(reqRes.data) ? reqRes.data[0] : null;
      if (!pr) {
        return res.status(404).json({ success: false, error: 'Solicitação não encontrada.' });
      }

      if (action === 'reject') {
        const updRes = await sbFetch(`/rest/v1/tiw_partner_requests?id=eq.${requestId}`, {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: {
            status: 'recusado',
            admin_notes: String(body.admin_notes || '').trim() || null,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        });
        if (!updRes.ok) {
          return res.status(updRes.status).json({ success: false, error: 'Erro ao recusar solicitação.' });
        }
        return res.status(200).json({ success: true, id: requestId, status: 'recusado' });
      }

      // action === 'approve'
      const code = normalizeCouponCode(body.code || pr.requested_code);
      const discountPct = Number(body.discount_pct ?? 10);
      const commissionPct = Number(body.commission_pct ?? 10);

      const couponRes = await sbFetch('/rest/v1/tiw_coupons', {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: {
          code,
          partner_name: pr.partner_name,
          discount_pct: discountPct,
          commission_pct: commissionPct,
          active: true,
        },
      });

      if (!couponRes.ok) {
        const msg = couponRes.status === 409
          ? `Já existe um cupom com o código ${code}. Escolha outro código ao aprovar.`
          : 'Não foi possível gerar o cupom.';
        return res.status(couponRes.status === 409 ? 409 : 400).json({ success: false, error: msg });
      }

      const createdCoupon = Array.isArray(couponRes.data) ? couponRes.data[0] : couponRes.data;
      const partnerNotes = [pr.instagram, pr.notes].filter(Boolean).join(' · ');

      if (createdCoupon && createdCoupon.id) {
        await sbFetch('/rest/v1/tiw_coupon_partners', {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: {
            coupon_id: createdCoupon.id,
            user_id: pr.user_id,
            partner_phone: pr.whatsapp || null,
            partner_pix: pr.pix_key || null,
            notes: partnerNotes || null,
            updated_at: new Date().toISOString(),
          },
        });
      }

      await sbFetch(`/rest/v1/tiw_partner_requests?id=eq.${requestId}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: {
          status: 'aprovado',
          coupon_id: createdCoupon ? createdCoupon.id : null,
          admin_notes: String(body.admin_notes || '').trim() || `Cupom ${code} aprovado (${discountPct}% OFF + ${commissionPct}% comissão).`,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });

      return res.status(200).json({
        success: true,
        id: requestId,
        status: 'aprovado',
        coupon: {
          ...createdCoupon,
          partner_phone: pr.whatsapp,
          partner_pix: pr.pix_key,
          share_url: buildShareUrl(code),
        },
      });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Erro interno no portal de parceiros.' });
  }
};
