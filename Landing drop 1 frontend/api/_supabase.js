// Helper compartilhado para Supabase REST + validação de cupons (arquivo _* não vira rota na Vercel)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://msschydwkaektxjlbmjc.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'sb_publishable_oes4HCZimIPiK91wp3grLw_xT5gJJdz';
const WHATSAPP_TIW = '5515981512083';

function setCors(res, methods) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function anonHeaders(extra = {}) {
  const headers = {
    apikey: SUPABASE_KEY,
    'Content-Type': 'application/json',
    ...extra,
  };
  if (!SUPABASE_KEY.startsWith('sb_publishable_')) {
    headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  }
  return headers;
}

function getBearerToken(req) {
  const auth = req && req.headers ? (req.headers.authorization || req.headers.Authorization || '') : '';
  const match = String(auth).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function adminHeaders(req, extra = {}) {
  const token = getBearerToken(req);
  if (!token) return null;
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function parseBody(req) {
  if (!req || req.body == null) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body;
}

async function sbFetch(path, { method = 'GET', headers, body } = {}) {
  const opts = { method, headers: headers || anonHeaders() };
  if (body !== undefined) {
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const resp = await fetch(`${SUPABASE_URL}${path}`, opts);
  const text = await resp.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { ok: resp.ok, status: resp.status, data, text };
}

function isMissingTableError(res) {
  const msg = typeof res.data === 'object' && res.data ? `${res.data.code || ''} ${res.data.message || ''}` : String(res.text || '');
  return res.status === 404 || /PGRST205|42P01|does not exist|schema cache/i.test(msg);
}

function normalizeCouponCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

async function fetchValidCoupon(rawCode) {
  const code = normalizeCouponCode(rawCode);
  if (!code || !/^[A-Z0-9_-]{3,32}$/.test(code)) {
    return { valid: false, message: 'Código de cupom inválido.' };
  }

  const res = await sbFetch(
    `/rest/v1/tiw_coupons?code=eq.${encodeURIComponent(code)}&select=id,code,partner_name,discount_pct,commission_pct,active,max_uses,uses_count,expires_at&limit=1`,
    { headers: anonHeaders() }
  );

  if (!res.ok) {
    if (isMissingTableError(res)) {
      return { valid: false, setupRequired: true, message: 'Tabela de cupons ainda não inicializada no Supabase.' };
    }
    return { valid: false, message: 'Não foi possível validar o cupom agora.' };
  }

  const row = Array.isArray(res.data) ? res.data[0] : null;
  if (!row) {
    return { valid: false, message: 'Cupom não encontrado ou inativo.' };
  }
  if (!row.active) {
    return { valid: false, message: 'Este cupom está pausado no momento.' };
  }
  if (row.expires_at && new Date(row.expires_at) <= new Date()) {
    return { valid: false, message: 'Este cupom expirou.' };
  }
  if (row.max_uses != null && Number(row.uses_count || 0) >= Number(row.max_uses)) {
    return { valid: false, message: 'Este cupom atingiu o limite de usos.' };
  }

  return {
    valid: true,
    coupon: {
      id: row.id,
      code: row.code,
      partner_name: row.partner_name,
      discount_pct: Number(row.discount_pct || 0),
      commission_pct: Number(row.commission_pct || 0),
    },
  };
}

module.exports = {
  SUPABASE_URL,
  SUPABASE_KEY,
  WHATSAPP_TIW,
  setCors,
  anonHeaders,
  adminHeaders,
  parseBody,
  sbFetch,
  isMissingTableError,
  normalizeCouponCode,
  fetchValidCoupon,
};
