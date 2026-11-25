// Helper compartilhado para Supabase REST, controle de papéis (RBAC) e validação de cupons

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

function serviceOrAnonHeaders(extra = {}) {
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (svc) {
    return {
      apikey: svc,
      Authorization: `Bearer ${svc}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }
  return anonHeaders(extra);
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
  return res.status === 404 || /PGRST205|42P01|42703|does not exist|schema cache/i.test(msg);
}

async function getStaffContext(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    const user = await resp.json();
    if (!user || !user.id) return null;

    const email = String(user.email || '').toLowerCase().trim();
    const isSuperAdmin =
      Boolean(user.app_metadata && user.app_metadata.role === 'admin') ||
      email === 'edubovoline@gmail.com';

    let role = isSuperAdmin ? 'admin' : null;
    let memberName = (user.user_metadata && (user.user_metadata.name || user.user_metadata.partner_name)) || email;

    if (!role && email) {
      const tmRes = await sbFetch(
        `/rest/v1/tiw_team_members?email=eq.${encodeURIComponent(email)}&active=eq.true&select=role,name&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } }
      );
      if (tmRes.ok && Array.isArray(tmRes.data) && tmRes.data[0]) {
        role = tmRes.data[0].role;
        memberName = tmRes.data[0].name || memberName;
      }
    }

    return {
      user,
      token,
      email,
      name: memberName,
      role, // 'admin' | 'gestor_marca' | 'gestor_loja' | 'gestor_parceiros' | null
      isStaff: Boolean(role),
      isAdmin: role === 'admin',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
  } catch {
    return null;
  }
}

function normalizeCouponCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

async function fetchValidCoupon(rawCode) {
  const code = normalizeCouponCode(rawCode);
  if (!code || !/^[A-Z0-9_-]{3,32}$/.test(code)) {
    return { valid: false, message: 'Formato de cupom inválido.' };
  }

  const res = await sbFetch(
    `/rest/v1/tiw_coupons?code=eq.${encodeURIComponent(code)}&select=id,code,partner_name,discount_pct,commission_pct,active,max_uses,uses_count,expires_at&limit=1`
  );

  if (!res.ok) {
    if (isMissingTableError(res)) {
      return {
        valid: false,
        setupRequired: true,
        message: 'Tabela de cupons ainda não inicializada no Supabase.',
      };
    }
    return { valid: false, message: 'Não foi possível validar o cupom no momento.' };
  }

  const row = Array.isArray(res.data) ? res.data[0] : null;
  if (!row || !row.active) {
    return { valid: false, message: 'Cupom inválido ou inativo.' };
  }
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { valid: false, message: 'Este cupom já expirou.' };
  }
  if (row.max_uses != null && Number(row.uses_count || 0) >= Number(row.max_uses)) {
    return { valid: false, message: 'Limite de usos deste cupom atingido.' };
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
  serviceOrAnonHeaders,
  getBearerToken,
  getStaffContext,
  parseBody,
  sbFetch,
  isMissingTableError,
  normalizeCouponCode,
  fetchValidCoupon,
};
