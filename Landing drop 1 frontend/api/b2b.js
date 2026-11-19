// Vercel Serverless Function — /api/b2b
// Registra solicitação de credenciamento B2B de lojista e persiste no Supabase.

const {
  WHATSAPP_TIW,
  setCors,
  anonHeaders,
  adminHeaders,
  parseBody,
  sbFetch,
} = require('./_supabase');

module.exports = async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // GET: Consultar leads registrados no painel (somente admin autenticado)
  if (req.method === 'GET') {
    const headers = adminHeaders(req);
    if (!headers) {
      return res.status(401).json({ success: false, error: 'Autenticação administrativa necessária.' });
    }
    try {
      const result = await sbFetch('/rest/v1/tiw_b2b_leads?select=*&order=created_at.desc', { headers });
      if (!result.ok) {
        const status = result.status === 401 || result.status === 403 ? result.status : 500;
        return res.status(status).json({ success: false, error: 'Erro ao consultar leads B2B.' });
      }
      return res.status(200).json({ success: true, leads: Array.isArray(result.data) ? result.data : [] });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido' });
  }

  try {
    const body = parseBody(req);
    const protocol = 'B2B-' + Date.now().toString(36).toUpperCase().slice(-5);

    const leadData = {
      protocol,
      nome: (body.nome || '').trim(),
      loja: (body.loja || '').trim(),
      cidade: (body.cidade || '').trim(),
      email: (body.email || '').trim(),
      zap: (body.zap || '').trim(),
    };

    try {
      await sbFetch('/rest/v1/tiw_b2b_leads', {
        method: 'POST',
        headers: anonHeaders({ Prefer: 'return=minimal' }),
        body: leadData,
      });
    } catch (dbErr) {
      console.error('Erro ao gravar lead no Supabase:', dbErr);
    }

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
