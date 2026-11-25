// Motor Central de Automação de Comunicação Omnichannel — TiwShirts
// Canais suportados nativamente:
// 1. Telegram Bot API (alinhado ao plugin Antigravity `telegram`)
// 2. Discord Webhook (alinhado ao plugin Antigravity `discord`)
// 3. WhatsApp API Webhook (Evolution API / Z-API / n8n / Make) + Deep-link 1-clique
// 4. Resend Transactional Email API (confirmações p/ clientes, afiliados, B2B e equipe)

const { WHATSAPP_TIW, anonHeaders, serviceOrAnonHeaders, sbFetch } = require('./_supabase');

const DEFAULT_TEMPLATES = {
  'order.created':
    'Fala {{name}}! Recebemos seu pedido *{{order_id}}* ({{total}}) na TiwShirts. Assim que o pagamento confirmar já separamos suas peças no Pote Hermético oficial!',
  'order.paid':
    'Fala {{name}}! Pagamento do pedido *{{order_id}}* confirmado! Suas peças já entraram na fila de separação no Pote Hermético oficial.',
  'order.producao':
    'Fala {{name}}! Seu pedido *{{order_id}}* entrou em produção sob demanda (prazo de 7 a 10 dias úteis). Assim que despachar te enviamos o código de rastreio!',
  'order.enviado':
    'Fala {{name}}! Seu pedido *{{order_id}}* da TiwShirts foi enviado!\nCódigo de rastreio: *{{tracking_code}}*\nValeu por fortalecer a cena independente!',
  'affiliate.applied':
    'Fala {{name}}! Recebemos seu cadastro no Programa 10+10 da TiwShirts para o cupom *{{code}}*. Nossa gestão de parceiros já vai liberar seu painel em tiwshirts.space/parceiros!',
  'affiliate.approved':
    'Fala {{name}}! Seu cupom *{{code}}* está ATIVO na TiwShirts!\n• Link direto: {{share_url}}\n• Seu público ganha {{discount_pct}}% OFF e você recebe {{commission_pct}}% no Pix.\nPainel e extrato: https://tiwshirts.space/parceiros',
  'affiliate.payout_paid':
    'Fala {{name}}! Acabamos de enviar seu pagamento de comissão (*{{amount}}*) referente ao cupom *{{code}}* para a chave Pix cadastrada. Confere lá!',
  'b2b.qualified':
    'Fala {{name}}! Recebemos a simulação de atacado da *{{loja}}* (Protocolo *{{protocol}}* · {{qty}} peças = {{total}}). Vamos fechar as estampas da sua grade livre?',
};

function cleanPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function renderTemplate(tpl, vars = {}) {
  return String(tpl || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) =>
    vars[k] != null ? String(vars[k]) : ''
  );
}

async function loadCommConfig(authHeaders) {
  let dbCfg = {};
  try {
    const res = await sbFetch('/rest/v1/tiw_comm_settings?id=eq.1&select=*&limit=1', {
      headers: authHeaders || serviceOrAnonHeaders(),
    });
    if (res.ok && Array.isArray(res.data) && res.data[0]) {
      dbCfg = res.data[0];
    }
  } catch {}

  return {
    telegram_bot_token: (dbCfg.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    telegram_chat_id: (dbCfg.telegram_chat_id || process.env.TELEGRAM_CHAT_ID || '').trim(),
    discord_webhook_url: (dbCfg.discord_webhook_url || process.env.DISCORD_WEBHOOK_URL || '').trim(),
    whatsapp_webhook_url: (dbCfg.whatsapp_webhook_url || process.env.WHATSAPP_WEBHOOK_URL || '').trim(),
    whatsapp_webhook_token: (dbCfg.whatsapp_webhook_token || process.env.WHATSAPP_WEBHOOK_TOKEN || '').trim(),
    resend_api_key: (dbCfg.resend_api_key || process.env.RESEND_API_KEY || '').trim(),
    email_from: (dbCfg.email_from || process.env.EMAIL_FROM || 'TiwShirts <onboarding@resend.dev>').trim(),
    notify_admin_email: (dbCfg.notify_admin_email || process.env.ADMIN_NOTIFY_EMAIL || 'edubovoline@gmail.com').trim(),
    auto_notify_orders: dbCfg.auto_notify_orders !== false,
    auto_notify_affiliates: dbCfg.auto_notify_affiliates !== false,
    auto_notify_b2b: dbCfg.auto_notify_b2b !== false,
    auto_notify_indica: dbCfg.auto_notify_indica !== false,
    templates: { ...DEFAULT_TEMPLATES, ...(dbCfg.templates || {}) },
  };
}

async function recordCommLog(entry) {
  try {
    await sbFetch('/rest/v1/tiw_comm_logs', {
      method: 'POST',
      headers: anonHeaders({ Prefer: 'return=minimal' }),
      body: {
        event_type: entry.event_type || 'system',
        channel: entry.channel || 'internal',
        recipient: String(entry.recipient || '').slice(0, 140),
        subject: String(entry.subject || '').slice(0, 180),
        message_preview: String(entry.message_preview || '').slice(0, 500),
        status: entry.status || 'sent',
        metadata: entry.metadata || {},
      },
    });
  } catch {}
}

async function dispatchCommEvent(eventType, payload = {}, opts = {}) {
  const cfg = await loadCommConfig(opts.headers);
  const vars = payload.vars || {};
  const tpl = cfg.templates[eventType] || payload.defaultMessage || '';
  const customerMessage = renderTemplate(tpl, vars).trim();
  const staffSummary = payload.staffSummary || `[${eventType}] ${customerMessage}`;
  const subject = payload.subject || `TiwShirts · ${eventType}`;

  const recipientPhone = cleanPhone(payload.recipientPhone);
  const recipientEmail = String(payload.recipientEmail || '').trim();
  const waDirectUrl = recipientPhone
    ? `https://wa.me/${recipientPhone}?text=${encodeURIComponent(customerMessage)}`
    : `https://wa.me/${WHATSAPP_TIW}?text=${encodeURIComponent(customerMessage)}`;

  const dispatches = [];

  // 1. Alerta operacional no Telegram (se configurado)
  if (cfg.telegram_bot_token && cfg.telegram_chat_id) {
    dispatches.push(
      fetch(`https://api.telegram.org/bot${cfg.telegram_bot_token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cfg.telegram_chat_id,
          text: `🟢 *TiwShirts Ops*\n${staffSummary}`,
          parse_mode: 'Markdown',
        }),
      })
        .then((r) =>
          recordCommLog({
            event_type: eventType,
            channel: 'telegram',
            recipient: cfg.telegram_chat_id,
            subject,
            message_preview: staffSummary,
            status: r.ok ? 'sent' : 'failed',
          })
        )
        .catch(() => {})
    );
  }

  // 2. Alerta operacional no Discord (se configurado)
  if (cfg.discord_webhook_url) {
    dispatches.push(
      fetch(cfg.discord_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'TiwShirts Command Center',
          content: `**${subject}**\n${staffSummary}`,
        }),
      })
        .then((r) =>
          recordCommLog({
            event_type: eventType,
            channel: 'discord',
            recipient: 'discord_webhook',
            subject,
            message_preview: staffSummary,
            status: r.ok ? 'sent' : 'failed',
          })
        )
        .catch(() => {})
    );
  }

  // 3. Disparo automático de WhatsApp via Webhook (Evolution API / Z-API / n8n / Make)
  if (cfg.whatsapp_webhook_url && recipientPhone && customerMessage) {
    const waHeaders = { 'Content-Type': 'application/json' };
    if (cfg.whatsapp_webhook_token) {
      waHeaders.Authorization = `Bearer ${cfg.whatsapp_webhook_token}`;
      waHeaders.apikey = cfg.whatsapp_webhook_token;
    }
    dispatches.push(
      fetch(cfg.whatsapp_webhook_url, {
        method: 'POST',
        headers: waHeaders,
        body: JSON.stringify({
          event: eventType,
          number: recipientPhone,
          phone: recipientPhone,
          text: customerMessage,
          message: customerMessage,
          vars,
        }),
      })
        .then((r) =>
          recordCommLog({
            event_type: eventType,
            channel: 'whatsapp_api',
            recipient: recipientPhone,
            subject,
            message_preview: customerMessage,
            status: r.ok ? 'sent' : 'failed',
          })
        )
        .catch(() => {})
    );
  } else if (recipientPhone && customerMessage) {
    // Registra na fila inteligente de 1-clique do WhatsApp no Command Center
    dispatches.push(
      recordCommLog({
        event_type: eventType,
        channel: 'whatsapp_fila',
        recipient: recipientPhone,
        subject,
        message_preview: customerMessage,
        status: 'queued_manual',
        metadata: { wa_url: waDirectUrl },
      })
    );
  }

  // 4. E-mail Transacional via Resend API (se RESEND_API_KEY configurado)
  if (cfg.resend_api_key && (recipientEmail || cfg.notify_admin_email)) {
    const toList = recipientEmail ? [recipientEmail] : [cfg.notify_admin_email];
    const htmlBody = `
      <div style="font-family:Inter,Arial,sans-serif;background:#0a0a0c;color:#f4f4f5;padding:28px;border-radius:12px;max-width:560px;margin:0 auto;">
        <div style="font-family:monospace;color:#4ade80;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:12px;">TIWSHIRTS · COMUNICAÇÃO OFICIAL</div>
        <h2 style="margin:0 0 14px;font-size:20px;color:#ffffff;">${subject}</h2>
        <p style="line-height:1.6;color:#d4d4d8;white-space:pre-line;">${customerMessage || staffSummary}</p>
        ${vars.action_url ? `<p style="margin-top:20px;"><a href="${vars.action_url}" style="display:inline-block;padding:11px 18px;background:#2D5A27;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">Acessar Agora →</a></p>` : ''}
        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:24px 0 12px;" />
        <small style="color:#71717a;">TiwShirts · Sorocaba/SP · https://tiwshirts.space</small>
      </div>
    `;
    dispatches.push(
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.resend_api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: cfg.email_from,
          to: toList,
          bcc: recipientEmail && cfg.notify_admin_email ? [cfg.notify_admin_email] : undefined,
          subject,
          html: htmlBody,
        }),
      })
        .then((r) =>
          recordCommLog({
            event_type: eventType,
            channel: 'email',
            recipient: toList.join(','),
            subject,
            message_preview: customerMessage || staffSummary,
            status: r.ok ? 'sent' : 'failed',
          })
        )
        .catch(() => {})
    );
  }

  await Promise.allSettled(dispatches);

  return {
    message: customerMessage,
    wa_url: waDirectUrl,
  };
}

module.exports = {
  DEFAULT_TEMPLATES,
  cleanPhone,
  renderTemplate,
  loadCommConfig,
  recordCommLog,
  dispatchCommEvent,
};
