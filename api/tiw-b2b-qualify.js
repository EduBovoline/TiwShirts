// Vercel Serverless Function — POST /api/tiw-b2b-qualify
// Motor B2B Autônomo TiwShirts:
// 1. Valida kit em múltiplos de 12 peças (Clássica R$ 69 | OverHeavy/OverLight R$ 89)
// 2. Qualifica o lojista em < 1s usando TypeSafe System One (jev-latest) via env TYPESAFE_API_KEY
// 3. Opcionalmente cota frete real Melhor Envio para a caixa de 12/24/36 potes
// 4. Persiste o lead qualificado em public.tiw_b2b_leads (visível no /admin)

const {
  WHATSAPP_TIW,
  setCors,
  anonHeaders,
  parseBody,
  sbFetch,
} = require('./_supabase');
const { quoteShippingOptions } = require('./shipping');
const { dispatchCommEvent } = require('./_comms');

const JEV_URL = 'https://api.typesafe.ai/v1/systemone';

async function evaluateStoreWithJev(storeState) {
  const apiKey = (process.env.TYPESAFE_API_KEY || '').trim();
  if (!apiKey) {
    return fallbackQualify(storeState);
  }

  const questions = {
    fit_cultural: {
      type: 'noul',
      instructions:
        'A loja possui real alinhamento cultural com a TiwShirts (streetwear independente, cultura skate, contracultura, estética urbana e público jovem/alternativo)?',
    },
    autonomia_balcao: {
      type: 'noul',
      instructions:
        'O lojista ou gerente local tem autonomia direta e agilidade para fechar um pedido de atacado a partir de 12 peças (R$ 948+) sem depender de aprovação corporativa de matriz ou rede de shopping?',
    },
    categoria_ponto: {
      type: 'choice',
      instructions: 'Qual é a categoria comercial predominante deste ponto de venda?',
      criteria: {
        skateshop_streetwear_rua: 'Loja de rua especializada em skate, streetwear e marcas independentes',
        headshop_lifestyle_cultura: 'Headshop ou tabacaria moderna com foco em estilo de vida jovem e cultura alternativa',
        rede_shopping_corporativa: 'Loja em shopping pertencente a grande rede com compras centralizadas',
        comercio_tradicional_sem_fit: 'Comércio antigo ou tradicional sem apelo com moda urbana jovem',
      },
    },
    mix_recomendado: {
      type: 'choice',
      instructions: 'Qual kit comercial da TiwShirts (múltiplos de 12 peças) tem maior propensão de aceitação nesta loja?',
      criteria: {
        starter_mix_12pcs: 'Starter Mix de 12 peças (6 Clássica 30.1 + 4 OverHeavy 220g + 2 OverLight G1-G3 = R$ 948)',
        pack_24pcs: 'Pack Loja de 24 peças (12 Clássica 30.1 + 8 OverHeavy 220g + 4 OverLight G1-G3 = R$ 1.896)',
        heavyweight_suedine_exclusivo: 'Lote focado na linha premium OverHeavy Suedine 220g (12+ peças)',
        nenhum: 'Não ofertar por falta de aderência',
      },
    },
    score_compra: {
      type: 'score',
      instructions: 'Qual é a probabilidade real desta loja fechar o pedido de atacado da TiwShirts?',
      criteria: [
        'Baixa: Falta de fit cultural ou burocracia de rede que inviabiliza compra direta',
        'Média: Tem público jovem mas moda de manifesto não é o foco principal da loja',
        'Alta: Fit cultural perfeito, loja de rua independente com autonomia e público comprador de streetwear/lifestyle',
      ],
    },
  };

  try {
    const resp = await fetch(JEV_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'TiwShirts-B2BEngine/2.0',
      },
      body: JSON.stringify({
        model: 'jev-latest',
        state: storeState,
        questions,
      }),
    });

    if (!resp.ok) {
      return fallbackQualify(storeState);
    }

    const data = await resp.json();
    const ans = (data && data.answers) || {};
    const fitCultural = Number((ans.fit_cultural && ans.fit_cultural.noul) || 0.5);
    const autonomia = Number((ans.autonomia_balcao && ans.autonomia_balcao.noul) || 0.5);
    const categoria = (ans.categoria_ponto && ans.categoria_ponto.choice) || 'skateshop_streetwear_rua';
    const mix = (ans.mix_recomendado && ans.mix_recomendado.choice) || 'starter_mix_12pcs';
    const score = Number((ans.score_compra && ans.score_compra.score) || 1);

    const isPriority =
      score >= 1.35 &&
      autonomia >= 0.55 &&
      categoria !== 'rede_shopping_corporativa' &&
      categoria !== 'comercio_tradicional_sem_fit';

    return {
      engine: 'jev-latest',
      fit_cultural: Number(fitCultural.toFixed(2)),
      autonomia_balcao: Number(autonomia.toFixed(2)),
      categoria,
      mix_recomendado: mix,
      score_compra: Number(score.toFixed(2)),
      tier: isPriority ? 'QUALIFICADO_PRIORITARIO' : 'CATALOGO_AUTOMATICO',
    };
  } catch (e) {
    return fallbackQualify(storeState);
  }
}

function fallbackQualify(storeState) {
  const perfil = String(storeState.perfil_ponto || '').toLowerCase();
  const isLowFit = perfil.includes('shopping') || perfil.includes('rede') || perfil.includes('tradicional');
  const isHighFit =
    perfil.includes('skate') ||
    perfil.includes('street') ||
    perfil.includes('headshop') ||
    perfil.includes('multimarcas');

  return {
    engine: 'heuristica_b2b',
    fit_cultural: isLowFit ? 0.3 : (isHighFit ? 0.88 : 0.65),
    autonomia_balcao: isLowFit ? 0.25 : 0.85,
    categoria: isLowFit
      ? 'rede_shopping_corporativa'
      : (perfil.includes('headshop') ? 'headshop_lifestyle_cultura' : 'skateshop_streetwear_rua'),
    mix_recomendado: Number(storeState.total_pecas || 12) >= 24 ? 'pack_24pcs' : 'starter_mix_12pcs',
    score_compra: isLowFit ? 0.5 : (isHighFit ? 1.8 : 1.3),
    tier: isLowFit ? 'CATALOGO_AUTOMATICO' : 'QUALIFICADO_PRIORITARIO',
  };
}

module.exports = async (req, res) => {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método não permitido.' });
  }

  try {
    const body = parseBody(req);

    // Honeypot anti-bot
    if (body.website_hp) {
      return res.status(200).json({ success: true, protocol: 'TIW-B2B-OK' });
    }

    const nome = String(body.nome || '').trim();
    const loja = String(body.loja || '').trim();
    const instagram = String(body.instagram || '').trim();
    const cidade = String(body.cidade || '').trim();
    const zap = String(body.zap || '').trim();
    const email = String(body.email || '').trim();
    const perfil = String(body.perfil || 'Skateshop / Streetwear de rua').trim();
    const descricao = String(body.descricao || '').trim();
    const cep = String(body.cep || '').replace(/\D/g, '');

    if (!nome || !loja || !cidade || !zap) {
      return res.status(400).json({
        success: false,
        error: 'Preencha nome, nome da loja, cidade/UF e WhatsApp.',
      });
    }

    const qC = Math.max(0, Number(body.qty_classica ?? 6));
    const qH = Math.max(0, Number(body.qty_overheavy ?? 4));
    const qL = Math.max(0, Number(body.qty_overlight ?? 2));
    const totalQty = qC + qH + qL;

    if (totalQty < 12 || totalQty % 12 !== 0) {
      return res.status(400).json({
        success: false,
        error: 'O pedido mínimo de atacado é em múltiplos de 12 peças (12, 24, 36...).',
      });
    }

    const totalB2B = Number((qC * 69 + (qH + qL) * 89).toFixed(2));
    const totalD2C = Number((qC * 139 + (qH + qL) * 179).toFixed(2));
    const lucroBruto = Number((totalD2C - totalB2B).toFixed(2));
    const markupPct = totalB2B > 0 ? Math.round((lucroBruto / totalB2B) * 100) : 101;

    // 1. Qualificação com Jev + Cotação de frete (em paralelo se CEP informado)
    const storeState = {
      responsavel: nome,
      loja,
      instagram,
      cidade,
      perfil_ponto: perfil,
      descricao,
      total_pecas: totalQty,
      valor_atacado_brl: totalB2B,
    };

    const [jevResult, shipQuote] = await Promise.all([
      evaluateStoreWithJev(storeState),
      cep.length === 8
        ? quoteShippingOptions({
            to_cep: cep,
            qty: totalQty,
            unit_value: Number((totalB2B / totalQty).toFixed(2)),
          }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const protocol = 'TIW-B2B-' + Date.now().toString(36).toUpperCase().slice(-5);
    const lojaLabel = `${loja}${instagram ? ' (' + instagram + ')' : ''} [${jevResult.tier === 'QUALIFICADO_PRIORITARIO' ? 'JEV ★' : 'JEV'} ${jevResult.score_compra}/2 · ${totalQty}pç R$ ${totalB2B.toFixed(0)}]`;

    // 2. Grava no Supabase (tiw_b2b_leads) para aparecer no /admin → Atacado B2B
    try {
      await sbFetch('/rest/v1/tiw_b2b_leads', {
        method: 'POST',
        headers: anonHeaders({ Prefer: 'return=minimal' }),
        body: {
          protocol,
          nome,
          loja: lojaLabel,
          cidade,
          zap,
          email,
        },
      });
    } catch (e) {}

    const kitLines = [];
    if (qC > 0) kitLines.push(`• ${qC}x Clássica 30.1 (R$ 69) = R$ ${(qC * 69).toFixed(2).replace('.', ',')}`);
    if (qH > 0) kitLines.push(`• ${qH}x OverHeavy 220g (R$ 89) = R$ ${(qH * 89).toFixed(2).replace('.', ',')}`);
    if (qL > 0) kitLines.push(`• ${qL}x OverLight G1-G3 (R$ 89) = R$ ${(qL * 89).toFixed(2).replace('.', ',')}`);

    const cheapestShip =
      shipQuote && shipQuote.success && Array.isArray(shipQuote.options) && shipQuote.options.length > 0
        ? shipQuote.options[0]
        : null;
    const shipLine = cheapestShip
      ? `\n*Frete estimado (${cheapestShip.company} ${cheapestShip.name}):* R$ ${Number(cheapestShip.price).toFixed(2).replace('.', ',')}`
      : '';

    const waMsg = encodeURIComponent(
      `Fala TiwShirts! Simulei meu pedido de atacado no portal /atacado (Protocolo *${protocol}*).\n\n` +
        `*Loja:* ${loja}${instagram ? ' (' + instagram + ')' : ''} — ${cidade}\n` +
        `*Responsável:* ${nome}\n\n` +
        `*Kit simulado (${totalQty} peças em Potes Herméticos):*\n${kitLines.join('\n')}\n\n` +
        `*Total Atacado:* R$ ${totalB2B.toFixed(2).replace('.', ',')} (revenda sugerida R$ ${totalD2C.toFixed(2).replace('.', ',')})${shipLine}\n\n` +
        `Quero escolher as estampas e tamanhos da grade livre!`
    );

    dispatchCommEvent('b2b.qualified', {
      subject: `Novo Lead Atacado B2B · ${loja} (${protocol})`,
      staffSummary: `▣ *LEAD ATACADO B2B* (${jevResult.tier}): *${loja}* (${cidade}) · ${totalQty} peças = R$ ${totalB2B.toFixed(2).replace('.', ',')} · Resp: ${nome} (${zap})`,
      recipientPhone: zap,
      recipientEmail: email,
      vars: {
        name: nome,
        loja,
        protocol,
        qty: totalQty,
        total: 'R$ ' + totalB2B.toFixed(2).replace('.', ','),
        action_url: 'https://tiwshirts.space/assets/Lamina_Comercial_Atacado_TiwShirts.pdf',
      },
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      protocol,
      tier: jevResult.tier,
      qualification: jevResult,
      kit: {
        qty_classica: qC,
        qty_overheavy: qH,
        qty_overlight: qL,
        total_qty: totalQty,
        total_b2b: totalB2B,
        total_d2c: totalD2C,
        lucro_bruto: lucroBruto,
        markup_pct: markupPct,
      },
      shipping: cheapestShip,
      pdf_url: '/assets/Lamina_Comercial_Atacado_TiwShirts.pdf',
      wa_url: `https://wa.me/${WHATSAPP_TIW}?text=${waMsg}`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || 'Erro ao qualificar lead B2B.' });
  }
};
