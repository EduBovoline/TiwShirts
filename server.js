const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const nodemailer = require('nodemailer');

// Função de Sanitização contra XSS e HTML Injection
function escapeHtml(string) {
    if (!string) return '';
    return String(string)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

const app = express();

// Configuração do Email (Nodemailer)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Permite chamadas do domínio da loja (ajuste para seu domínio real)
app.use(cors({
    origin: [
        'http://localhost',
        'http://127.0.0.1',
        'https://tiwshirts.com.br',
        'https://www.tiwshirts.com.br',
        'https://tiwshirts.space',
        'https://www.tiwshirts.space',
        'https://tiw-shirts.vercel.app',
        'https://tiwshirts.vercel.app',
        'https://tiw-shirts-edubovolines-projects.vercel.app',
        'https://tiwshirts-edubovolines-projects.vercel.app'
    ]
}));
// IMPORTANTE:
app.options('*', cors());

app.use(express.json());
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
        const { items, customer, shipping } = req.body;
        
        // Sanitizar dados do cliente (Segurança do Usuário)
        const sanitizedCustomer = {
            nome: escapeHtml(customer?.nome),
            email: escapeHtml(customer?.email),
            cpf: escapeHtml(customer?.cpf),
            whatsapp: escapeHtml(customer?.whatsapp),
            rua: escapeHtml(customer?.rua),
            numero: escapeHtml(customer?.numero),
            cep: escapeHtml(customer?.cep),
            bairro: escapeHtml(customer?.bairro),
            cidade: escapeHtml(customer?.cidade),
            uf: escapeHtml(customer?.uf),
            complemento: escapeHtml(customer?.complemento)
        };
        
        console.log('--- NOVA REQUISIÇÃO DE CHECKOUT ---');
        console.log('Shipping recebido:', shipping);
        console.log('Customer:', sanitizedCustomer);

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Nenhum item enviado.' });
        }

        const preference = new Preference(mp);

        // 1. Validação de Itens (Mesma lógica de segurança)
        const validatedItems = items.map(item => {
            let unitPrice = 0;
            let title = '';

            if (item.id === 'bag-of-drop') {
                unitPrice = BAG_PRICE;
                title = 'TiwShirts - Pack Bag of Drop';
                if (item.plusSizeCount) unitPrice += (item.plusSizeCount * 27);
            } else {
                const printId = item.printId || item.id;
                const p = PRINTS[printId];
                if (!p) throw new Error(`Produto inválido: ${printId}`);
                unitPrice = p.price;
                
                // Usamos "Modelo [ID]" ao invés do p.name para não cair no filtro de palavras bloqueadas do Mercado Pago (ex: Maconha)
                title = `TiwShirts - Camiseta Modelo ${printId} - Tam: ${item.size}`;
                
                if (['G1', 'G2', 'G3'].includes(item.size)) unitPrice += 27;
            }

            return {
                id: item.id,
                title: title,
                quantity: item.quantity || 1,
                unit_price: Number(unitPrice),
                currency_id: 'BRL'
            };
        });

        // 2. Adicionar Frete como um item (se houver valor)
        if (shipping && shipping.price > 0) {
            validatedItems.push({
                id: 'shipping-cost',
                title: '🚚 Frete / Entrega',
                quantity: 1,
                unit_price: Number(shipping.price),
                currency_id: 'BRL'
            });
        }

        // 3. Montar Preferência com dados do Pagador (Melhora aprovação)
        const preferenceData = {
            body: {
                items: validatedItems,
                payer: {
                    name: sanitizedCustomer.nome || 'Cliente TiwShirts',
                    email: sanitizedCustomer.email || '',
                    identification: {
                        type: 'CPF',
                        number: sanitizedCustomer.cpf ? sanitizedCustomer.cpf.replace(/\D/g, '') : ''
                    },
                    phone: {
                        area_code: sanitizedCustomer.whatsapp ? sanitizedCustomer.whatsapp.substring(0,2) : '',
                        number: sanitizedCustomer.whatsapp ? sanitizedCustomer.whatsapp.replace(/\D/g, '').substring(2) : ''
                    },
                    address: {
                        street_name: sanitizedCustomer.rua || '',
                        street_number: Number(sanitizedCustomer.numero) || 0,
                        zip_code: sanitizedCustomer.cep || ''
                    }
                },
                back_urls: {
                    success: 'https://tiwshirts.space/loja.html?status=success',
                    failure: 'https://tiwshirts.space/loja.html?status=failure',
                    pending: 'https://tiwshirts.space/loja.html?status=pending'
                },
                auto_return: 'approved',
                statement_descriptor: 'TIWSHIRTS DROP1',
                external_reference: `DROP1-${Date.now()}`,
                // Metadados para o seu controle
                metadata: {
                    customer_data: sanitizedCustomer,
                    shipping_details: shipping
                }
            }
        };

        const result = await preference.create(preferenceData);

        // ─── Disparar E-mail de Aviso ──────────────────────────────────────────
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const pedidoId = preferenceData.body.external_reference;
            const itensHtml = validatedItems.map(i => `<li>${i.quantity}x ${i.title} - R$ ${i.unit_price}</li>`).join('');
            
            const htmlEmail = `
                <h2>🚨 Novo Checkout Iniciado</h2>
                <p><strong>Pedido:</strong> ${pedidoId}</p>
                <p><strong>Status:</strong> Aguardando Pagamento no Mercado Pago</p>
                
                <h3>Dados do Cliente:</h3>
                <ul>
                    <li><strong>Nome:</strong> ${sanitizedCustomer.nome || 'N/A'}</li>
                    <li><strong>Email:</strong> ${sanitizedCustomer.email || 'N/A'}</li>
                    <li><strong>WhatsApp:</strong> ${sanitizedCustomer.whatsapp || 'N/A'}</li>
                    <li><strong>CPF:</strong> ${sanitizedCustomer.cpf || 'N/A'}</li>
                </ul>
                
                <h3>Endereço de Entrega:</h3>
                <p>${sanitizedCustomer.rua || ''}, ${sanitizedCustomer.numero || ''} - ${sanitizedCustomer.bairro || ''}<br>
                ${sanitizedCustomer.cidade || ''} / ${sanitizedCustomer.uf || ''}<br>
                <strong>CEP:</strong> ${sanitizedCustomer.cep || ''}<br>
                <strong>Complemento:</strong> ${sanitizedCustomer.complemento || 'N/A'}</p>
                
                <h3>Itens do Pedido:</h3>
                <ul>${itensHtml}</ul>
            `;

            transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: 'edubovoline@gmail.com', // E-mail que vai RECEBER o aviso
                subject: `#venda n ${pedidoId.split('-')[1]} (Checkout Iniciado)`,
                html: htmlEmail
            }).then(() => console.log('📧 E-mail de aviso enviado!'))
              .catch(err => console.error('Erro ao enviar e-mail:', err));
        }

        res.json({
            id: result.id,
            init_point: result.init_point,
            sandbox_init_point: result.sandbox_init_point
        });


    } catch (err) {
        console.error('❌ ERRO DETALHADO MERCADO PAGO:', {
            message: err.message,
            stack: err.stack,
            items: req.body.items
        });
        res.status(500).json({ 
            error: 'Falha ao criar preferência de pagamento.',
            details: err.message 
        });
    }
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'TiwShirts Checkout Online ✓' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
