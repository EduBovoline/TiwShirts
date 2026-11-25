// Vercel Serverless Function — /api/ops
// Endpoint unificado de Operações, Auto-Atendimento Multi-Usuário, Estoque Vivo, Equipe e Automação de Comunicação:
// - GET  ?scope=lookup       -> Consulta pública segura de Pedido D2C, Protocolo B2B ou Status de Afiliado (/minha-conta)
// - GET  ?scope=me           -> Retorna papel/modalidade do usuário autenticado
// - GET/PATCH ?scope=inventory -> Gestão ao vivo de Estoque (Gestor da Loja / Admin)
// - GET/PUT/POST ?scope=comms  -> Central de Automação de Comunicação (Telegram, Discord, WhatsApp API, E-mail + Logs)
// - GET/POST/DELETE ?scope=team -> Gestão de Equipe e Perfis (Admin)
// - GET/POST/PATCH ?scope=indica -> Gestão de Parceiros Éticos /indica e Leads LGPD (Gestor da Marca / Admin)
// - PATCH ?scope=b2b         -> Atualiza estágio do funil B2B (Gestor da Loja / Admin)

const {
  setCors,
  anonHeaders,
  serviceOrAnonHeaders,
  getStaffContext,
  parseBody,
  sbFetch,
  isMissingTableError,
} = require('./_supabase');
const { DEFAULT_TEMPLATES, loadCommConfig, dispatchCommEvent } = require('./_comms');

function maskPhone(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length < 4) return '';
  return '***-' + d.slice(-4);
}

module.exports = async (req, res) => {
  setCors(res, 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const scope = String((req.query && req.query.scope) || '').trim().toLowerCase();

  try {
    // =========================================================================
    // 1. PUBLIC SELF-SERVICE LOOKUP (/minha-conta: Cliente D2C, Lojista B2B, Candidato Afiliado)
    // =========================================================================
    if (scope === 'lookup' && req.method === 'GET') {
      const kind = String(req.query.kind || 'order').trim().toLowerCase();
      const code = String(req.query.code || '').trim().toUpperCase();
      const contact = String(req.query.contact || '').trim().toLowerCase();

      if (!code && !contact) {
        return res.status(400).json({ success: false, error: 'Informe o código ou contato para consultar.' });
      }

      if (kind === 'order') {
        if (!code.startsWith('TIW-') || contact.replace(/\D/g, '').length < 4) {
          return res.status(400).json({
            success: false,
            error: 'Informe o código do pedido (ex: TIW-XXXX-XXXX) e os últimos 4 dígitos do seu WhatsApp ou CPF.',
          });
        }
        const ordRes = await sbFetch(
          `/rest/v1/tiw_orders?order_id=eq.${encodeURIComponent(code)}&select=order_id,status,payment_method,total,subtotal,discount_amount,coupon_code,items,customer,pix_code,checkout_url,tracking_code,created_at&limit=1`,
          { headers: serviceOrAnonHeaders() }
        );
        const row = ordRes.ok && Array.isArray(ordRes.data) ? ordRes.data[0] : null;
        if (!row) {
          return res.status(404).json({
            success: false,
            error: 'Pedido não encontrado ou requer confirmação pelo WhatsApp oficial.',
          });
        }
        const cust = row.customer || {};
        const digitsContact = contact.replace(/\D/g, '');
        const custPhoneDigits = String(cust.phone || '').replace(/\D/g, '');
        const custCpfDigits = String(cust.cpf || '').replace(/\D/g, '');
        const custEmail = String(cust.email || '').toLowerCase().trim();

        const verified =
          (digitsContact.length >= 4 && (custPhoneDigits.endsWith(digitsContact.slice(-4)) || custCpfDigits.endsWith(digitsContact.slice(-4)))) ||
          (custEmail && custEmail === contact);

        if (!verified) {
          return res.status(403).json({
            success: false,
            error: 'Os dados de verificação não conferem com este pedido.',
          });
        }

        return res.status(200).json({
          success: true,
          order: {
            order_id: row.order_id,
            status: row.status || 'aguardando_pagamento',
            payment_method: row.payment_method || 'pix',
            total: row.total,
            subtotal: row.subtotal || row.total,
            discount_amount: row.discount_amount || 0,
            coupon_code: row.coupon_code || null,
            tracking_code: row.tracking_code || (cust && cust.tracking_code) || null,
            items: (row.items || []).map((i) => ({ name: i.name, fit: i.fit, size: i.size, qty: i.qty })),
            customer_first_name: String(cust.name || '').split(' ')[0] || 'Cliente',
            phone_masked: maskPhone(cust.phone),
            shipping: cust.shipping || null,
            pix_code: row.status === 'aguardando_pagamento' ? row.pix_code : null,
            checkout_url: row.status === 'aguardando_pagamento' ? row.checkout_url : null,
            created_at: row.created_at,
          },
        });
      }

      if (kind === 'b2b') {
        const b2bRes = await sbFetch(
          `/rest/v1/tiw_b2b_leads?protocol=eq.${encodeURIComponent(code)}&select=protocol,loja,cidade,stage,created_at&limit=1`,
          { headers: serviceOrAnonHeaders() }
        );
        const lead = b2bRes.ok && Array.isArray(b2bRes.data) ? b2bRes.data[0] : null;
        if (!lead) {
          return res.status(404).json({ success: false, error: 'Protocolo B2B não localizado.' });
        }
        return res.status(200).json({ success: true, b2b: lead });
      }

      return res.status(400).json({ success: false, error: 'Tipo de consulta inválido.' });
    }

    // =========================================================================
    // 1B. RESOLVE HOME (Roteamento automático pós-login para a área do usuário)
    // =========================================================================
    if (scope === 'resolve_home' && req.method === 'GET') {
      const ctx = await getStaffContext(req);
      if (!ctx || !ctx.user) {
        return res.status(401).json({ success: false, error: 'Sessão inválida ou expirada.' });
      }

      // 1. Se for membro da equipe/gestor -> vai direto para /admin na visão do seu papel
      if (ctx.isStaff) {
        const defaultViewMap = {
          admin: 'overview',
          gestor_loja: 'orders',
          gestor_parceiros: 'coupons',
          gestor_marca: 'brand',
        };
        return res.status(200).json({
          success: true,
          modality: ctx.role,
          destination: `/admin?view=${defaultViewMap[ctx.role] || 'overview'}`,
          label: ctx.role === 'admin' ? 'Admin Geral 360°' : `Gestor (${ctx.role.replace('gestor_', '')})`,
          staff: { email: ctx.email, name: ctx.name, role: ctx.role, isAdmin: ctx.isAdmin },
        });
      }

      // 2. Verifica modalidade salva no onboarding (user_metadata.account_modality)
      const meta = (ctx.user && ctx.user.user_metadata) || {};
      let modality = String(meta.account_modality || '').trim().toLowerCase();

      // 3. Se conta antiga sem account_modality explícito, infere pelo vínculo real no banco
      if (!modality) {
        const [cpRes, reqRes] = await Promise.all([
          sbFetch('/rest/v1/rpc/get_my_partner_dashboard', { method: 'POST', headers: ctx.headers, body: {} }),
          sbFetch(`/rest/v1/tiw_partner_requests?select=id&limit=1`, { headers: ctx.headers }),
        ]);
        const hasAffiliate =
          (cpRes.ok && Array.isArray(cpRes.data) && cpRes.data.length > 0) ||
          (reqRes.ok && Array.isArray(reqRes.data) && reqRes.data.length > 0) ||
          Boolean(meta.requested_code);
        modality = hasAffiliate ? 'afiliado' : 'cliente_d2c';
      }

      const destMap = {
        afiliado: { destination: '/parceiros', label: 'Afiliado / Creator 10+10' },
        lojista_b2b: { destination: '/atacado', label: 'Lojista Atacado B2B' },
        parceiro_indica: { destination: '/indica', label: 'Parceiro Ético /indica' },
        cliente_d2c: { destination: '/minha-conta?area=cliente', label: 'Cliente da Loja (D2C)' },
      };

      const target = destMap[modality] || destMap.cliente_d2c;
      return res.status(200).json({
        success: true,
        modality,
        destination: target.destination,
        label: target.label,
        user: { email: ctx.email, name: ctx.name },
      });
    }

    // =========================================================================
    // DEMAIS ROTAS EXIGEM AUTENTICAÇÃO DE EQUIPE (RBAC)
    // =========================================================================
    const staff = await getStaffContext(req);
    if (!staff || !staff.isStaff) {
      return res.status(401).json({ success: false, error: 'Acesso restrito aos gestores autorizados da TiwShirts.' });
    }

    if (scope === 'me' && req.method === 'GET') {
      return res.status(200).json({
        success: true,
        staff: {
          email: staff.email,
          name: staff.name,
          role: staff.role,
          isAdmin: staff.isAdmin,
        },
      });
    }

    // =========================================================================
    // 2. INVENTORY (Gestor da Loja / Admin)
    // =========================================================================
    if (scope === 'inventory') {
      if (req.method === 'GET') {
        const invRes = await sbFetch('/rest/v1/tiw_inventory?select=*&order=key.asc', { headers: staff.headers });
        if (!invRes.ok && isMissingTableError(invRes)) {
          return res.status(200).json({ success: true, setup_pending: true, items: [] });
        }
        return res.status(200).json({ success: true, items: Array.isArray(invRes.data) ? invRes.data : [] });
      }

      if (req.method === 'PATCH') {
        if (!['admin', 'gestor_loja'].includes(staff.role)) {
          return res.status(403).json({ success: false, error: 'Apenas o Gestor da Loja ou Admin pode alterar o estoque.' });
        }
        const body = parseBody(req);
        const updates = Array.isArray(body.updates) ? body.updates : [body];
        const rows = updates
          .filter((u) => u && u.key)
          .map((u) => ({
            key: String(u.key).trim(),
            kind: u.kind === 'blank' || String(u.key).startsWith('blank:') ? 'blank' : 'finished',
            qty: Math.max(0, Math.floor(Number(u.qty || 0))),
            updated_by: staff.email,
            updated_at: new Date().toISOString(),
          }));

        if (!rows.length) {
          return res.status(400).json({ success: false, error: 'Nenhuma chave de estoque informada.' });
        }

        const upRes = await sbFetch('/rest/v1/tiw_inventory', {
          method: 'POST',
          headers: { ...staff.headers, Prefer: 'resolution=merge-duplicates,return=representation' },
          body: rows,
        });
        if (!upRes.ok) {
          if (isMissingTableError(upRes)) {
            return res.status(503).json({
              success: false,
              setup_pending: true,
              error: 'Execute o script supabase_erp_afiliados_comms.sql no Supabase para habilitar a edição dinâmica de estoque.',
            });
          }
          return res.status(upRes.status).json({ success: false, error: 'Erro ao salvar estoque.' });
        }
        return res.status(200).json({ success: true, updated: rows.length, items: upRes.data });
      }
    }

    // =========================================================================
    // 3. COMMS AUTOMATION HUB (Canais + Templates + Logs + Disparo de Teste)
    // =========================================================================
    if (scope === 'comms') {
      if (req.method === 'GET') {
        const [cfg, logsRes] = await Promise.all([
          loadCommConfig(staff.headers),
          sbFetch('/rest/v1/tiw_comm_logs?select=*&order=created_at.desc&limit=60', { headers: staff.headers }),
        ]);

        // Mascara tokens sensíveis na leitura
        const safeCfg = {
          telegram_configured: Boolean(cfg.telegram_bot_token && cfg.telegram_chat_id),
          telegram_chat_id: cfg.telegram_chat_id,
          discord_configured: Boolean(cfg.discord_webhook_url),
          whatsapp_api_configured: Boolean(cfg.whatsapp_webhook_url),
          whatsapp_webhook_url: cfg.whatsapp_webhook_url,
          email_configured: Boolean(cfg.resend_api_key),
          email_from: cfg.email_from,
          notify_admin_email: cfg.notify_admin_email,
          auto_notify_orders: cfg.auto_notify_orders,
          auto_notify_affiliates: cfg.auto_notify_affiliates,
          auto_notify_b2b: cfg.auto_notify_b2b,
          auto_notify_indica: cfg.auto_notify_indica,
          templates: cfg.templates,
          default_templates: DEFAULT_TEMPLATES,
        };

        return res.status(200).json({
          success: true,
          setup_pending: !logsRes.ok && isMissingTableError(logsRes),
          config: safeCfg,
          logs: logsRes.ok && Array.isArray(logsRes.data) ? logsRes.data : [],
        });
      }

      if (req.method === 'PUT') {
        if (!staff.isAdmin) {
          return res.status(403).json({ success: false, error: 'Apenas o Admin Geral pode alterar credenciais de canais.' });
        }
        const body = parseBody(req);
        const patch = { id: 1, updated_at: new Date().toISOString() };
        const strFields = [
          'telegram_bot_token',
          'telegram_chat_id',
          'discord_webhook_url',
          'whatsapp_webhook_url',
          'whatsapp_webhook_token',
          'resend_api_key',
          'email_from',
          'notify_admin_email',
        ];
        for (const f of strFields) {
          if (body[f] !== undefined && body[f] !== '***KEEP***') {
            patch[f] = String(body[f] || '').trim();
          }
        }
        ['auto_notify_orders', 'auto_notify_affiliates', 'auto_notify_b2b', 'auto_notify_indica'].forEach((b) => {
          if (body[b] !== undefined) patch[b] = Boolean(body[b]);
        });
        if (body.templates && typeof body.templates === 'object') {
          patch.templates = body.templates;
        }

        const saveRes = await sbFetch('/rest/v1/tiw_comm_settings', {
          method: 'POST',
          headers: { ...staff.headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: patch,
        });
        if (!saveRes.ok) {
          if (isMissingTableError(saveRes)) {
            return res.status(503).json({
              success: false,
              setup_pending: true,
              error: 'Execute supabase_erp_afiliados_comms.sql no Supabase para salvar configurações de comunicação.',
            });
          }
          return res.status(saveRes.status).json({ success: false, error: 'Erro ao salvar configurações de comunicação.' });
        }
        return res.status(200).json({ success: true });
      }

      if (req.method === 'POST') {
        const body = parseBody(req);
        const out = await dispatchCommEvent(
          body.event_type || 'system.test',
          {
            subject: body.subject || 'Teste de Automação · TiwShirts Command Center',
            staffSummary: body.message || `Disparo de teste acionado por ${staff.email} em ${new Date().toLocaleString('pt-BR')}.`,
            defaultMessage: body.message || 'Teste de comunicação automática TiwShirts funcionando!',
            recipientPhone: body.phone || '',
            recipientEmail: body.email || staff.email,
            vars: body.vars || { name: staff.name },
          },
          { headers: staff.headers }
        );
        return res.status(200).json({ success: true, result: out });
      }
    }

    // =========================================================================
    // 4. TEAM & ROLES (Admin)
    // =========================================================================
    if (scope === 'team') {
      if (req.method === 'GET') {
        const tmRes = await sbFetch('/rest/v1/tiw_team_members?select=*&order=created_at.asc', { headers: staff.headers });
        if (!tmRes.ok && isMissingTableError(tmRes)) {
          return res.status(200).json({
            success: true,
            setup_pending: true,
            members: [{ email: 'edubovoline@gmail.com', name: 'Eduardo Bovoline', role: 'admin', active: true }],
          });
        }
        return res.status(200).json({ success: true, members: Array.isArray(tmRes.data) ? tmRes.data : [] });
      }

      if (!staff.isAdmin) {
        return res.status(403).json({ success: false, error: 'Apenas o Admin Geral gerencia permissões da equipe.' });
      }

      if (req.method === 'POST') {
        const body = parseBody(req);
        const email = String(body.email || '').toLowerCase().trim();
        const name = String(body.name || '').trim();
        const role = String(body.role || 'gestor_loja').trim();
        const whatsapp = String(body.whatsapp || '').trim();
        if (!email || !name || !['admin', 'gestor_marca', 'gestor_loja', 'gestor_parceiros'].includes(role)) {
          return res.status(400).json({ success: false, error: 'Informe nome, e-mail válido e papel do gestor.' });
        }
        const ins = await sbFetch('/rest/v1/tiw_team_members', {
          method: 'POST',
          headers: { ...staff.headers, Prefer: 'resolution=merge-duplicates,return=representation' },
          body: { email, name, role, whatsapp, active: true, updated_at: new Date().toISOString() },
        });
        if (!ins.ok) {
          return res.status(ins.status).json({ success: false, error: 'Erro ao salvar gestor (verifique se a migração SQL foi aplicada).' });
        }
        return res.status(201).json({ success: true, member: Array.isArray(ins.data) ? ins.data[0] : ins.data });
      }

      if (req.method === 'DELETE') {
        const email = String(req.query.email || '').toLowerCase().trim();
        if (!email || email === 'edubovoline@gmail.com') {
          return res.status(400).json({ success: false, error: 'Não é permitido remover o Admin principal.' });
        }
        await sbFetch(`/rest/v1/tiw_team_members?email=eq.${encodeURIComponent(email)}`, {
          method: 'DELETE',
          headers: { ...staff.headers, Prefer: 'return=minimal' },
        });
        return res.status(200).json({ success: true });
      }
    }

    // =========================================================================
    // 5. HUB /INDICA MANAGEMENT (Gestor da Marca / Admin)
    // =========================================================================
    if (scope === 'indica') {
      if (req.method === 'GET') {
        const [pRes, rRes] = await Promise.all([
          sbFetch('/rest/v1/tiw_partners?select=*&order=created_at.desc', { headers: staff.headers }),
          sbFetch('/rest/v1/tiw_referrals?select=*&order=created_at.desc&limit=100', { headers: staff.headers }),
        ]);
        return res.status(200).json({
          success: true,
          setup_pending: (!pRes.ok && isMissingTableError(pRes)) || (!rRes.ok && isMissingTableError(rRes)),
          partners: pRes.ok && Array.isArray(pRes.data) ? pRes.data : [],
          referrals: rRes.ok && Array.isArray(rRes.data) ? rRes.data : [],
        });
      }

      if (!['admin', 'gestor_marca'].includes(staff.role)) {
        return res.status(403).json({ success: false, error: 'Apenas o Gestor da Marca ou Admin gerencia o Hub /indica.' });
      }

      if (req.method === 'POST') {
        const body = parseBody(req);
        const slug = String(body.slug || body.name || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        if (!slug || !body.name || !body.destination_url) {
          return res.status(400).json({ success: false, error: 'Informe nome e URL de destino do parceiro.' });
        }
        const ins = await sbFetch('/rest/v1/tiw_partners', {
          method: 'POST',
          headers: { ...staff.headers, Prefer: 'return=representation' },
          body: {
            slug,
            name: String(body.name).trim(),
            vertical: body.vertical || 'medico_prescritor',
            headline: String(body.headline || body.name).trim(),
            description: String(body.description || '').trim(),
            credentials: String(body.credentials || '').trim(),
            city_uf: String(body.city_uf || 'Brasil (Online)').trim(),
            revenue_model: body.revenue_model || 'parceria_institucional',
            destination_url: String(body.destination_url).trim(),
            whatsapp: String(body.whatsapp || '').trim(),
            human_approved: true,
            is_active: true,
          },
        });
        if (!ins.ok) {
          return res.status(ins.status).json({ success: false, error: 'Erro ao cadastrar parceiro no /indica.' });
        }
        return res.status(201).json({ success: true, partner: Array.isArray(ins.data) ? ins.data[0] : ins.data });
      }

      if (req.method === 'PATCH') {
        const body = parseBody(req);
        if (!body.id) return res.status(400).json({ success: false, error: 'id obrigatório.' });
        const patch = { updated_at: new Date().toISOString() };
        if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);
        if (body.human_approved !== undefined) patch.human_approved = Boolean(body.human_approved);
        await sbFetch(`/rest/v1/tiw_partners?id=eq.${encodeURIComponent(body.id)}`, {
          method: 'PATCH',
          headers: { ...staff.headers, Prefer: 'return=minimal' },
          body: patch,
        });
        return res.status(200).json({ success: true });
      }
    }

    // =========================================================================
    // 6. B2B PIPELINE STAGE UPDATE (Gestor da Loja / Admin)
    // =========================================================================
    if (scope === 'b2b' && req.method === 'PATCH') {
      const body = parseBody(req);
      if (!body.protocol) return res.status(400).json({ success: false, error: 'protocol obrigatório.' });
      const patch = {};
      if (body.stage) patch.stage = body.stage;
      if (body.internal_notes !== undefined) patch.internal_notes = String(body.internal_notes || '');
      const upd = await sbFetch(`/rest/v1/tiw_b2b_leads?protocol=eq.${encodeURIComponent(body.protocol)}`, {
        method: 'PATCH',
        headers: { ...staff.headers, Prefer: 'return=minimal' },
        body: patch,
      });
      if (!upd.ok && isMissingTableError(upd)) {
        return res.status(503).json({ success: false, setup_pending: true, error: 'Rode a migração SQL para habilitar estágios B2B.' });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, error: 'Escopo ou método inválido em /api/ops.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Erro interno em /api/ops.' });
  }
};
