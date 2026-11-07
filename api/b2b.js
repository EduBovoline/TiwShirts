// Vercel Serverless Function — POST /api/b2b
// Registra solicitação de credenciamento B2B de lojista e persiste no Supabase.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://msschydwkaektxjlbmjc.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zc2NoeWR3a2Fla3R4amxibWpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4MTkyMjMsImV4cCI6MjEwOTM5NTIyM30.Jemyb0rGHItevfp8EqZ_jWTEP01yqVdp_iQoRtFuEv0';
const WHATSAPP_TIW = '5515981512083';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // GET: Permite consultar leads registrados no painel
  if (req.method === 'GET') {
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/tiw_b2b_leads?select=*&order=created_at.desc`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      });
      const data = await resp.json();
      return res.status(200).json({ success: true, leads: data });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const protocol = 'B2B-' + Date.now().toString(36).toUpperCase().slice(-5);

    const leadData = {
      protocol,
      nome: (body.nome || '').trim(),
      loja: (body.loja || '').trim(),
      cidade: (body.cidade || '').trim(),
      email: (body.email || '').trim(),
      zap: (body.zap || '').trim(),
    };

    // 1. Persistência permanente no banco Supabase
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/tiw_b2b_leads`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(leadData),
      });
    } catch (dbErr) {
      console.error('Erro ao gravar lead no Supabase:', dbErr);
    }

    // 2. Prepara link de acionamento direto no WhatsApp
    const waText = encodeURIComponent(
      `Olá TiwShirts! Sou ${leadData.nome}, da loja ${leadData.loja} em ${leadData.cidade}.\n` +
      `Acabei de solicitar o catálogo e a Lâmina Comercial B2B (Protocolo ${protocol}).\n` +
      `WhatsApp: ${leadData.zap} | E-mail: ${leadData.email}\n` +
      `Gostaria de consultar a grade e pedido de atacado (múltiplos de 12 peças).`
    );
    const waUrl = `https://wa.me/${WHATSAPP_TIW}?text=${waText}`;

    return res.status(201).json({
      success: true,
      protocol,
      lead: leadData,
      wa_url: waUrl,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Erro ao registrar cadastro B2B' });
  }
};
