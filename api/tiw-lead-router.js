// Vercel Serverless Function — GET & POST /api/tiw-lead-router
// Hub Ético /indica (TiwShirts):
// - GET: lista parceiros ativos e aprovados por humano (public.tiw_partners)
// - POST: classifica intenção via Jev (jev-latest), exige consentimento explícito LGPD,
//         registra em public.tiw_referrals, dispara webhook de atribuição (se configurado)
//         e devolve link rastreado com UTM ou encaminhamento para curadoria.

const {
  WHATSAPP_TIW,
  setCors,
  anonHeaders,
  parseBody,
  sbFetch,
  isMissingTableError,
} = require('./_supabase');

const JEV_URL = 'https://api.typesafe.ai/v1/systemone';

const VERTICAL_LABELS = {
  medico_prescritor: 'Médicos Prescritores (CRM verificado)',
  associacao_pacientes: 'Associações de Pacientes',
  curso_educacao: 'Cursos & Educação',
  ecossistema_servicos: 'Ecossistema (Grow, Headshops & Advogados)',
};

async function classifyIntentWithJev(state) {
  const apiKey = (process.env.TYPESAFE_API_KEY || '').trim();
  if (!apiKey) return fallbackClassify(state);

  const questions = {
    vertical_destino: {
      type: 'choice',
      instructions: 'Qual vertical do Hub /indica da TiwShirts melhor atende a necessidade descrita pelo leitor?',
      criteria: {
        medico_prescritor: 'Busca consulta médica, receita, laudo ou acompanhamento clínico para cannabis medicinal',
        associacao_pacientes: 'Busca associação de pacientes, acolhimento, óleo artesanal legalizado ou apoio comunitário',
        curso_educacao: 'Busca curso, formação, guia técnico de cultivo, redução de danos ou direito canábico',
        ecossistema_servicos: 'Busca advogado (habeas corpus), growshop, headshop conceitual ou serviço lícito do ecossistema',
      },
    },
    urgencia_atendimento: {
      type: 'score',
      instructions: 'Qual o grau de urgência do leitor para receber esse direcionamento?',
      criteria: [
        'Baixa (0): Apenas pesquisando ou curiosidade inicial',
        'Média (1): Quer iniciar o processo nos próximos dias',
        'Alta (2): Demanda imediata de saúde, jurídica ou matrícula pronta',
      ],
    },
    risco_pedido_ilicito: {
      type: 'noul',
      instructions: 'O texto pede compra ilegal de substâncias sem prescrição/autorização ou algo fora da lei brasileira?',
    },
  };

  try {
    const resp = await fetch(JEV_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'TiwShirts-LeadRouter/1.0',
      },
      body: JSON.stringify({
        model: 'jev-latest',
        state,
        questions,
      }),
    });

    if (!resp.ok) return fallbackClassify(state);
    const data = await resp.json();
    const ans = (data && data.answers) || {};
    return {
      engine: 'jev-latest',
      vertical: (ans.vertical_destino && ans.vertical_destino.choice) || state.requested_vertical || 'medico_prescritor',
      urgencia: Number((ans.urgencia_atendimento && ans.urgencia_atendimento.score) || 1),
      risco_ilicito: Number((ans.risco_pedido_ilicito && ans.risco_pedido_ilicito.noul) || 0),
    };
  } catch {
    return fallbackClassify(state);
  }
}

function fallbackClassify(state) {
  const txt = `${state.requested_vertical || ''} ${state.intent_summary || ''}`.toLowerCase();
  let vertical = state.requested_vertical || 'medico_prescritor';

  if (!VERTICAL_LABELS[vertical]) {
    if (/m[eé]dic|receit|prescri|consulta|laudo|anvisa/.test(txt)) vertical = 'medico_prescritor';
    else if (/associa|paciente|acolhimento/.test(txt)) vertical = 'associacao_pacientes';
    else if (/curso|aula|estuda|cultivo|forma[çc][ãa]o|redu[çc][ãa]o/.test(txt)) vertical = 'curso_educacao';
    else vertical = 'ecossistema_servicos';
  }

  const risco = /comprar flor|vender maconha|sem receita|delivery ilegal/.test(txt) ? 0.9 : 0.05;
  return {
    engine: 'heuristica_router',
    vertical,
    urgencia: 1,
    risco_ilicito: risco,
  };
}

function appendUtm(rawUrl, { slug, sourcePage }) {
  try {
    const u = new URL(rawUrl);
    u.searchParams.set('utm_source', 'tiwshirts_indica');
    u.searchParams.set('utm_medium', 'referral');
    u.searchParams.set('utm_campaign', slug || 'hub_indica');
    if (sourcePage) u.searchParams.set('utm_content', sourcePage.replace(/[^a-zA-Z0-9/_-]/g, '').slice(0, 60));
    return u.toString();
  } catch {
    return rawUrl;
  }
}

module.exports = async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    try {
      const verticalFilter = String((req.query && req.query.vertical) || '').trim();
      let query = '/rest/v1/tiw_partners?select=id,slug,name,vertical,headline,description,credentials,city_uf,revenue_model,destination_url,utm_campaign&is_active=eq.true&human_approved=eq.true&order=created_at.desc';
      if (verticalFilter && VERTICAL_LABELS[verticalFilter]) {
        query += `&vertical=eq.${encodeURIComponent(verticalFilter)}`;
      }

      const sb = await sbFetch(query, { headers: anonHeaders() });
      if (!sb.ok) {
        if (isMissingTableError(sb)) {
          return res.status(200).json({ success: true, partners: [], setup_pending: true });
        }
        return res.status(502).json({ success: false, error: 'Erro ao consultar parceiros.' });
      }

      const partners = (Array.isArray(sb.data) ? sb.data : []).map((p) => ({
        ...p,
        tracked_url: appendUtm(p.destination_url, { slug: p.slug, sourcePage: '/indica' }),
      }));

      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
      return res.status(200).json({ success: true, partners });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message || 'Erro interno.' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido.' });
  }

  try {
    const body = parseBody(req);

    // Honeypot anti-bot
    if (body.website_hp) {
      return res.status(200).json({ success: true, protocol: 'TIW-IND-OK' });
    }

    const userName = String(body.name || '').trim();
    const userWhatsapp = String(body.whatsapp || '').trim();
    const userEmail = String(body.email || '').trim();
    const cityUf = String(body.city_uf || '').trim();
    const intentSummary = String(body.intent || '').trim();
    const requestedVertical = String(body.vertical || '').trim();
    const partnerSlug = String(body.partner_slug || '').trim();
    const sourcePage = String(body.source_page || '/indica').trim().slice(0, 120);
    const lgpdConsent = body.lgpd_consent === true || body.lgpd_consent === 'true';

    if (!lgpdConsent) {
      return res.status(400).json({
        success: false,
        error: 'É obrigatório confirmar o consentimento LGPD para encaminharmos seu contato a um parceiro verificado.',
      });
    }

    if (!userName || !userWhatsapp || intentSummary.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Preencha seu nome, WhatsApp e um breve resumo do que você precisa.',
      });
    }

    // 1. Classificação ética e de intenção via Jev
    const jev = await classifyIntentWithJev({
      requested_vertical: requestedVertical,
      city_uf: cityUf,
      intent_summary: intentSummary,
      source_page: sourcePage,
    });

    if (jev.risco_ilicito >= 0.7) {
      return res.status(400).json({
        success: false,
        error: 'O Hub /indica conecta apenas a serviços médicos, associações legalizadas, cursos e parceiros dentro da lei brasileira.',
      });
    }

    const finalVertical = VERTICAL_LABELS[requestedVertical] ? requestedVertical : jev.vertical;

    // 2. Busca parceiro aprovado correspondente no Supabase (se existir)
    let matchedPartner = null;
    try {
      const filterQuery = partnerSlug
        ? `/rest/v1/tiw_partners?select=id,slug,name,vertical,destination_url,whatsapp,webhook_url&slug=eq.${encodeURIComponent(partnerSlug)}&is_active=eq.true&human_approved=eq.true&limit=1`
        : `/rest/v1/tiw_partners?select=id,slug,name,vertical,destination_url,whatsapp,webhook_url&vertical=eq.${encodeURIComponent(finalVertical)}&is_active=eq.true&human_approved=eq.true&order=created_at.desc&limit=1`;

      const pRes = await sbFetch(filterQuery, { headers: anonHeaders() });
      if (pRes.ok && Array.isArray(pRes.data) && pRes.data.length > 0) {
        matchedPartner = pRes.data[0];
      }
    } catch {}

    const protocol = 'TIW-IND-' + Date.now().toString(36).toUpperCase().slice(-5);

    // 3. Registra consentimento LGPD e encaminhamento em public.tiw_referrals
    try {
      await sbFetch('/rest/v1/tiw_referrals', {
        method: 'POST',
        headers: anonHeaders({ Prefer: 'return=minimal' }),
        body: {
          protocol,
          partner_id: matchedPartner ? matchedPartner.id : null,
          vertical: finalVertical,
          user_name: userName,
          user_whatsapp: userWhatsapp,
          user_email: userEmail,
          city_uf: cityUf,
          intent_summary: intentSummary,
          source_page: sourcePage,
          utm_source: 'tiwshirts_indica',
          utm_medium: 'referral',
          utm_campaign: matchedPartner ? matchedPartner.slug : finalVertical,
          lgpd_consent: true,
          lgpd_notice_version: 'v1-2026',
          jev_engine: jev.engine,
          jev_classification: jev,
          status: matchedPartner ? 'encaminhado' : 'novo',
        },
      });
    } catch {}

    // 4. Dispara webhook de atribuição do parceiro (se houver)
    if (matchedPartner && matchedPartner.webhook_url) {
      fetch(matchedPartner.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'TiwShirts-LeadRouter/1.0' },
        body: JSON.stringify({
          event: 'tiwshirts.referral.created',
          protocol,
          vertical: finalVertical,
          partner_slug: matchedPartner.slug,
          user_name: userName,
          user_whatsapp: userWhatsapp,
          city_uf: cityUf,
          source_page: sourcePage,
          lgpd_consent: true,
        }),
      }).catch(() => {});
    }

    const trackedDestination = matchedPartner
      ? appendUtm(matchedPartner.destination_url, { slug: matchedPartner.slug, sourcePage })
      : null;

    const waText = encodeURIComponent(
      `Olá! Vim pelo Hub TiwShirts Indica (Protocolo *${protocol}*).\n` +
      `*Vertical:* ${VERTICAL_LABELS[finalVertical] || finalVertical}\n` +
      `*Nome:* ${userName}${cityUf ? ' — ' + cityUf : ''}\n` +
      `*Necessidade:* ${intentSummary}`
    );

    const waTarget = (matchedPartner && matchedPartner.whatsapp) ? matchedPartner.whatsapp.replace(/\D/g, '') : WHATSAPP_TIW;

    return res.status(201).json({
      success: true,
      protocol,
      vertical: finalVertical,
      vertical_label: VERTICAL_LABELS[finalVertical] || finalVertical,
      classification: jev,
      partner: matchedPartner
        ? {
            name: matchedPartner.name,
            slug: matchedPartner.slug,
            tracked_url: trackedDestination,
          }
        : null,
      wa_url: `https://wa.me/${waTarget}?text=${waText}`,
      message: matchedPartner
        ? `Encaminhamento registrado com consentimento LGPD. Você pode seguir direto para ${matchedPartner.name}.`
        : 'Solicitação registrada com consentimento LGPD. Nossa curadoria vai te indicar o parceiro verificado mais adequado no WhatsApp.',
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Erro ao processar encaminhamento.' });
  }
};
