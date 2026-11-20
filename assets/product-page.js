// TiwShirts — Motor Interativo das Páginas Individuais de Produto (/camiseta/<slug>)
// Conecta galeria editorial, estoque vivo (/api/catalog), cupom 10+10 (/api/coupons),
// frete Melhor Envio (/api/shipping) e checkout Pix + InfinitePay (/api/orders).

(function () {
  const COUPON_STORAGE_KEY = 'tiw_active_coupon';
  const COUPON_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const WHATSAPP_TIW = '5515981512083';

  const COLOR_META = {
    preto: { label: 'Preta', hex: '#141416', border: 'rgba(255,255,255,0.28)' },
    branco: { label: 'Branca', hex: '#F4F4F5', border: 'rgba(255,255,255,0.45)' },
    offwhite: { label: 'Off-White', hex: '#E8E2D5', border: 'rgba(197,168,128,0.55)' },
    'azul-marinho': { label: 'Azul Marinho', hex: '#1B2A4A', border: 'rgba(147,197,253,0.45)' },
  };

  const LINE_INFO = {
    pf: { short: 'Clássica 30.1', price: 139, sizes: ['P', 'M', 'G', 'GG'], desc: '100% Algodão Penteado 30.1 (~160 g/m²)' },
    casca: { short: 'OverHeavy 220g', price: 179, sizes: ['P', 'M', 'G', 'GG'], desc: 'Malha Suedine 100% Algodão 220g' },
    espacoso: { short: 'OverLight G1-G3', price: 179, sizes: ['G1', 'G2', 'G3'], desc: 'Modelagem ampla para tamanhos especiais' },
  };

  const product = window.TIW_PRODUCT;
  if (!product) return;

  const state = {
    imgIdx: 0,
    variantIdx: 0,
    sizeIdx: 0,
    qty: 1,
    catalogProduct: null,
    coupon: null,
    shippingOptions: [],
    selectedShippingIdx: 0,
    shippingDest: null,
    lastCep: '',
    paymentMethod: 'pix',
    orderResult: null,
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtMoney(v) {
    return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
  }
  function showToast(msg) {
    const el = document.getElementById('p-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ================= GALLERY ================= */
  function renderGallery() {
    const imgs = product.images || [];
    if (!imgs.length) return;
    state.imgIdx = ((state.imgIdx % imgs.length) + imgs.length) % imgs.length;
    const mainImg = document.getElementById('p-main-img');
    const counter = document.getElementById('p-img-counter');
    if (mainImg) mainImg.src = '/' + imgs[state.imgIdx].replace(/^\//, '');
    if (counter) counter.textContent = `${state.imgIdx + 1} / ${imgs.length}`;
    document.querySelectorAll('.p-thumb').forEach((t, i) => {
      t.classList.toggle('active', i === state.imgIdx);
    });
  }

  window.tiwGalleryStep = function (delta) {
    state.imgIdx += delta;
    renderGallery();
  };
  window.tiwGallerySelect = function (idx) {
    state.imgIdx = idx;
    renderGallery();
  };

  /* ================= VARIANTS & LIVE STOCK ================= */
  function getSizesForVariant(vIdx) {
    const v = product.variants[vIdx] || product.variants[0];
    if (state.catalogProduct && Array.isArray(state.catalogProduct.options)) {
      const match = state.catalogProduct.options.find(
        (o) => o.line_id === v.lineId && o.color_id === v.colorId
      );
      if (match && Array.isArray(match.sizes) && match.sizes.length) {
        return match.sizes;
      }
    }
    const line = LINE_INFO[v.lineId] || LINE_INFO.pf;
    return line.sizes.map((sz) => ({
      size: sz,
      sku: `${product.id}_${v.lineId}_${v.colorId}_${sz.toLowerCase()}`,
      status: 'PRE_COMPRA',
      label: '● Envio em 7 a 10 dias úteis',
      lead: '7 a 10 dias úteis',
    }));
  }

  function renderSelectors() {
    const v = product.variants[state.variantIdx] || product.variants[0];
    const lineInfo = LINE_INFO[v.lineId] || LINE_INFO.pf;

    // Unique colors available for this product
    const colorsSeen = [];
    product.variants.forEach((vr) => {
      if (!colorsSeen.includes(vr.colorId)) colorsSeen.push(vr.colorId);
    });

    const colorWrap = document.getElementById('p-color-swatches');
    const colorNameEl = document.getElementById('p-color-name');
    if (colorNameEl) {
      const meta = COLOR_META[v.colorId] || { label: v.colorId };
      colorNameEl.textContent = v.colorwayLabel ? `${v.colorwayLabel} (${meta.label})` : meta.label;
    }
    if (colorWrap) {
      colorWrap.innerHTML = colorsSeen.map((cid) => {
        const meta = COLOR_META[cid] || { label: cid, hex: '#222', border: '#555' };
        const isSel = cid === v.colorId;
        return `<button type="button" class="swatch-btn ${isSel ? 'active' : ''}" title="${esc(meta.label)}" onclick="tiwSelectColor('${esc(cid)}')" style="background:${meta.hex};border-color:${isSel ? '#C5A880' : meta.border};">${isSel ? `<span style="color:${cid === 'branco' || cid === 'offwhite' ? '#111' : '#fff'};">✓</span>` : ''}</button>`;
      }).join('');
    }

    // Lines available for the selected color (or all 3 lines switching to valid color)
    const linesWrap = document.getElementById('p-line-btns');
    if (linesWrap) {
      const lineOrder = ['pf', 'casca', 'espacoso'];
      linesWrap.innerHTML = lineOrder.map((lid) => {
        const info = LINE_INFO[lid];
        const exists = product.variants.some((vr) => vr.lineId === lid);
        if (!exists) return '';
        const isSel = v.lineId === lid;
        return `<button type="button" class="line-btn ${isSel ? 'active' : ''}" onclick="tiwSelectLine('${lid}')">
          <span>${esc(info.short)}</span>
          <span class="mono">R$ ${info.price}</span>
        </button>`;
      }).join('');
    }

    // Sizes & live stock badge
    const sizes = getSizesForVariant(state.variantIdx);
    if (state.sizeIdx >= sizes.length) state.sizeIdx = 0;
    const activeSize = sizes[state.sizeIdx] || sizes[0];

    const sizesWrap = document.getElementById('p-size-btns');
    if (sizesWrap) {
      sizesWrap.innerHTML = sizes.map((sz, i) => {
        const isSel = i === state.sizeIdx;
        const immDot = sz.status === 'PRONTA_ENTREGA' ? '<span class="dot-imm" title="Pronta-entrega 24h"></span>' : '';
        return `<button type="button" class="size-btn ${isSel ? 'active' : ''}" onclick="tiwSelectSize(${i})">${esc(sz.size)}${immDot}</button>`;
      }).join('');
    }

    const priceEl = document.getElementById('p-price-display');
    if (priceEl) {
      if (state.coupon && state.coupon.discount_pct > 0) {
        const discPrice = Number(((lineInfo.price * (100 - state.coupon.discount_pct)) / 100).toFixed(2));
        priceEl.innerHTML = `<span class="price-old">R$ ${lineInfo.price}</span> <span class="price-now">${fmtMoney(discPrice)}</span> <span class="coupon-tag">${esc(state.coupon.code)} -${state.coupon.discount_pct}%</span>`;
      } else {
        priceEl.innerHTML = `<span class="price-now">R$ ${lineInfo.price}</span>`;
      }
    }

    const badgeEl = document.getElementById('p-stock-badge');
    if (badgeEl && activeSize) {
      const cls = activeSize.status === 'PRONTA_ENTREGA' ? 'stock-imm' : (activeSize.status === 'ENVIO_3_DIAS' ? 'stock-3d' : 'stock-pre');
      badgeEl.className = 'stock-badge ' + cls;
      badgeEl.textContent = activeSize.label;
    }

    const ctaEl = document.getElementById('p-buy-btn');
    if (ctaEl && activeSize) {
      ctaEl.textContent = activeSize.status === 'PRONTA_ENTREGA'
        ? 'COMPRAR · ENVIO IMEDIATO (24H) →'
        : 'COMPRAR · PIX OU ATÉ 12X →';
    }
  }

  window.tiwSelectColor = function (colorId) {
    const cur = product.variants[state.variantIdx] || product.variants[0];
    let idx = product.variants.findIndex((vr) => vr.colorId === colorId && vr.lineId === cur.lineId);
    if (idx < 0) idx = product.variants.findIndex((vr) => vr.colorId === colorId);
    if (idx >= 0) {
      state.variantIdx = idx;
      const chosen = product.variants[idx];
      if (typeof chosen.imgFrom === 'number') {
        state.imgIdx = chosen.imgFrom;
        renderGallery();
      }
      renderSelectors();
    }
  };

  window.tiwSelectLine = function (lineId) {
    const cur = product.variants[state.variantIdx] || product.variants[0];
    let idx = product.variants.findIndex((vr) => vr.lineId === lineId && vr.colorId === cur.colorId);
    if (idx < 0) idx = product.variants.findIndex((vr) => vr.lineId === lineId);
    if (idx >= 0) {
      state.variantIdx = idx;
      const sizes = getSizesForVariant(idx);
      const imm = sizes.findIndex((s) => s.status === 'PRONTA_ENTREGA');
      state.sizeIdx = imm >= 0 ? imm : 0;
      const chosen = product.variants[idx];
      if (typeof chosen.imgFrom === 'number') {
        state.imgIdx = chosen.imgFrom;
        renderGallery();
      }
      renderSelectors();
    }
  };

  window.tiwSelectSize = function (idx) {
    state.sizeIdx = idx;
    renderSelectors();
  };

  /* ================= SHARE WITH COUPON PRESERVATION ================= */
  window.tiwShareProduct = function () {
    const base = `https://tiwshirts.space/camiseta/${product.slug}`;
    const url = state.coupon && state.coupon.code
      ? `${base}?cupom=${encodeURIComponent(state.coupon.code)}`
      : base;
    if (navigator.share) {
      navigator.share({ title: `Camiseta ${product.name} · TiwShirts`, text: product.desc, url }).catch(() => {});
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => showToast('Link da peça copiado!'));
    }
  };

  /* ================= COUPONS (7-DAY ATTRIBUTION) ================= */
  async function validateCouponCode(code, silent) {
    const clean = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!clean) return false;
    try {
      const resp = await fetch(`/api/coupons?code=${encodeURIComponent(clean)}`);
      const data = await resp.json();
      if (data && data.valid && data.coupon) {
        state.coupon = data.coupon;
        try {
          localStorage.setItem(COUPON_STORAGE_KEY, JSON.stringify({
            ...data.coupon,
            saved_at: Date.now(),
          }));
        } catch (e) {}
        renderSelectors();
        renderCheckoutSummary();
        if (!silent) showToast(`Cupom ${data.coupon.code} aplicado (-${data.coupon.discount_pct}%)!`);
        return true;
      }
      if (!silent) showToast((data && data.message) || 'Cupom inválido ou inativo.');
      return false;
    } catch (e) {
      return false;
    }
  }

  function initCouponAttribution() {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('cupom') || params.get('ref');
    if (urlCode) {
      validateCouponCode(urlCode, true);
      return;
    }
    try {
      const raw = localStorage.getItem(COUPON_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.code && (!parsed.saved_at || Date.now() - parsed.saved_at < COUPON_TTL_MS)) {
        state.coupon = parsed;
        renderSelectors();
      }
    } catch (e) {}
  }

  window.tiwApplyCheckoutCoupon = async function () {
    const inp = document.getElementById('ck-coupon-input');
    if (!inp) return;
    await validateCouponCode(inp.value, false);
  };

  window.tiwRemoveCoupon = function () {
    state.coupon = null;
    try { localStorage.removeItem(COUPON_STORAGE_KEY); } catch (e) {}
    renderSelectors();
    renderCheckoutSummary();
  };

  /* ================= SHIPPING (MELHOR ENVIO) ================= */
  window.tiwQuoteShipping = async function (sourceId) {
    const inp = document.getElementById(sourceId || 'p-cep-input') || document.getElementById('ck-cep');
    const cleanCep = String((inp && inp.value) || state.lastCep || '').replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      showToast('Digite um CEP válido com 8 números.');
      return;
    }
    state.lastCep = cleanCep;
    const other1 = document.getElementById('p-cep-input');
    const other2 = document.getElementById('ck-cep');
    if (other1) other1.value = cleanCep;
    if (other2) other2.value = cleanCep;

    const pBox = document.getElementById('p-ship-results');
    const ckBox = document.getElementById('ck-ship-results');
    if (pBox) { pBox.style.display = 'block'; pBox.innerHTML = '<div class="muted mono">Cotando Melhor Envio...</div>'; }
    if (ckBox) { ckBox.style.display = 'block'; ckBox.innerHTML = '<div class="muted mono">Cotando Melhor Envio...</div>'; }

    const v = product.variants[state.variantIdx] || product.variants[0];
    const lineInfo = LINE_INFO[v.lineId] || LINE_INFO.pf;

    try {
      const resp = await fetch('/api/shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_cep: cleanCep,
          items: [{ sku: `${product.id}_${v.lineId}`, qty: state.qty, price: lineInfo.price }],
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success || !Array.isArray(data.options) || !data.options.length) {
        const errHtml = `<div class="err-inline">${esc((data && data.error) || 'Não foi possível cotar.')}</div>`;
        if (pBox) pBox.innerHTML = errHtml;
        if (ckBox) ckBox.innerHTML = errHtml;
        return;
      }
      state.shippingOptions = data.options.slice(0, 5);
      state.selectedShippingIdx = 0;
      state.shippingDest = data.destination || null;

      if (data.destination && data.destination.city) {
        const addrEl = document.getElementById('ck-address');
        if (addrEl && !addrEl.value.trim()) {
          addrEl.value = [
            data.destination.street ? data.destination.street + ', Nº ' : '',
            data.destination.neighborhood || '',
            `${data.destination.city}/${data.destination.uf || ''}`,
          ].filter(Boolean).join(' - ');
        }
      }
      renderShippingOptions();
      renderCheckoutSummary();
    } catch (e) {
      showToast('Erro ao cotar frete.');
    }
  };

  function renderShippingOptions() {
    const destTxt = state.shippingDest && state.shippingDest.city
      ? `${state.shippingDest.city}/${state.shippingDest.uf}`
      : state.lastCep;
    const html = state.shippingOptions.length
      ? `<div class="ship-dest">Destino: ${esc(destTxt)} · Melhor Envio</div>` +
        state.shippingOptions.map((opt, idx) => {
          const isSel = idx === state.selectedShippingIdx;
          return `<button type="button" class="ship-opt ${isSel ? 'active' : ''}" onclick="tiwSelectShipping(${idx})">
            <span>${isSel ? '● ' : '○ '}${esc(opt.company)} ${esc(opt.name)} · até ${opt.delivery_days}d úteis</span>
            <strong>${fmtMoney(opt.price)}</strong>
          </button>`;
        }).join('')
      : '';
    ['p-ship-results', 'ck-ship-results'].forEach((id) => {
      const box = document.getElementById(id);
      if (box) {
        box.style.display = html ? 'flex' : 'none';
        box.innerHTML = html;
      }
    });
  }

  window.tiwSelectShipping = function (idx) {
    state.selectedShippingIdx = idx;
    renderShippingOptions();
    renderCheckoutSummary();
  };

  /* ================= CHECKOUT DRAWER ================= */
  window.tiwOpenCheckout = function () {
    const overlay = document.getElementById('ck-overlay');
    if (!overlay) return;
    state.orderResult = null;
    document.getElementById('ck-form-view').style.display = 'block';
    document.getElementById('ck-result-view').style.display = 'none';
    renderCheckoutSummary();
    renderShippingOptions();
    overlay.classList.add('open');
  };

  window.tiwCloseCheckout = function () {
    const overlay = document.getElementById('ck-overlay');
    if (overlay) overlay.classList.remove('open');
  };

  window.tiwChangeQty = function (delta) {
    state.qty = Math.max(1, state.qty + delta);
    renderCheckoutSummary();
    if (state.lastCep && state.lastCep.length === 8) {
      window.tiwQuoteShipping('ck-cep');
    }
  };

  window.tiwSelectPayMethod = function (method) {
    state.paymentMethod = method;
    document.getElementById('ck-pay-pix').classList.toggle('active', method === 'pix');
    document.getElementById('ck-pay-card').classList.toggle('active', method === 'card');
  };

  function renderCheckoutSummary() {
    const v = product.variants[state.variantIdx] || product.variants[0];
    const sizes = getSizesForVariant(state.variantIdx);
    const sz = sizes[state.sizeIdx] || sizes[0];
    const lineInfo = LINE_INFO[v.lineId] || LINE_INFO.pf;
    const discPct = state.coupon ? Number(state.coupon.discount_pct || 0) : 0;
    const subtotal = lineInfo.price * state.qty;
    const productsTotal = Number(((subtotal * (100 - discPct)) / 100).toFixed(2));
    const discountAmt = Number((subtotal - productsTotal).toFixed(2));
    const ship = state.shippingOptions[state.selectedShippingIdx] || null;
    const shipAmt = ship ? Number(ship.price || 0) : 0;
    const total = Number((productsTotal + shipAmt).toFixed(2));

    const itemEl = document.getElementById('ck-item-summary');
    if (itemEl) {
      itemEl.innerHTML = `
        <div style="flex:1;">
          <div style="font-weight:700;font-size:14px;">${esc(product.name)}</div>
          <div class="muted mono" style="margin-top:2px;">${esc(v.fit)} · Tam ${esc(sz.size)}</div>
        </div>
        <div class="qty-box">
          <button type="button" onclick="tiwChangeQty(-1)">−</button>
          <span class="mono">${state.qty}</span>
          <button type="button" onclick="tiwChangeQty(1)">+</button>
        </div>
      `;
    }

    const cpBox = document.getElementById('ck-coupon-box');
    if (cpBox) {
      cpBox.innerHTML = state.coupon
        ? `<div class="coupon-applied"><span>✓ ${esc(state.coupon.code)} (-${state.coupon.discount_pct}% · ${esc(state.coupon.partner_name)})</span><button type="button" onclick="tiwRemoveCoupon()">✕</button></div>`
        : `<div style="display:flex;gap:8px;"><input id="ck-coupon-input" type="text" placeholder="Cupom de parceiro (ex: TIW10)" style="flex:1;text-transform:uppercase;font-family:'JetBrains Mono',monospace;" /><button type="button" class="btn-light" onclick="tiwApplyCheckoutCoupon()">APLICAR</button></div>`;
    }

    const totEl = document.getElementById('ck-totals');
    if (totEl) {
      totEl.innerHTML = `
        <div class="tot-row"><span>Subtotal peças</span><span class="mono">${fmtMoney(subtotal)}</span></div>
        ${discountAmt > 0 ? `<div class="tot-row green"><span>Desconto (${esc(state.coupon.code)})</span><span class="mono">− ${fmtMoney(discountAmt)}</span></div>` : ''}
        ${ship ? `<div class="tot-row sand"><span>Frete (${esc(ship.company)} ${esc(ship.name)})</span><span class="mono">+ ${fmtMoney(shipAmt)}</span></div>` : ''}
        <div class="tot-row grand"><span>TOTAL DO PEDIDO</span><span class="mono">${fmtMoney(total)}</span></div>
      `;
    }
  }

  window.tiwSubmitOrder = async function (e) {
    e.preventDefault();
    const btn = document.getElementById('ck-submit-btn');
    const errBox = document.getElementById('ck-error');
    if (errBox) errBox.style.display = 'none';

    const name = document.getElementById('ck-name').value.trim();
    const cpf = document.getElementById('ck-cpf').value.trim();
    const email = document.getElementById('ck-email').value.trim();
    const phone = document.getElementById('ck-phone').value.trim();
    const cep = document.getElementById('ck-cep').value.trim();
    const address = document.getElementById('ck-address').value.trim();

    if (cep.replace(/\D/g, '').length === 8 && !state.shippingOptions.length) {
      await window.tiwQuoteShipping('ck-cep');
    }

    const v = product.variants[state.variantIdx] || product.variants[0];
    const sizes = getSizesForVariant(state.variantIdx);
    const sz = sizes[state.sizeIdx] || sizes[0];
    const lineInfo = LINE_INFO[v.lineId] || LINE_INFO.pf;
    const ship = state.shippingOptions[state.selectedShippingIdx] || null;

    btn.disabled = true;
    btn.textContent = 'GERANDO PEDIDO...';

    try {
      const resp = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: { name, cpf, email, phone, cep, address },
          items: [{
            sku: sz.sku,
            qty: state.qty,
            price: lineInfo.price,
            name: product.name,
            fit: v.fit,
            size: sz.size,
            lead: sz.lead,
          }],
          shipping: ship,
          coupon_code: state.coupon ? state.coupon.code : null,
          payment_method: state.paymentMethod,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        if (errBox) { errBox.textContent = (data && data.error) || 'Não foi possível criar o pedido.'; errBox.style.display = 'block'; }
        return;
      }
      state.orderResult = data;
      if (state.paymentMethod === 'card' && data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      document.getElementById('ck-form-view').style.display = 'none';
      const resView = document.getElementById('ck-result-view');
      resView.style.display = 'block';
      resView.innerHTML = `
        <div class="res-head">
          <span class="mono green">✓ PEDIDO ${esc(data.order_id)}</span>
          <strong class="mono">${fmtMoney(data.total)}</strong>
        </div>
        <div class="pix-box">
          <div class="mono sand" style="font-size:11px;margin-bottom:10px;">ESCANEIE O QR CODE OU COPIE O PIX COPIA E COLA</div>
          <img src="${esc(data.pix_qr_url)}" alt="QR Code Pix" class="pix-qr" />
          <input id="ck-pix-code" type="text" readonly value="${esc(data.pix_code)}" style="width:100%;margin-top:10px;font-family:'JetBrains Mono',monospace;font-size:11px;" />
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
            <button type="button" class="btn-light" style="flex:1;" onclick="navigator.clipboard && navigator.clipboard.writeText(document.getElementById('ck-pix-code').value).then(()=>showToast('Pix copiado!'))">COPIAR PIX</button>
            <a href="${esc(data.wa_url)}" target="_blank" rel="noopener" class="btn-green" style="flex:1;text-align:center;text-decoration:none;">ENVIAR COMPROVANTE ↗</a>
          </div>
          ${data.checkout_url ? `<a href="${esc(data.checkout_url)}" class="btn-outline" style="display:block;text-align:center;margin-top:8px;text-decoration:none;">PREFERE CARTÃO EM ATÉ 12X? ABRIR INFINITEPAY →</a>` : ''}
        </div>
      `;
    } catch (err) {
      if (errBox) { errBox.textContent = 'Erro de conexão: ' + err.message; errBox.style.display = 'block'; }
    } finally {
      btn.disabled = false;
      btn.textContent = 'PAGAR E FINALIZAR PEDIDO →';
    }
  };

  /* ================= INIT ================= */
  async function init() {
    renderGallery();
    initCouponAttribution();
    renderSelectors();

    // Auto-quote when 8 digits typed
    ['p-cep-input', 'ck-cep'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          const clean = el.value.replace(/\D/g, '');
          if (clean.length === 8 && clean !== state.lastCep) window.tiwQuoteShipping(id);
        });
      }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.tiwCloseCheckout();
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (e.key === 'ArrowLeft') window.tiwGalleryStep(-1);
      if (e.key === 'ArrowRight') window.tiwGalleryStep(1);
    });

    // Live stock hydration
    try {
      const resp = await fetch('/api/catalog');
      const data = await resp.json();
      if (data && Array.isArray(data.products)) {
        state.catalogProduct = data.products.find((p) => p.id === product.id) || null;
        if (state.catalogProduct) {
          // Prefer variant with immediate stock (24h)
          for (let vi = 0; vi < product.variants.length; vi++) {
            const sizes = getSizesForVariant(vi);
            const imm = sizes.findIndex((s) => s.status === 'PRONTA_ENTREGA');
            if (imm >= 0) {
              state.variantIdx = vi;
              state.sizeIdx = imm;
              if (typeof product.variants[vi].imgFrom === 'number') {
                state.imgIdx = product.variants[vi].imgFrom;
                renderGallery();
              }
              break;
            }
          }
          renderSelectors();
        }
      }
    } catch (e) {}
  }

  init();
})();
