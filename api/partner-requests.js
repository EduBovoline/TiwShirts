// Vercel Serverless Function — /api/partner-requests
// Módulo Completo de Afiliados & Parceiros (10+10 / Creator 10+12 / Embaixador 10+15)
// - Público (sem parede de login!):
//     GET  ?check_code=XXXX    -> Valida disponibilidade de código em tempo real
//     GET  ?invite_token=XXXX  -> Valida convite VIP enviado pela TiwShirts
//     POST { action: 'public_apply' } -> Registra candidatura na hora sem perder dados + dispara alerta
// - Parceiro Autenticado (/parceiros):
//     GET  ?scope=partner      -> Dashboard completo + Extrato pedido a pedido + Histórico de saques Pix
//     POST { action: 'request_payout' } -> Solicita saque Pix das comissões liberadas
//     POST (default)           -> Solicita novo cupom adicional
// - Gestor de Parceiros / Admin (/admin):
//     GET  ?scope=admin        -> Solicitações + Convites VIP + Pedidos de Saque Pix
//     POST { action: 'create_invite' } -> Gera Link de Convite VIP 1-Clique
//     PATCH { action: 'approve' | 'reject' | 'pay_payout' } -> Aprova cupom / Paga saque + dispara comunicação automática

const {
  SUPABASE_URL,
  SUPABASE_KEY,
  setCors,
  anonHeaders,
  serviceOrAnonHeaders,
  getStaffContext,
  parseBody,
  sbFetch,
  normalizeCouponCode,
  isMissingTableError,
} = require('./_supabase');
const { dispatchCommEvent } = require('./_comms');

function extractBearer(req) {
  const auth = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function buildShareUrl(code) {
  const site = (process.env.PUBLIC_SITE_URL || 'https://tiwshirts.space').replace(/\/$/, '');
  return `${site}/?cupom=${encodeURIComponent(code)}`;
}

const TIER_PRESETS = {
  '10_10': { discount_pct: 10, commission_pct: 10, label: 'Parceiro 10+10' },
  '10_12': { discount_pct: 10, commission_pct: 12, label: 'Creator 10+12' },
  '10_15': { discount_pct: 10, commission_pct: 15, label: 'Embaixador 10+15' },
};

async function getAuthenticatedUser(req) {
  const token = extractBearer(req);
  if (!token) return null;
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    const user = await resp.json();
    if (!user || !user.id) return null;
    const emailVerified = Boolean(
      user.email_confirmed_at ||
      user.confirmed_at ||
      (user.user_metadata && user.user_metadata.email_verified)
    );
    return { user, token, email: String(user.email || '').toLowerCase().trim(), emailVerified };
  } catch {
    return null;
  }
}

async function isCodeTaken(code) {
  const [cpRes, rqRes] = await Promise.all([
    sbFetch(`/rest/v1/tiw_coupons?code=eq.${encodeURIComponent(code)}&select=code&limit=1`, { headers: anonHeaders() }),
    sbFetch(`/rest/v1/tiw_partner_requests?requested_code=eq.${encodeURIComponent(code)}&status=eq.pendente&select=id&limit=1`, {
      headers: serviceOrAnonHeaders(),
    }),
  ]);
  const inCoupons = cpRes.ok && Array.isArray(cpRes.data) && cpRes.data.length > 0;
  const inPending = rqRes.ok && Array.isArray(rqRes.data) && rqRes.data.length > 0;
  return { inCoupons, inPending, taken: inCoupons || inPending };
}

module.exports = async (req, res) => {
  setCors(res, 'GET, POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // =========================================================================
    // 1. ROTAS PÚBLICAS DE ZERO FRICÇÃO (check_code, invite_token, public_apply)
    // =========================================================================
    if (req.method === 'GET' && req.query && req.query.check_code) {
      const code = normalizeCouponCode(req.query.check_code);
      if (!code || code.length < 3) {
        return res.status(200).json({ success: true, available: false, reason: 'Use pelo menos 3 letras ou números.' });
      }
      const status = await isCodeTaken(code);
      const suggestions = status.taken ? [`${code}10`, `${code}TIW`, `SOU${code}`].slice(0, 3) : [];
      return res.status(200).json({
        success: true,
        code,
        available: !status.taken,
        suggestions,
        reason: status.taken ? `O código ${code} já está reservado.` : `Código ${code} disponível!`,
      });
    }

    if (req.method === 'GET' && req.query && req.query.invite_token) {
      const tok = String(req.query.invite_token || '').trim();
      const invRes = await sbFetch(
        `/rest/v1/tiw_partner_invites?token=eq.${encodeURIComponent(tok)}&used_at=is.null&select=*&limit=1`,
        { headers: anonHeaders() }
      );
      const inv = invRes.ok && Array.isArray(invRes.data) ? invRes.data[0] : null;
      if (!inv) {
        return res.status(404).json({ success: false, error: 'Convite inválido ou já utilizado.' });
      }
      return res.status(200).json({ success: true, invite: inv });
    }

    const body = req.method === 'GET' ? {} : parseBody(req);

    if (req.method === 'POST' && body.action === 'public_apply') {
      if (body.website_hp) {
        return res.status(200).json({ success: true, protocol: 'AF-OK' });
      }
      const email = String(body.email || '').toLowerCase().trim();
      const partnerName = String(body.partner_name || '').trim();
      const requestedCode = normalizeCouponCode(body.requested_code || body.code);
      const instagram = String(body.instagram || '').trim();
      const whatsapp = String(body.whatsapp || '').trim();
      const pixKey = String(body.pix_key || '').trim();
      const notes = String(body.notes || '').trim();
      const audienceChannel = String(body.audience_channel || 'instagram').trim();
      const inviteToken = String(body.invite_token || '').trim();

      if (!email || !email.includes('@')) {
        return res.status(400).json({ success: false, error: 'Informe um e-mail válido para acompanhar suas comissões.' });
      }
      if (!requestedCode || requestedCode.length < 3) {
        return res.status(400).json({ success: false, error: 'Escolha um código de cupom com pelo menos 3 caracteres.' });
      }
      if (!partnerName || !whatsapp || !pixKey) {
        return res.status(400).json({ success: false, error: 'Preencha nome, WhatsApp e chave Pix para receber suas comissões.' });
      }

      const cpCheck = await sbFetch(`/rest/v1/tiw_coupons?code=eq.${encodeURIComponent(requestedCode)}&select=code&limit=1`, {
        headers: anonHeaders(),
      });
      if (cpCheck.ok && Array.isArray(cpCheck.data) && cpCheck.data.length > 0) {
        return res.status(409).json({
          success: false,
          error: `O código ${requestedCode} já está ativo. Tente ${requestedCode}10 ou outra combinação.`,
        });
      }

      // Verifica se veio de um Convite VIP válido
      let inviteRow = null;
      if (inviteToken) {
        const invRes = await sbFetch(
          `/rest/v1/tiw_partner_invites?token=eq.${encodeURIComponent(inviteToken)}&used_at=is.null&select=*&limit=1`,
          { headers: anonHeaders() }
        );
        if (invRes.ok && Array.isArray(invRes.data) && invRes.data[0]) {
          inviteRow = invRes.data[0];
        }
      }

      const authUser = await getAuthenticatedUser(req);
      const tier = inviteRow ? inviteRow.tier || '10_10' : '10_10';

      const basePayload = {
        user_id: authUser ? authUser.user.id : null,
        email,
        partner_name: partnerName,
        requested_code: requestedCode,
        instagram: instagram || null,
        whatsapp,
        pix_key: pixKey,
        notes: [inviteRow ? `[CONVITE VIP ${inviteToken}]` : '', notes].filter(Boolean).join(' ') || null,
        status: 'pendente',
      };

      const extendedPayload = {
        ...basePayload,
        tier,
        invite_token: inviteToken || null,
        audience_channel: audienceChannel,
      };

      let insRes = await sbFetch('/rest/v1/tiw_partner_requests', {
        method: 'POST',
        headers: { ...(authUser ? { apikey: SUPABASE_KEY, Authorization: `Bearer ${authUser.token}`, 'Content-Type': 'application/json' } : anonHeaders()), Prefer: 'return=representation' },
        body: extendedPayload,
      });

      if (!insRes.ok && (insRes.status === 400 || isMissingTableError(insRes))) {
        insRes = await sbFetch('/rest/v1/tiw_partner_requests', {
          method: 'POST',
          headers: { ...(authUser ? { apikey: SUPABASE_KEY, Authorization: `Bearer ${authUser.token}`, 'Content-Type': 'application/json' } : anonHeaders()), Prefer: 'return=representation' },
          body: basePayload,
        });
      }

      const savedRow = insRes.ok && Array.isArray(insRes.data) ? insRes.data[0] : null;

      // Se houver SERVICE_ROLE_KEY e Convite VIP com auto_approve, já ativa o cupom na hora!
      let autoActivatedCoupon = null;
      if (inviteRow && inviteRow.auto_approve && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const svcHeaders = serviceOrAnonHeaders({ Prefer: 'return=representation' });
        const cpCreate = await sbFetch('/rest/v1/tiw_coupons', {
          method: 'POST',
          headers: svcHeaders,
          body: {
            code: requestedCode,
            partner_name: partnerName,
            discount_pct: Number(inviteRow.discount_pct || 10),
            commission_pct: Number(inviteRow.commission_pct || 10),
            active: true,
          },
        });
        if (cpCreate.ok && Array.isArray(cpCreate.data) && cpCreate.data[0]) {
          autoActivatedCoupon = cpCreate.data[0];
          await sbFetch('/rest/v1/tiw_coupon_partners', {
            method: 'POST',
            headers: serviceOrAnonHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
            body: {
              coupon_id: autoActivatedCoupon.id,
              user_id: authUser ? authUser.user.id : null,
              partner_email: email,
              partner_phone: whatsapp,
              partner_pix: pixKey,
              tier,
              notes: instagram || null,
            },
          });
          await sbFetch(`/rest/v1/tiw_partner_invites?id=eq.${encodeURIComponent(inviteRow.id)}`, {
            method: 'PATCH',
            headers: serviceOrAnonHeaders({ Prefer: 'return=minimal' }),
            body: { used_at: new Date().toISOString(), used_by_email: email, coupon_id: autoActivatedCoupon.id },
          });
          if (savedRow && savedRow.id) {
            await sbFetch(`/rest/v1/tiw_partner_requests?id=eq.${savedRow.id}`, {
              method: 'PATCH',
              headers: serviceOrAnonHeaders({ Prefer: 'return=minimal' }),
              body: { status: 'aprovado', coupon_id: autoActivatedCoupon.id, reviewed_at: new Date().toISOString() },
            });
          }
        }
      }

      const comm = await dispatchCommEvent(
        autoActivatedCoupon ? 'affiliate.approved' : 'affiliate.applied',
        {
          subject: autoActivatedCoupon
            ? `Cupom ${requestedCode} ativado via Convite VIP!`
            : `Nova candidatura de afiliado: ${requestedCode} (${partnerName})`,
          staffSummary: `${autoActivatedCoupon ? '★ CONVITE VIP ATIVADO' : '📩 NOVA CANDIDATURA AFILIADO'}: *${requestedCode}* · ${partnerName} (${email} · Zap: ${whatsapp})`,
          recipientPhone: whatsapp,
          recipientEmail: email,
          vars: {
            name: partnerName,
            code: requestedCode,
            discount_pct: inviteRow ? inviteRow.discount_pct : 10,
            commission_pct: inviteRow ? inviteRow.commission_pct : 10,
            share_url: buildShareUrl(requestedCode),
            action_url: 'https://tiwshirts.space/parceiros',
          },
        }
      );

      return res.status(201).json({
        success: true,
        saved_in_db: Boolean(savedRow),
        auto_activated: Boolean(autoActivatedCoupon),
        code: requestedCode,
        share_url: buildShareUrl(requestedCode),
        request: savedRow,
        wa_notify_manager: `https://wa.me/5515981512083?text=${encodeURIComponent(
          `Fala TiwShirts! Acabei de enviar meu cadastro de parceiro 10+10 com o código *${requestedCode}* (${partnerName} · ${email}).`
        )}`,
        comm_wa_url: comm.wa_url,
      });
    }

    // =========================================================================
    // 2. AUTENTICAÇÃO (PARCEIRO OU GESTOR DE PARCEIROS / ADMIN)
    // =========================================================================
    const [auth, staff] = await Promise.all([getAuthenticatedUser(req), getStaffContext(req)]);
    const isPartnerManager = Boolean(staff && ['admin', 'gestor_parceiros'].includes(staff.role));

    if (!auth && !isPartnerManager) {
      return res.status(401).json({ success: false, error: 'Faça login para acessar seu painel de parceiro.' });
    }

    const userHeaders = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${(auth && auth.token) || (staff && staff.token)}`,
      'Content-Type': 'application/json',
    };

    // ================= GET =================
    if (req.method === 'GET') {
      const scope = (req.query && req.query.scope) || (isPartnerManager ? 'admin' : 'partner');

      if (scope === 'admin') {
        if (!isPartnerManager) {
          return res.status(403).json({ success: false, error: 'Acesso restrito ao Gestor de Parceiros ou Admin.' });
        }
        const [reqsRes, invsRes, payRes] = await Promise.all([
          sbFetch('/rest/v1/tiw_partner_requests?select=*&order=created_at.desc', { headers: userHeaders }),
          sbFetch('/rest/v1/tiw_partner_invites?select=*&order=created_at.desc&limit=50', { headers: userHeaders }),
          sbFetch('/rest/v1/tiw_payout_requests?select=*&order=created_at.desc&limit=50', { headers: userHeaders }),
        ]);

        return res.status(200).json({
          success: true,
          setup_required: !reqsRes.ok && isMissingTableError(reqsRes),
          requests: reqsRes.ok && Array.isArray(reqsRes.data) ? reqsRes.data : [],
          invites: invsRes.ok && Array.isArray(invsRes.data) ? invsRes.data : [],
          payouts: payRes.ok && Array.isArray(payRes.data) ? payRes.data : [],
        });
      }

      // Partner View: busca solicitações (por user_id ou email), dashboard de cupons, extrato de pedidos e saques Pix!
      const [reqsRes, dashRes, ordRes, payRes] = await Promise.all([
        sbFetch('/rest/v1/tiw_partner_requests?select=*&order=created_at.desc', { headers: userHeaders }),
        sbFetch('/rest/v1/rpc/get_my_partner_dashboard', { method: 'POST', headers: userHeaders, body: {} }),
        sbFetch('/rest/v1/rpc/get_my_partner_orders', { method: 'POST', headers: userHeaders, body: {} }),
        sbFetch('/rest/v1/tiw_payout_requests?select=*&order=created_at.desc', { headers: userHeaders }),
      ]);

      // Auto-cria solicitação a partir do user_metadata se ainda não existir nenhuma
      let requests = reqsRes.ok && Array.isArray(reqsRes.data) ? reqsRes.data : [];
      const meta = (auth && auth.user && auth.user.user_metadata) || {};
      const metaCode = normalizeCouponCode(meta.requested_code);
      if (requests.length === 0 && metaCode && metaCode.length >= 3 && meta.partner_name && meta.whatsapp && meta.pix_key) {
        const autoIns = await sbFetch('/rest/v1/tiw_partner_requests', {
          method: 'POST',
          headers: { ...userHeaders, Prefer: 'return=representation' },
          body: {
            user_id: auth.user.id,
            email: auth.email,
            partner_name: String(meta.partner_name).trim(),
            requested_code: metaCode,
            instagram: meta.instagram ? String(meta.instagram).trim() : null,
            whatsapp: String(meta.whatsapp).trim(),
            pix_key: String(meta.pix_key).trim(),
            notes: meta.notes ? String(meta.notes).trim() : null,
            status: 'pendente',
          },
        });
        if (autoIns.ok && Array.isArray(autoIns.data)) requests = autoIns.data;
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
        user: { id: auth.user.id, email: auth.email },
        requests,
        coupons,
        orders: ordRes.ok && Array.isArray(ordRes.data) ? ordRes.data : [],
        payouts: payRes.ok && Array.isArray(payRes.data) ? payRes.data : [],
      });
    }

    // ================= POST (Create VIP Invite, Request Payout, or Partner New Coupon) =================
    if (req.method === 'POST') {
      // Gestor de Parceiros cria Link de Convite VIP
      if (body.action === 'create_invite') {
        if (!isPartnerManager) {
          return res.status(403).json({ success: false, error: 'Apenas o Gestor de Parceiros ou Admin pode gerar convites VIP.' });
        }
        const tierKey = TIER_PRESETS[body.tier] ? body.tier : '10_10';
        const preset = TIER_PRESETS[tierKey];
        const token = 'VIP-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + Date.now().toString(36).toUpperCase().slice(-4);
        const suggestedCode = body.suggested_code ? normalizeCouponCode(body.suggested_code) : null;

        const invRes = await sbFetch('/rest/v1/tiw_partner_invites', {
          method: 'POST',
          headers: { ...userHeaders, Prefer: 'return=representation' },
          body: {
            token,
            suggested_code: suggestedCode,
            partner_name: String(body.partner_name || '').trim(),
            partner_email: String(body.partner_email || '').toLowerCase().trim(),
            partner_whatsapp: String(body.partner_whatsapp || '').trim(),
            discount_pct: Number(body.discount_pct ?? preset.discount_pct),
            commission_pct: Number(body.commission_pct ?? preset.commission_pct),
            tier: tierKey,
            auto_approve: body.auto_approve !== false,
          },
        });

        if (!invRes.ok) {
          if (isMissingTableError(invRes)) {
            return res.status(503).json({
              success: false,
              setup_required: true,
              error: 'Rode supabase_erp_afiliados_comms.sql no Supabase para ativar Convites VIP.',
            });
          }
          return res.status(invRes.status).json({ success: false, error: 'Não foi possível criar o convite.' });
        }

        const inviteUrl = `https://tiwshirts.space/parceiros?convite=${encodeURIComponent(token)}${suggestedCode ? `&codigo=${encodeURIComponent(suggestedCode)}` : ''}`;
        return res.status(201).json({
          success: true,
          invite: Array.isArray(invRes.data) ? invRes.data[0] : invRes.data,
          invite_url: inviteUrl,
        });
      }

      // Parceiro solicita Saque Pix
      if (body.action === 'request_payout') {
        const code = normalizeCouponCode(body.coupon_code);
        const amount = Number(body.amount || 0);
        const pixKey = String(body.pix_key || '').trim();
        if (!code || amount <= 0 || !pixKey) {
          return res.status(400).json({ success: false, error: 'Informe o cupom, valor disponível e chave Pix.' });
        }
        const payIns = await sbFetch('/rest/v1/tiw_payout_requests', {
          method: 'POST',
          headers: { ...userHeaders, Prefer: 'return=representation' },
          body: {
            user_id: auth.user.id,
            partner_email: auth.email,
            coupon_code: code,
            amount,
            pix_key: pixKey,
            status: 'solicitado',
          },
        });
        if (!payIns.ok) {
          return res.status(payIns.status).json({
            success: false,
            error: isMissingTableError(payIns)
              ? 'Tabela de saques ainda não migrada no Supabase.'
              : 'Não foi possível registrar solicitação de saque.',
          });
        }
        await dispatchCommEvent('affiliate.payout_requested', {
          subject: `Solicitação de Saque Pix: ${code} (R$ ${amount.toFixed(2)})`,
          staffSummary: `💸 *SAQUE SOLICITADO*: Cupom *${code}* (${auth.email}) pediu R$ ${amount.toFixed(2).replace('.', ',')} no Pix: \`${pixKey}\``,
        });
        return res.status(201).json({ success: true, payout: Array.isArray(payIns.data) ? payIns.data[0] : payIns.data });
      }

      // Parceiro logado solicita novo cupom
      const requestedCode = normalizeCouponCode(body.requested_code || body.code);
      const partnerName = String(body.partner_name || '').trim();
      const instagram = String(body.instagram || '').trim();
      const whatsapp = String(body.whatsapp || '').trim();
      const pixKey = String(body.pix_key || '').trim();
      const notes = String(body.notes || '').trim();

      if (!requestedCode || requestedCode.length < 3 || !partnerName || !whatsapp || !pixKey) {
        return res.status(400).json({ success: false, error: 'Preencha código (mín. 3 letras), nome, WhatsApp e chave Pix.' });
      }

      const checkRes = await sbFetch(`/rest/v1/tiw_coupons?code=eq.${encodeURIComponent(requestedCode)}&select=code&limit=1`, {
        headers: anonHeaders(),
      });
      if (checkRes.ok && Array.isArray(checkRes.data) && checkRes.data.length > 0) {
        return res.status(409).json({ success: false, error: `O código ${requestedCode} já está em uso.` });
      }

      const insertRes = await sbFetch('/rest/v1/tiw_partner_requests', {
        method: 'POST',
        headers: { ...userHeaders, Prefer: 'return=representation' },
        body: {
          user_id: auth.user.id,
          email: auth.email,
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
        return res.status(insertRes.status).json({ success: false, error: 'Não foi possível enviar a solicitação.' });
      }
      await dispatchCommEvent('affiliate.applied', {
        subject: `Nova solicitação de cupom: ${requestedCode}`,
        staffSummary: `📩 Solicitação de cupom *${requestedCode}* por ${partnerName} (${auth.email})`,
        recipientPhone: whatsapp,
        recipientEmail: auth.email,
        vars: { name: partnerName, code: requestedCode, action_url: 'https://tiwshirts.space/parceiros' },
      });
      return res.status(201).json({ success: true, request: Array.isArray(insertRes.data) ? insertRes.data[0] : insertRes.data });
    }

    // ================= PATCH (Approve/Reject Request OR Pay Payout) =================
    if (req.method === 'PATCH') {
      if (!isPartnerManager) {
        return res.status(403).json({ success: false, error: 'Apenas o Gestor de Parceiros ou Admin pode executar esta ação.' });
      }
      const headers = staff.headers;

      if (body.action === 'pay_payout') {
        const payoutId = Number(body.id);
        const pRes = await sbFetch(`/rest/v1/tiw_payout_requests?id=eq.${payoutId}&select=*&limit=1`, { headers });
        const pr = pRes.ok && Array.isArray(pRes.data) ? pRes.data[0] : null;
        if (!pr) return res.status(404).json({ success: false, error: 'Solicitação de saque não encontrada.' });

        await Promise.all([
          sbFetch(`/rest/v1/tiw_payout_requests?id=eq.${payoutId}`, {
            method: 'PATCH',
            headers: { ...headers, Prefer: 'return=minimal' },
            body: { status: 'pago', paid_at: new Date().toISOString(), receipt_note: body.receipt_note || 'Pago via Pix' },
          }),
          sbFetch(
            `/rest/v1/tiw_orders?coupon_code=eq.${encodeURIComponent(pr.coupon_code)}&status=in.(pago,producao,enviado)&commission_status=eq.pendente`,
            {
              method: 'PATCH',
              headers: { ...headers, Prefer: 'return=minimal' },
              body: { commission_status: 'pago', commission_paid_at: new Date().toISOString() },
            }
          ),
        ]);

        const comm = await dispatchCommEvent(
          'affiliate.payout_paid',
          {
            subject: `Pix de comissão enviado! (${pr.coupon_code})`,
            staffSummary: `✅ Saque Pix pago p/ *${pr.coupon_code}*: R$ ${Number(pr.amount).toFixed(2).replace('.', ',')}`,
            recipientEmail: pr.partner_email,
            vars: {
              name: pr.coupon_code,
              code: pr.coupon_code,
              amount: 'R$ ' + Number(pr.amount).toFixed(2).replace('.', ','),
              action_url: 'https://tiwshirts.space/parceiros',
            },
          },
          { headers }
        );
        return res.status(200).json({ success: true, comm_wa_url: comm.wa_url });
      }

      const requestId = Number(body.id);
      const action = String(body.action || '').trim().toLowerCase();
      if (!requestId || !['approve', 'reject'].includes(action)) {
        return res.status(400).json({ success: false, error: 'Informe id e action (approve ou reject).' });
      }

      const reqRes = await sbFetch(`/rest/v1/tiw_partner_requests?id=eq.${requestId}&select=*&limit=1`, { headers });
      const pr = reqRes.ok && Array.isArray(reqRes.data) ? reqRes.data[0] : null;
      if (!pr) return res.status(404).json({ success: false, error: 'Solicitação não encontrada.' });

      if (action === 'reject') {
        await sbFetch(`/rest/v1/tiw_partner_requests?id=eq.${requestId}`, {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: {
            status: 'recusado',
            admin_notes: String(body.admin_notes || '').trim() || null,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        });
        return res.status(200).json({ success: true, id: requestId, status: 'recusado' });
      }

      const code = normalizeCouponCode(body.code || pr.requested_code);
      const preset = TIER_PRESETS[body.tier || pr.tier] || TIER_PRESETS['10_10'];
      const discountPct = Number(body.discount_pct ?? preset.discount_pct);
      const commissionPct = Number(body.commission_pct ?? preset.commission_pct);

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
        return res.status(couponRes.status === 409 ? 409 : 400).json({
          success: false,
          error: couponRes.status === 409 ? `Já existe um cupom com o código ${code}.` : 'Não foi possível gerar o cupom.',
        });
      }

      const createdCoupon = Array.isArray(couponRes.data) ? couponRes.data[0] : couponRes.data;
      const partnerNotes = [pr.instagram, pr.notes].filter(Boolean).join(' · ');

      if (createdCoupon && createdCoupon.id) {
        const partnerBody = {
          coupon_id: createdCoupon.id,
          user_id: pr.user_id || null,
          partner_email: pr.email || null,
          partner_phone: pr.whatsapp || null,
          partner_pix: pr.pix_key || null,
          notes: partnerNotes || null,
          updated_at: new Date().toISOString(),
        };
        const pIns = await sbFetch('/rest/v1/tiw_coupon_partners', {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: partnerBody,
        });
        if (!pIns.ok) {
          // Fallback sem partner_email caso SQL novo ainda não tenha rodado
          delete partnerBody.partner_email;
          await sbFetch('/rest/v1/tiw_coupon_partners', {
            method: 'POST',
            headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: partnerBody,
          });
        }
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

      const comm = await dispatchCommEvent(
        'affiliate.approved',
        {
          subject: `Seu cupom ${code} na TiwShirts foi aprovado!`,
          staffSummary: `✅ Cupom *${code}* aprovado p/ ${pr.partner_name} (${discountPct}% OFF / ${commissionPct}% COM)`,
          recipientPhone: pr.whatsapp,
          recipientEmail: pr.email,
          vars: {
            name: pr.partner_name,
            code,
            discount_pct: discountPct,
            commission_pct: commissionPct,
            share_url: buildShareUrl(code),
            action_url: 'https://tiwshirts.space/parceiros',
          },
        },
        { headers }
      );

      return res.status(200).json({
        success: true,
        id: requestId,
        status: 'aprovado',
        comm_wa_url: comm.wa_url,
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
    return res.status(500).json({ success: false, error: err.message || 'Erro interno no módulo de afiliados.' });
  }
};
