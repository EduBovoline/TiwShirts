/* ========================
   LOJA INTERATIVA JS
   TiwShirts Drop #01 - Nova Coleção
======================== */

const ASSETS_PATH = 'Assets/';

/* ---- CATÁLOGO DE PRODUTOS ---- */
// colors: array das cores disponíveis para cada estampa com base nas novas imagens
const PRINTS = {
    '1': {
        name: 'MACONHEIRO',
        description: 'A arte que não esconde o que o mundo já sabe. Uma tipografia crua, direta, pra quem cansa de eufemismos. Expressão pura de quem entende que o bagulho é sério, mas a mente é livre.',
        file: 'Assets/Maco nheiro 1x1 Tiwshirts image.webp',
        price: 105,
        colors: ['bege', 'Verde'],
        stock: 20,
        mockups: {
            'bege': 'tshirt Mockup in model - Areia - MACO NHEIRO - TiwDoo TiwShirts drop#1.webp',
            'Verde': 'tshirt Mockup in model Verde 2 - TiwDoo TiwShirts drop#1.webp'
        }
    },
    '2': {
        name: 'NÃO SOMOS MÁ PESSOA',
        description: 'O choque visual entre a estética da "lei e ordem" e a realidade de quem só quer viver em paz. Uma sátira à hipocrisia social que julga pela aparência. Somos gente boa, só não somos otários.',
        file: 'Assets/Não somos má pessoa 1x1 Tiwshirts image.webp',
        price: 105,
        colors: ['bege', 'preto'],
        stock: 20,
        mockups: {
            'bege': 'tshirt Mockup in model bege - Somos gente boa - TiwDoo TiwShirts drop#1.webp',
            'preto': 'tshirt Mockup in model preto 4 - TiwDoo TiwShirts drop#1.webp'
        }
    },
    '3': {
        name: 'JUST DOOB IT',
        description: 'A paródia definitiva. O "swoosh" reimaginado para o ritmo de quem não tem pressa. Uma mensagem pra quem age, mas age no seu próprio tempo, com a leveza de um doob bem bolado.',
        file: 'Assets/Just Doob It 1x1 Tiwshirts image.webp',
        price: 105,
        colors: ['bege', 'preto', 'Verde'],
        stock: 20,
        mockups: {
            'bege': 'tshirt Mockup in model - Areia - Just Doob it 1 - TiwDoo TiwShirts drop#1.webp',
            'preto': 'tshirt Mockup in model preto 3 - TiwDoo TiwShirts drop#1.webp',
            'Verde': 'tshirt Mockup in model Verde 3 - TiwDoo TiwShirts drop#1.webp'
        }
    },
    '4': {
        name: 'MACONHA SALVA VIDAS',
        description: 'Estudo, ciência e verdade. Uma estampa que traz a estética da "redenção" e do cuidado. A mensagem é clara: o que proíbem por ignorância, salva por evidência. O verde é o novo remédio.',
        file: 'Assets/Maconha salva Vidas 1x1 Tiwshirts image.webp',
        price: 105,
        colors: ['preto', 'Verde', 'bege'],
        stock: 20,
        mockups: {
            'preto': 'tshirt Mockup in model preto - MACONHA SALVA VIDAS - TiwDoo TiwShirts drop#1.webp',
            'Verde': 'tshirt Mockup in model Verde - MACONHA SALVA VIDAS - TiwDoo TiwShirts drop#1.webp',
            'bege': 'tshirt Mockup in model bege 5 - TiwDoo TiwShirts drop#1.webp'
        }
    },
    '5': {
        name: 'LEGALIZA PRA POBRE',
        description: 'A crítica social necessária. A legalização que só atende o asfalto é privilégio, não é justiça. Uma arte que grita pela igualdade no acesso e no direito. Se não for pra todos, não é legal.',
        file: 'Assets/Legaliza pra pobre tbm 1x1 Tiwshirts image.webp',
        price: 105,
        colors: ['preto', 'bege', 'Verde'],
        stock: 20,
        mockups: {
            'preto': 'tshirt Mockup in model preto - LEGALIZA PRA POBRE TBM - TiwDoo TiwShirts drop#1.webp',
            'bege': 'tshirt Mockup in model bege - legaliza pra pobre tbm - TiwDoo TiwShirts drop#1.webp',
            'Verde': 'tshirt Mockup in model Verde 5 - TiwDoo TiwShirts drop#1.webp'
        }
    }
};

const COLORS = {
    'preto': { label: 'Preto', hex: '#1a1a1a' },
    'bege':  { label: 'Bege / Areia',  hex: '#d1c5b4' },
    'Verde': { label: 'Verde', hex: '#2b3d2c' }
};

const BGS = {
    '1': 'tshirt scennery Mockup 5 - TiwDoo TiwShirts drop #1.webp',
    '2': 'tshirt scennery Mockup 4 - TiwDoo TiwShirts drop #1.webp',
    '3': 'tshirt scennery Mockup 3 - TiwDoo TiwShirts drop #1.webp',
    '4': 'tshirt scennery Mockup 2 - TiwDoo TiwShirts drop #1.webp',
    '5': 'tshirt scennery Mockup 1 - TiwDoo TiwShirts drop #1.webp'
};

// BAG: preço total
const BAG_PRICE = 475;

/* ---- ESTADO ATUAL ---- */
let currentState = {
    mode:  'single', // 'single' | 'bag'
    print: '1',
    color: 'preto',
    size:  'M',
    bg:    '1',
    bagConfig: {
        '1': { color: 'preto', size: 'M' },
        '2': { color: 'bege', size: 'M' },
        '3': { color: 'bege', size: 'M' },
        '4': { color: 'bege', size: 'M' },
        '5': { color: 'preto', size: 'M' }
    }
};

let cart = [];

/* ---- DOM REFS ---- */
const modelsCarousel = document.getElementById('modelsCarousel');
const layerBg        = document.getElementById('layer-bg');
const loadingOverlay = document.getElementById('loadingOverlay');
const productTitle   = document.getElementById('productTitle');
const productPrice   = document.getElementById('productPrice');
const productDescription = document.getElementById('productDescription');
const stockBadge     = document.getElementById('stockBadge');

/* ---- HELPERS ---- */
function loadImage(el, rawSrc) {
    if (!rawSrc) return Promise.resolve();
    const src = rawSrc.replace(/#/g, '%23');
    return new Promise(resolve => {
        if (el.src.endsWith(src) || el.src.includes(src)) { resolve(); return; }
        el.onload  = resolve;
        el.onerror = resolve;
        el.src = src;
    });
}

function formatPrice(val) {
    return 'R$ ' + val.toLocaleString('pt-BR');
}

function getCalculatedPrice(basePrice, size) {
    return ['G1', 'G2', 'G3'].includes(size) ? basePrice + 27 : basePrice;
}

// Guarda se o carrossel dos produtos já foi gerado
let carouselCreated = false;

function createCarousel() {
    if (!modelsCarousel) return;
    modelsCarousel.innerHTML = '';
    
    Object.keys(PRINTS).forEach(id => {
        const p = PRINTS[id];
        const img = document.createElement('img');
        img.className = 'carousel-model';
        img.dataset.print = id;
        
        img.addEventListener('click', () => {
            if (currentState.print !== id) {
                // Clicou em um produto lateral: troca para ele
                currentState.print = id;
                
                // Atualiza o botão lateral correspondente
                document.querySelectorAll('.print-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.print === id);
                });
                
                if (currentState.mode === 'bag') {
                    setMode('single');
                } else {
                    updateComposite();
                }
            }
        });
        modelsCarousel.appendChild(img);
    });
    carouselCreated = true;
}

/* ---- VIEWER ---- */
function updateComposite() {
    if (!modelsCarousel || !layerBg) return;

    const bgFile = BGS[currentState.bg];

    if (currentState.mode === 'bag') {
        // No bag mode, the preview is handled by the wizard
        return;
    }

    if (!carouselCreated) createCarousel();

    const p = PRINTS[currentState.print];
    if (!p.colors.includes(currentState.color)) {
        currentState.color = p.colors[0];
    }

    loadingOverlay.classList.add('active');
    
    // 1. Atualizar o Cenário de Fundo
    const bgPromise = loadImage(layerBg, ASSETS_PATH + bgFile);

    // 2. Renderizar Carrossel de PRODUTOS
    let mockupPromises = [];
    
    const printKeys = Object.keys(PRINTS); // ['1', '2', '3', '4', '5']
    const activeIdx = printKeys.indexOf(currentState.print);
    const total = printKeys.length;

    Array.from(modelsCarousel.children).forEach((img, idx) => {
        const id = img.dataset.print;
        const printData = PRINTS[id];

        img.className = 'carousel-model'; // reseta

        if (idx === activeIdx) {
            img.classList.add('active');
            // O modelo central usa a cor selecionada nos botões
            const mockupFile = printData.mockups[currentState.color];
            mockupPromises.push(loadImage(img, ASSETS_PATH + mockupFile));
        } else {
            // Modelos laterais usam a cor padrão (primeira da lista deles)
            const defaultCol = printData.colors[0];
            const mockupFile = printData.mockups[defaultCol];
            mockupPromises.push(loadImage(img, ASSETS_PATH + mockupFile));

            // Aplica posições do carrossel circular
            if (idx === (activeIdx - 1 + total) % total) {
                img.classList.add('prev');
            } else if (idx === (activeIdx + 1) % total) {
                img.classList.add('next');
            } else {
                img.classList.add('hidden');
            }
        }
    });

    Promise.all([bgPromise, ...mockupPromises]).then(() => {
        loadingOverlay.classList.remove('active');
    });

    productTitle.textContent = p.name;
    if (productDescription) productDescription.textContent = p.description;
    updatePriceDisplay();

    // Stock badge
    if (p.stock <= 5) {
        stockBadge.textContent = `⚠ ${p.stock} restante${p.stock !== 1 ? 's' : ''}`;
        stockBadge.className = 'stock-badge low';
    } else {
        stockBadge.textContent = `${p.stock} / 20 disponíveis`;
        stockBadge.className = 'stock-badge';
    }

    // Rebuild color buttons para a estampa central
    rebuildColorSelector(p.colors);
}

/* ---- REBUILD SELECTORS ---- */
function rebuildColorSelector(availableColors) {
    const el = document.getElementById('colorSelector');
    if (!el) return;
    el.innerHTML = '';
    availableColors.forEach(c => {
        const col = COLORS[c];
        const btn = document.createElement('button');
        btn.className = 'color-btn' + (c === currentState.color ? ' active' : '');
        btn.dataset.color = c;
        btn.style.background = col.hex;
        btn.title = col.label;
        btn.addEventListener('click', () => {
            el.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentState.color = c;
            updateComposite();
        });
        el.appendChild(btn);
    });
}

/* ---- BAG CONFIGURATOR (WIZARD) ---- */

// State for the wizard
let bagWizardStep = 0; // Which print we are currently
function updatePriceDisplay() {
    if (currentState.mode === 'single' && productPrice) {
        const p = PRINTS[currentState.print];
        if (p) {
            productPrice.textContent = formatPrice(getCalculatedPrice(p.price, currentState.size));
        }
    }
}

/* ---- BAG MODE ---- */
const BAG_PRINT_KEYS = Object.keys(PRINTS); // ['1','2','3','4','5']

function buildBagConfigurator() {
    bagWizardStep = 0;
    // Reset all selections to default
    BAG_PRINT_KEYS.forEach(id => {
        currentState.bagConfig[id].color = PRINTS[id].colors[0];
    });
    renderBagWizard();
}

function renderBagWizard() {
    const container = document.getElementById('bagItems');
    if (!container) return;

    const allDone = bagWizardStep >= BAG_PRINT_KEYS.length;

    // Update title/price
    productTitle.textContent = 'BAG OF DROP — TODAS AS ESTAMPAS';
    productPrice.textContent = formatPrice(BAG_PRICE);
    if (productDescription) productDescription.textContent = 'O drop inteiro em um único pack. 5 camisetas exclusivas, numeradas, com a bag física incluída e frete grátis para todo o Brasil.';
    stockBadge.textContent = '';

    if (allDone) {
        // Show final summary gallery in the preview area
        renderBagSummaryPreview();
        renderBagSummaryList(container);
        return;
    }

    // Show the current step mockup in the preview
    renderBagStepPreview();

    // Build wizard UI in the sidebar
    const currentId   = BAG_PRINT_KEYS[bagWizardStep];
    const currentPrint = PRINTS[currentId];

    container.innerHTML = `
        <div class="bag-wizard">
            <!-- Progress bar -->
            <div class="bag-wizard-progress">
                ${BAG_PRINT_KEYS.map((id, i) => `
                    <div class="bag-wizard-pip ${i < bagWizardStep ? 'done' : ''} ${i === bagWizardStep ? 'active' : ''}"></div>
                `).join('')}
            </div>

            <!-- Step label -->
            <p class="bag-wizard-step-label">Estampa ${bagWizardStep + 1} de ${BAG_PRINT_KEYS.length}</p>

            <!-- Current print card -->
            <div class="bag-wizard-card">
                <img src="${currentPrint.file}" class="bag-wizard-thumb" alt="${currentPrint.name}">
                <div class="bag-wizard-info">
                    <span class="bag-wizard-name">${currentPrint.name}</span>
                    <p class="bag-wizard-desc" style="font-size: 11px; color: #888; margin-top: 4px; line-height: 1.4;">${currentPrint.description}</p>
                    <span class="bag-wizard-hint" style="display: block; margin-top: 8px;">Escolha a cor desta peça:</span>
                </div>
            </div>

            <!-- Color options -->
            <div class="bag-wizard-colors" id="bagWizardColors"></div>

            <!-- Locked selections so far -->
            ${bagWizardStep > 0 ? `
            <div class="bag-wizard-locked">
                ${BAG_PRINT_KEYS.slice(0, bagWizardStep).map(id => {
                    const lp  = PRINTS[id];
                    const cfg = currentState.bagConfig[id];
                    const col = COLORS[cfg.color];
                    return `
                        <div class="bag-locked-item">
                            <img src="${ASSETS_PATH + lp.mockups[cfg.color].replace(/#/g, '%23')}" alt="${lp.name}">
                            <span class="bag-locked-color" style="background:${col.hex};" title="${col.label}"></span>
                        </div>
                    `;
                }).join('')}
            </div>` : ''}
        </div>
    `;

    // Build color buttons
    const colorRow = container.querySelector('#bagWizardColors');
    currentPrint.colors.forEach(c => {
        const col = COLORS[c];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bag-wizard-color-btn' + (c === currentState.bagConfig[currentId].color ? ' active' : '');
        btn.style.background = col.hex;
        btn.title = col.label;
        btn.dataset.color = c;
        btn.innerHTML = `<span class="bag-wizard-color-label">${col.label}</span>`;
        btn.addEventListener('click', () => {
            colorRow.querySelectorAll('.bag-wizard-color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentState.bagConfig[currentId].color = c;
            _refreshBagOverlayModels(); // Update preview without reloading bg
        });
        colorRow.appendChild(btn);
    });

    // Add confirm button
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'bag-wizard-confirm';
    confirmBtn.textContent = bagWizardStep < BAG_PRINT_KEYS.length - 1
        ? `Confirmar e ver próxima →`
        : `✓ Confirmar e ver minha BAG`;
    confirmBtn.addEventListener('click', () => {
        bagWizardStep++;
        renderBagWizard();
    });
    container.querySelector('.bag-wizard').appendChild(confirmBtn);
}

function renderBagStepPreview() {
    // Keep the background and any already-confirmed models.
    // Only rebuild if this is the very first step (nothing yet).
    const bgFile = ASSETS_PATH + BGS[currentState.bg];

    if (bagWizardStep === 0) {
        // First step: load the bg and show the first model on top.
        loadingOverlay.classList.add('active');
        modelsCarousel.innerHTML = '';
        carouselCreated = false;

        loadImage(layerBg, bgFile).then(() => {
            _refreshBagOverlayModels();
            loadingOverlay.classList.remove('active');
        });
    } else {
        // Just refresh the overlay layer for the current step's color change.
        _refreshBagOverlayModels();
    }
}

// Rebuild the overlay images in the carousel for the bag wizard.
// Shows all confirmed models + the current step's model as the "active" one.
function _refreshBagOverlayModels() {
    modelsCarousel.innerHTML = '';
    carouselCreated = false;

    // Positions for up to 5 models spread across the scene
    const positions = [
        { left: '50%', transform: 'translateX(-50%)', zIndex: 5, scale: 1 },       // center
        { left: '30%', transform: 'translateX(-50%)', zIndex: 4, scale: 0.9 },     // left 1
        { left: '70%', transform: 'translateX(-50%)', zIndex: 4, scale: 0.9 },     // right 1
        { left: '10%', transform: 'translateX(-50%)', zIndex: 3, scale: 0.8 },     // far left
        { left: '90%', transform: 'translateX(-50%)', zIndex: 3, scale: 0.8 },     // far right
    ];

    const loads = [];

    // All confirmed models (steps 0 to bagWizardStep-1)
    BAG_PRINT_KEYS.slice(0, bagWizardStep).forEach((id, i) => {
        const cfg  = currentState.bagConfig[id];
        const file = PRINTS[id].mockups[cfg.color];
        const pos  = positions[i + 1] || positions[positions.length - 1]; // shifted: current step takes center
        const img  = _makeBagOverlayImg(ASSETS_PATH + file.replace(/#/g, '%23'), pos, false);
        modelsCarousel.appendChild(img);
        loads.push(new Promise(r => { img.onload = img.onerror = r; }));
    });

    // Current step model in the center (active / highlighted)
    const currentId  = BAG_PRINT_KEYS[bagWizardStep];
    if (currentId) {
        const cfg  = currentState.bagConfig[currentId];
        const file = PRINTS[currentId].mockups[cfg.color];
        const img  = _makeBagOverlayImg(ASSETS_PATH + file.replace(/#/g, '%23'), positions[0], true);
        modelsCarousel.appendChild(img);
        loads.push(new Promise(r => { img.onload = img.onerror = r; }));
    }
}

function _makeBagOverlayImg(src, pos, isActive) {
    const img = document.createElement('img');
    img.src = src;
    img.style.cssText = `
        position: absolute;
        bottom: 0;
        left: ${pos.left};
        transform: ${pos.transform} scale(${pos.scale});
        transform-origin: bottom center;
        height: 90%;
        width: auto;
        max-width: none;
        object-fit: contain;
        z-index: ${pos.zIndex};
        transition: all 0.4s ease;
        filter: drop-shadow(0 8px 24px rgba(0,0,0,0.5));
        opacity: 1;
    `;
    return img;
}

function renderBagSummaryPreview() {
    // All 5 models laid out in the scene together on the background
    loadingOverlay.classList.add('active');
    modelsCarousel.innerHTML = '';
    carouselCreated = false;

    const positions = [
        { left: '50%', transform: 'translateX(-50%)', zIndex: 5, scale: 1 },
        { left: '30%', transform: 'translateX(-50%)', zIndex: 4, scale: 0.9 },
        { left: '70%', transform: 'translateX(-50%)', zIndex: 4, scale: 0.9 },
        { left: '10%', transform: 'translateX(-50%)', zIndex: 3, scale: 0.8 },
        { left: '90%', transform: 'translateX(-50%)', zIndex: 3, scale: 0.8 },
    ];

    const bgFile = ASSETS_PATH + BGS[currentState.bg];
    const loads  = [loadImage(layerBg, bgFile)];

    BAG_PRINT_KEYS.forEach((id, i) => {
        const cfg  = currentState.bagConfig[id];
        const file = PRINTS[id].mockups[cfg.color];
        const pos  = positions[i];
        const img  = _makeBagOverlayImg(ASSETS_PATH + file.replace(/#/g, '%23'), pos, true);
        img.style.filter = 'brightness(1) drop-shadow(0 8px 20px rgba(0,0,0,0.6))';
        img.style.opacity = '1';
        modelsCarousel.appendChild(img);
        loads.push(new Promise(r => { img.onload = img.onerror = r; }));
    });

    Promise.all(loads).then(() => loadingOverlay.classList.remove('active'));
}

function renderBagSummaryList(container) {
    container.innerHTML = `
        <div class="bag-wizard-summary">
            <p class="bag-summary-title">Sua BAG está pronta! 🎉</p>
            <div class="bag-summary-rows">
                ${BAG_PRINT_KEYS.map(id => {
                    const lp  = PRINTS[id];
                    const cfg = currentState.bagConfig[id];
                    const col = COLORS[cfg.color];
                    return `
                        <div class="bag-summary-row">
                            <img src="${lp.file}" class="bag-sum-thumb" alt="${lp.name}">
                            <div class="bag-sum-info">
                                <span class="bag-sum-name">${lp.name}</span>
                                <span class="bag-sum-color">
                                    <span class="bag-sum-dot" style="background:${col.hex}"></span>
                                    ${col.label}
                                </span>
                            </div>
                            <div class="bag-sum-sizes">
                                ${['P','M','G','GG'].map(s => `<button class="size-btn${s === currentState.bagConfig[id].size ? ' active' : ''}" type="button" data-print="${id}" data-size="${s}">${s}</button>`).join('')}
                                <br>
                                ${['G1','G2','G3'].map(s => `<button class="size-btn${s === currentState.bagConfig[id].size ? ' active' : ''}" type="button" data-print="${id}" data-size="${s}">${s}</button>`).join('')}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            <button type="button" class="bag-wizard-restart" onclick="buildBagConfigurator()">← Reconfigar</button>
        </div>
    `;

    // Wire up size buttons in summary
    container.querySelectorAll('.size-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const pid = btn.dataset.print;
            container.querySelectorAll(`.size-btn[data-print="${pid}"]`).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentState.bagConfig[pid].size = btn.dataset.size;
        });
    });
}

function buildBagConfigurator_old() {
    const container = document.getElementById('bagItems');
    container.innerHTML = '';

    Object.keys(PRINTS).forEach(id => {
        const p   = PRINTS[id];
        const cfg = currentState.bagConfig[id];
        
        // Garante cor inicial correta no config da bag
        if (!p.colors.includes(cfg.color)) {
            cfg.color = p.colors[0];
        }

        const row = document.createElement('div');
        row.className = 'bag-item-row';
        row.innerHTML = `
            <div class="bag-item-header">
                <img src="${p.file}" alt="${p.name}" class="bag-item-thumb">
                <span class="bag-item-name">${p.name}</span>
                <span class="bag-item-stock ${p.stock <= 5 ? 'low' : ''}">${p.stock}/20</span>
            </div>
            <div class="bag-item-selectors">
                <div class="bag-color-row" id="bagColor_${id}"></div>
                <div class="bag-size-row" id="bagSize_${id}" style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; gap: 8px;">
                        ${['P','M','G','GG'].map(s =>
                            `<button class="size-btn${s === cfg.size ? ' active' : ''}" type="button"
                                data-print="${id}" data-size="${s}">${s}</button>`
                        ).join('')}
                    </div>
                    <div style="display: flex; gap: 8px;">
                        ${['G1','G2','G3'].map(s =>
                            `<button class="size-btn${s === cfg.size ? ' active' : ''}" type="button"
                                data-print="${id}" data-size="${s}">${s}</button>`
                        ).join('')}
                    </div>
                </div>
            </div>
        `;
        container.appendChild(row);

        const colorRow = row.querySelector(`#bagColor_${id}`);
        p.colors.forEach(c => {
            const col = COLORS[c];
            const btn = document.createElement('button');
            btn.className = 'color-btn small' + (c === cfg.color ? ' active' : '');
            btn.dataset.color = c;
            btn.style.background = col.hex;
            btn.title = col.label;
            btn.addEventListener('click', () => {
                colorRow.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentState.bagConfig[id].color = c;
            });
            colorRow.appendChild(btn);
        });

        row.querySelectorAll('.size-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                row.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentState.bagConfig[id].size = btn.dataset.size;
            });
        });
    });
}

/* ---- MODE SWITCHING ---- */
function setMode(mode) {
    currentState.mode = mode;
    const isBag = mode === 'bag';

    document.getElementById('colorGroup').style.display      = isBag ? 'none' : '';
    document.getElementById('sizeGroup').style.display       = isBag ? 'none' : '';
    document.getElementById('bagConfigurator').style.display = isBag ? '' : 'none';
    document.getElementById('bgSelectorArea').style.display  = isBag ? 'none' : '';

    if (isBag) {
        buildBagConfigurator();
    } else {
        updateComposite();
    }
}

/* ---- EVENT LISTENERS ---- */

// Modal Guia de Medidas
const guideBtn = document.getElementById('guideBtn');
const closeGuideBtn = document.getElementById('closeGuideBtn');
const sizeGuideModal = document.getElementById('sizeGuideModal');

if (guideBtn && closeGuideBtn && sizeGuideModal) {
    guideBtn.addEventListener('click', () => sizeGuideModal.style.display = 'flex');
    closeGuideBtn.addEventListener('click', () => sizeGuideModal.style.display = 'none');
    sizeGuideModal.addEventListener('click', (e) => {
        if (e.target === sizeGuideModal) sizeGuideModal.style.display = 'none';
    });
}

document.querySelectorAll('.print-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.print-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        if (btn.dataset.print === 'bag') {
            setMode('bag');
        } else {
            currentState.print = btn.dataset.print;
            setMode('single');
        }
    });
});

document.querySelectorAll('#sizeSelector .size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#sizeSelector .size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentState.size = btn.dataset.size;
        updatePriceDisplay();
    });
});

document.querySelectorAll('.bg-dot').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.bg-dot').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentState.bg = btn.dataset.bg;
        updateComposite();
    });
});

/* ---- CART LOGIC ---- */
document.getElementById('addToCartBtn').addEventListener('click', function() {
    const btn = this;
    const originalText = btn.innerHTML;
    
    // Feedback visual imediato
    btn.innerHTML = '⚡ ADICIONANDO...';
    btn.style.pointerEvents = 'none';
    btn.style.opacity = '0.8';

    setTimeout(() => {
        if (currentState.mode === 'bag') addBagToCart();
        else addSingleToCart();

        btn.innerHTML = '✓ ADICIONADO!';
        btn.style.background = '#3a6b35';
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.pointerEvents = 'all';
            btn.style.opacity = '1';
            btn.style.background = '';
        }, 1500);
    }, 400); // Pequeno delay simulado para percepção de processamento
});

function addSingleToCart() {
    const p = PRINTS[currentState.print];

    if (p.stock <= 0) {
        alert(`${p.name} está esgotada.`);
        return;
    }

    p.stock--;

    cart.push({
        id: Date.now(),
        type: 'single',
        printId: currentState.print,
        name: p.name,
        color: currentState.color,
        colorLabel: COLORS[currentState.color].label,
        size: currentState.size,
        price: getCalculatedPrice(p.price, currentState.size),
        img: ASSETS_PATH + p.mockups[currentState.color]
    });

    updateCartUI();
    updateComposite(); 
    openCheckout();
}

function addBagToCart() {
    const insufficient = Object.keys(PRINTS).filter(id => PRINTS[id].stock <= 0);
    if (insufficient.length > 0) {
        const names = insufficient.map(id => PRINTS[id].name).join(', ');
        alert(`Estoque insuficiente para: ${names}`);
        return;
    }

    Object.keys(PRINTS).forEach(id => { PRINTS[id].stock--; });

    let finalBagPrice = BAG_PRICE;

    const bagItems = Object.keys(PRINTS).map(id => {
        const p   = PRINTS[id];
        const cfg = currentState.bagConfig[id];
        
        if (['G1', 'G2', 'G3'].includes(cfg.size)) {
            finalBagPrice += 27; // +27 per plus size item in bag
        }

        return {
            id: Date.now() + Number(id),
            type: 'bag',
            bundleId: 'bag-' + Date.now(),
            printId: id,
            name: p.name,
            color: cfg.color,
            colorLabel: COLORS[cfg.color].label,
            size: cfg.size,
            price: 0,
            img: ASSETS_PATH + p.mockups[cfg.color]
        };
    });

    cart.push({
        id: Date.now(),
        type: 'bag-bundle',
        name: 'BAG OF DROP',
        price: finalBagPrice,
        items: bagItems,
        img: bagItems[0].img
    });

    updateCartUI();
    openCheckout();
}

/* ---- CART UI ---- */
function updateCartUI() {
    const countEl = document.getElementById('cartCount');
    const itemsEl = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');

    const itemCount = cart.reduce((acc, i) => acc + (i.type === 'bag-bundle' ? 5 : 1), 0);
    countEl.textContent = itemCount;
    countEl.style.display = itemCount > 0 ? 'flex' : 'none';

    if (cart.length === 0) {
        itemsEl.innerHTML = '<p class="empty-cart">Seu carrinho está vazio.</p>';
        totalEl.textContent = 'R$ 0';
        updateShippingBadge(0);
        return;
    }

    let total = 0;
    itemsEl.innerHTML = cart.map(item => {
        total += item.price;
        if (item.type === 'bag-bundle') {
            return `
                <div class="cart-item cart-item--bag">
                    <img src="${item.img.replace(/#/g, '%23')}" alt="Bag of Drop">
                    <div>
                        <div class="ci-name">🛍️ BAG OF DROP</div>
                        <div class="ci-size">${item.items.map(i => `${i.name.split(' ')[0]} ${i.colorLabel} ${i.size}`).join(' · ')}</div>
                    </div>
                    <div class="ci-price">${formatPrice(item.price)}</div>
                </div>`;
        }
        return `
            <div class="cart-item">
                <img src="${item.img.replace(/#/g, '%23')}" alt="${item.name}">
                <div>
                    <div class="ci-name">${item.name}</div>
                    <div class="ci-size">${item.colorLabel} | ${item.size}</div>
                </div>
                <div class="ci-price">${formatPrice(item.price)}</div>
            </div>`;
    }).join('');

    totalEl.textContent = formatPrice(total);
    updateShippingBadge(itemCount);
    document.getElementById('checkoutBtn').dataset.total = total;
}

function updateShippingBadge(count) {
    const el = document.getElementById('shippingBadge');
    const resultEl = document.getElementById('shippingResult');
    if (!el) return;

    if (count >= 2) {
        el.innerHTML = '🚚 <strong>FRETE GRÁTIS</strong> aplicado!';
        el.className = 'shipping-badge active';
        
        // Se o simulador estiver visível, atualiza para grátis imediatamente
        if (resultEl && resultEl.style.display === 'block') {
            resultEl.innerHTML = `
                <div class="shipping-result-free">
                    🎯 FRETE GRÁTIS LIBERADO!<br>
                    <span style="font-size: 10px; font-weight: 400; opacity: 0.8;">Válido para todo o Brasil neste pedido.</span>
                </div>
            `;
        }
    } else {
        el.innerHTML = '🚚 Adicione <strong>mais 1 peça</strong> para <strong>FRETE GRÁTIS</strong>';
        el.className = 'shipping-badge hint';
    }
}

/* ---- CHECKOUT DRAWER ---- */
function openCheckout() {
    document.getElementById('checkoutDrawer').classList.add('open');
    document.body.style.overflow = 'hidden';
}
function closeCheckout() {
    document.getElementById('checkoutDrawer').classList.remove('open');
    document.body.style.overflow = '';
}
function closeDrawer(e) {
    if (e.target === document.getElementById('checkoutDrawer')) closeCheckout();
}
document.getElementById('cartBtn').addEventListener('click', openCheckout);

/* ---- SHIPPING CALCULATOR ---- */
document.getElementById('calcShippingBtn').addEventListener('click', async () => {
    const cepInput = document.getElementById('cepInput').value.replace(/\D/g, '');
    const resultEl = document.getElementById('shippingResult');
    
    if (cepInput.length !== 8) {
        resultEl.style.display = 'block';
        resultEl.style.color = '#ff4444';
        resultEl.innerHTML = '⚠️ CEP inválido. Digite 8 números.';
        return;
    }

    resultEl.style.display = 'block';
    resultEl.style.color = '#aaa';
    resultEl.innerHTML = 'Calculando...';

    const itemCount = cart.reduce((acc, i) => acc + (i.type === 'bag-bundle' ? 5 : 1), 0);

    if (itemCount >= 2) {
        resultEl.innerHTML = `
            <div class="shipping-result-free">
                🎯 FRETE GRÁTIS LIBERADO!<br>
                <span style="font-size: 10px; font-weight: 400; opacity: 0.8;">Válido para todo o Brasil neste pedido.</span>
            </div>
        `;
        return;
    }

    try {
        const res = await fetch(`https://viacep.com.br/ws/${cepInput}/json/`);
        const data = await res.json();
        
        if (data.erro) throw new Error();

        // Regras simuladas
        const options = [
            { id: 'loggi', name: '⚡ Loggi (Express)', price: 18.50, days: 6 },
            { id: 'jadlog', name: '📦 Jadlog (.Package)', price: 24.00, days: 7 },
            { id: 'pac', name: '📮 Correios (PAC)', price: 35.00, days: 8 }
        ];

        if (data.uf === 'SP') {
            options[0].price = 12.00; options[0].days = 3;
            options[1].price = 13.50; options[1].days = 4;
            options[2].price = 22.00; options[2].days = 5;
        } else if (['RJ', 'MG', 'PR', 'SC', 'RS'].includes(data.uf)) {
            options[0].price = 14.00; options[0].days = 4;
            options[1].price = 15.50; options[1].days = 5;
            options[2].price = 25.00; options[2].days = 6;
        }

        const fmt = val => val.toFixed(2).replace('.', ',');

        resultEl.innerHTML = `
            <div style="margin-bottom: 12px; font-weight: 600; font-size: 11px; text-transform: uppercase; color: #888;">
                Selecione o frete para ${data.localidade}:
            </div>
            <div class="shipping-methods">
                ${options.map(opt => `
                    <button class="shipping-method-card" onclick="selectShipping(this, '${opt.id}')">
                        <div class="method-info">
                            <span class="method-name">${opt.name}</span>
                            <span class="method-time">Até ${opt.days} dias úteis</span>
                        </div>
                        <span class="method-price">R$ ${fmt(opt.price)}</span>
                    </button>
                `).join('')}
            </div>
            <p style="font-size: 10px; color: #666; margin-top: 12px; line-height: 1.4;">
                *Prazo de produção de até 10 dias úteis não incluso no prazo de entrega.
            </p>
        `;
    } catch(err) {
        resultEl.style.color = '#ff4444';
        resultEl.innerHTML = '⚠️ Não foi possível calcular o frete para este CEP.';
    }
});

// Função para selecionar frete (estética)
window.selectShipping = (el, id) => {
    document.querySelectorAll('.shipping-method-card').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
};

/* ---- MERCADO PAGO CHECKOUT PRO ---- */

// ⚙️ Configure esta URL com o endereço do seu backend (servidor Node.js)
const BACKEND_URL = 'https://tiwshirts.onrender.com'; // TROQUE pelo URL do seu servidor

document.getElementById('checkoutBtn').addEventListener('click', async () => {
    if (cart.length === 0) return;

    const btn = document.getElementById('checkoutBtn');
    btn.disabled = true;
    btn.textContent = 'Preparando pagamento...';

    // Monta os itens no formato que o backend espera (Seguro: IDs e Variantes)
    const items = cart.flatMap(item => {
        if (item.type === 'bag-bundle') {
            const plusSizeCount = item.items.filter(i => ['G1', 'G2', 'G3'].includes(i.size)).length;
            return [{
                id: 'bag-of-drop',
                quantity: 1,
                plusSizeCount: plusSizeCount
            }];
        }
        return [{
            id:      item.printId,
            printId: item.printId,
            size:    item.size,
            quantity: 1
        }];
    });

    try {
        const res = await fetch(`${BACKEND_URL}/create-preference`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items })
        });

        if (!res.ok) throw new Error('Erro ao criar preferência de pagamento');

        const data = await res.json();

        // Redireciona para o checkout do Mercado Pago
        window.location.href = data.init_point; // use sandbox_init_point para testes

    } catch (err) {
        console.error(err);
        alert('Não foi possível iniciar o pagamento. Tente novamente ou entre em contato.');
        btn.disabled = false;
        btn.textContent = '💳 COMPRAR AGORA';
    }
});

/* ---- INIT ---- */
document.addEventListener('DOMContentLoaded', () => {
    const params     = new URLSearchParams(window.location.search);
    const printParam = params.get('print');

    if (printParam === 'bag' || printParam === '6') {
        document.querySelectorAll('.print-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.print === 'bag');
        });
        setMode('bag');
    } else if (printParam && PRINTS[printParam]) {
        currentState.print = printParam;
        document.querySelectorAll('.print-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.print === printParam);
        });
        setMode('single');
    } else {
        setMode('single');
    }

    updateCartUI();
});
