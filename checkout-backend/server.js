const express = require('express');
const cors    = require('cors');
const { MercadoPagoConfig, Preference } = require('mercadopago');

const app = express();
app.use(express.json());

// Permite chamadas do domínio da loja (ajuste para seu domínio real)
app.use(cors({
    origin: [
        'http://localhost',
        'http://127.0.0.1',
        'https://tiwshirts.com.br',
        'https://www.tiwshirts.com.br',
        'https://tiw-shirts.vercel.app',
        'https://tiw-shirts-edubovolines-projects.vercel.app'
    ]
}));

// ─── Credenciais Mercado Pago ───────────────────────────────────────────────
// Crie suas credenciais em: https://www.mercadopago.com.br/developers/panel
const mp = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN // ← configure na plataforma de hospedagem
});

const PRINTS = {
    '1': { name: 'MACONHEIRO', price: 105 },
    '2': { name: 'NÃO SOMOS MÁ PESSOA', price: 105 },
    '3': { name: 'JUST DOOB IT', price: 105 },
    '4': { name: 'MACONHA SALVA VIDAS', price: 105 },
    '5': { name: 'LEGALIZA PRA POBRE', price: 105 }
};
const BAG_PRICE = 475;

// ─── Rota principal ─────────────────────────────────────────────────────────
app.post('/create-preference', async (req, res) => {
    try {
        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Nenhum item enviado.' });
        }

        const preference = new Preference(mp);

        // Validação e Cálculo de Preços no Servidor (Segurança)
        const validatedItems = items.map(item => {
            let unitPrice = 0;
            let title = '';

            if (item.id === 'bag-of-drop') {
                unitPrice = BAG_PRICE;
                title = 'BAG OF DROP — Todas as Estampas';
                // Adiciona acréscimo se houver itens plus size no bundle
                if (item.plusSizeCount) {
                    unitPrice += (item.plusSizeCount * 27);
                }
            } else {
                const printId = item.printId || item.id;
                const p = PRINTS[printId];
                if (!p) throw new Error(`Produto inválido: ${printId}`);
                
                unitPrice = p.price;
                title = `Camiseta ${p.name} - ${item.size}`;
                
                // Acréscimo Plus Size (G1, G2, G3)
                if (['G1', 'G2', 'G3'].includes(item.size)) {
                    unitPrice += 27;
                }
            }

            return {
                id:          item.id,
                title:       title,
                quantity:    item.quantity || 1,
                unit_price:  unitPrice,
                currency_id: 'BRL'
            };
        });

        const result = await preference.create({
            body: {
                items: validatedItems,
                // ─── URLs de retorno após o pagamento ───────────────────────
                back_urls: {
                    success: 'https://tiwshirts.com.br/loja.html?status=success',
                    failure: 'https://tiwshirts.com.br/loja.html?status=failure',
                    pending: 'https://tiwshirts.com.br/loja.html?status=pending'
                },
                auto_return: 'approved',
                // ─── Informações da loja ─────────────────────────────────────
                statement_descriptor: 'TIWSHIRTS DROP1',
                external_reference:  `DROP1-${Date.now()}`,
                // ─── Envio (opcional) ────────────────────────────────────────
                // shipments: { mode: 'not_specified' } // descomente se quiser calcular frete
            }
        });

        res.json({
            id:                  result.id,
            init_point:          result.init_point,         // produção
            sandbox_init_point:  result.sandbox_init_point  // testes
        });

    } catch (err) {
        console.error('Erro Mercado Pago:', err);
        res.status(500).json({ error: 'Falha ao criar preferência de pagamento.' });
    }
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'TiwShirts Checkout Online ✓' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
