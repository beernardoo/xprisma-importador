// server.js — XPrisma Importador backend
// Serve arquivos estáticos + proxy para o formulário itscom

const express  = require('express');
const path     = require('path');
const FormData = require('form-data');
const fetch    = require('node-fetch').default || require('node-fetch');
const app      = express();

// ─── CORS + JSON ──────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json({ limit: '10mb' }));

// ─── CONSTANTES DO FORMULÁRIO ────────────────────────────────────────────────
const FORM_ID      = '2rww9UqxfjZ73c86wFvS';
const LOCATION_ID  = 'DAFYNiR9e9W6obXAA7Rm';
const FORM_ENDPOINT = `https://backend.leadconnectorhq.com/forms/submit?formId=${FORM_ID}&locationId=${LOCATION_ID}`;
const TERMS_TEXT = 'Ao prosseguir, você concorda em receber chamadas telefônicas e mensagens de texto da Águas Guariroba, realizadas pela Atual Cobrança. Essas comunicações podem ser feitas de forma automatizada, pré-gravada ou com uso de voz por inteligência artificial. Você também concorda em receber comunicações com fins informativos e de marketing relacionadas aos serviços. Para não receber mais contatos, você pode dizer "Não me ligue novamente" a qualquer momento.';

// ─── UTILIDADES ───────────────────────────────────────────────────────────────
function formatarTelefone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  // Já tem código de país 55
  if (digits.startsWith('55') && digits.length >= 12) return '+' + digits;
  // Número brasileiro sem código
  if (digits.length >= 10) return '+55' + digits;
  return digits;
}

function mapearCampos(row) {
  // Tenta mapear colunas do arquivo para os campos do formulário
  // Aceita variações de nomes (maiúsculo/minúsculo, com/sem acento)
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_-]+/g, '');

  const find = (keys) => {
    for (const k of Object.keys(row)) {
      const kn = norm(k);
      if (keys.some(p => kn.includes(p))) return String(row[k] || '').trim();
    }
    return '';
  };

  return {
    nome:      find(['nome', 'name', 'razao', 'cliente']),
    telefone:  find(['telefone', 'phone', 'tel', 'celular', 'fone', 'whatsapp']),
    cpf:       find(['cpf', 'cnpj', 'documento']),
    vencimento: find(['vencimento', 'vcto', 'vecto', 'data']),
    contrato:  find(['contrato', 'contract', 'numero']),
    valor:     find(['valor', 'divida', 'saldo', 'debito']),
    dias:      find(['dias', 'atraso', 'vencidos']),
    email:     find(['email', 'e-mail', 'mail']),
  };
}

// ─── ROTA DE DISPARO ─────────────────────────────────────────────────────────
app.post('/api/disparar', async (req, res) => {
  try {
    const dados = req.body;

    // Suporta receber campos já mapeados OU a linha bruta do arquivo
    const campos = dados._raw ? mapearCampos(dados._raw) : dados;
    const { nome, telefone, cpf, vencimento, contrato, valor, dias, email, captchaToken } = campos;

    // Monta o objeto formData (JSON interno do formulário)
    const formDataObj = {
      full_name:             nome || '',
      phone:                 formatarTelefone(telefone),
      kwzvkvRVPG0XO2wsPJsY:  cpf || '',
      iWG7aSZIvHiuHKfUKoU3:  vencimento || '',
      oave3BWDEY9YcIub1lo5:  contrato || '',
      E7U6I7VDRuX8MoBbkKPT:  valor || '',
      fTcFF96MfD6heYDSw54F:  dias || '',
      terms_and_conditions:  TERMS_TEXT,
      formId:                FORM_ID,
      location_id:           LOCATION_ID,
    };
    if (email) formDataObj.email = email;

    // Monta FormData para envio
    const fd = new FormData();
    fd.append('formData',   JSON.stringify(formDataObj));
    fd.append('locationId', LOCATION_ID);
    fd.append('formId',     FORM_ID);
    if (captchaToken) fd.append('captchaV3', captchaToken);

    // Converte para buffer para compatibilidade com node-fetch
    const fdBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      fd.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      fd.on('end', () => resolve(Buffer.concat(chunks)));
      fd.on('error', reject);
      fd.resume();
    });

    // POST para o backend do Go High Level / itscom
    const response = await fetch(FORM_ENDPOINT, {
      method: 'POST',
      body: fdBuffer,
      headers: {
        ...fd.getHeaders(),
        'Origin':  'https://api.itscom.com.br',
        'Referer': 'https://api.itscom.com.br/widget/form/' + FORM_ID + '?notrack=true',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    });

    const statusCode = response.status;
    let data;
    try { data = await response.json(); } catch { data = { raw: await response.text() }; }

    if (statusCode >= 200 && statusCode < 300) {
      return res.json({ success: true, contactId: data?.contact?.id, submissionId: data?.submissionId, status: statusCode });
    } else {
      return res.json({ success: false, error: `Status ${statusCode}`, data });
    }

  } catch (e) {
    return res.json({ success: false, error: e.message });
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => res.json({ ok: true, version: '1.0.0', formId: FORM_ID, locationId: LOCATION_ID }));

// ─── ARQUIVOS ESTÁTICOS ───────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '.')));

// Fallback para index.html
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─── INICIALIZAÇÃO ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`XPrisma Importador rodando em http://localhost:${PORT}`);
  console.log(`Proxy ativo → ${FORM_ENDPOINT}`);
});
