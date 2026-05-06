# TiwShirts — Checkout Backend

Backend Node.js para processar pagamentos via **Mercado Pago Checkout Pro**.

## Setup em 5 minutos (grátis no Render.com)

### 1. Obter credenciais do Mercado Pago
- Acesse: https://www.mercadopago.com.br/developers/panel
- Crie/selecione um aplicativo
- Copie o **Access Token de PRODUÇÃO**

### 2. Fazer deploy no Render (grátis)
1. Crie uma conta em https://render.com
2. "New Web Service" → conecte este repositório/pasta
3. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment Variable:**
     - Key: `MP_ACCESS_TOKEN`
     - Value: (seu access token de produção)
4. Clique em Deploy

### 3. Atualizar a URL no frontend
Em `loja.js`, linha com `BACKEND_URL`, troque:
```
const BACKEND_URL = 'https://tiwshirts-checkout.onrender.com';
```
pelo URL gerado pelo Render após o deploy.

### 4. Atualizar seu domínio no server.js
Em `server.js`, na lista `origin` do CORS, substitua `tiwshirts.com.br` pelo seu domínio real.

### 5. Atualizar as URLs de retorno
Em `server.js`, nas `back_urls`, substitua pelo seu domínio real:
```js
success: 'https://SEU_DOMINIO/loja.html?status=success',
failure: 'https://SEU_DOMINIO/loja.html?status=failure',
```

---

## Testar localmente
```bash
cd checkout-backend
npm install
MP_ACCESS_TOKEN=TEST-xxx... node server.js
```
Use `sandbox_init_point` (em vez de `init_point`) no `loja.js` para testar sem cobrar.

## Fluxo completo
```
Cliente clica "COMPRAR AGORA"
    ↓
Frontend envia carrinho para /create-preference
    ↓
Backend cria preferência no Mercado Pago
    ↓
MP retorna init_point (URL de checkout)
    ↓
Cliente é redirecionado para pagar (Pix, Cartão, Boleto)
    ↓
MP redireciona para back_url de success/failure
```
