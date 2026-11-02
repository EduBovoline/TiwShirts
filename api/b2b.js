// Vercel Serverless Function — POST /api/b2b
// Registra solicitação de credenciamento B2B de lojista sem abrir WhatsApp.

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
    const protocol = 'B2B-' + Date.now().toString(36).toUpperCase().slice(-5);

    return res.status(201).json({
      success: true,
      protocol,
      lead: {
        nome: body.nome || '',
        loja: body.loja || '',
        cidade: body.cidade || '',
        email: body.email || '',
        zap: body.zap || '',
      },
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Erro ao registrar cadastro B2B' });
  }
};
