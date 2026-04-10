// server.js — XPrisma Importador
// Serve arquivos estáticos na porta 3456

const express = require('express');
const path    = require('path');
const app     = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '.')));

// ─── PROXY ANÔNIMO PARA ITSCOM ────────────────────────────────────────────────
// Cada envio sai do servidor Node — sem cookies, sem cache, sem fingerprint do browser
app.post('/api/submit', async (req, res) => {
  try {
    const { formData, locationId, formId, captchaV3 } = req.body;

    const endpoint = `https://backend.leadconnectorhq.com/forms/submit?formId=${formId}&locationId=${locationId}`;

    // Monta FormData no servidor (Node 18+ tem FormData nativo)
    const fd = new FormData();
    fd.append('formData',   JSON.stringify(formData));
    fd.append('locationId', locationId);
    fd.append('formId',     formId);
    if (captchaV3) fd.append('captchaV3', captchaV3);

    // POST limpo — cada requisição é uma conexão nova sem histórico de sessão
    const response = await fetch(endpoint, {
      method:  'POST',
      body:    fd,
      headers: {
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Origin':          'https://api.itscom.com.br',
        'Referer':         'https://api.itscom.com.br/',
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });

    let data;
    try { data = await response.json(); } catch { data = { raw: await response.text() }; }

    res.status(response.status).json(data);
  } catch (e) {
    console.error('[proxy] erro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/status', (req, res) => res.json({ ok: true, version: '1.2.0' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3456;
app.listen(PORT, '0.0.0.0', () => {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  const ips = [];
  for (const iface of Object.values(nets)) {
    for (const net of iface) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  console.log(`XPrisma Importador → http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`XPrisma Importador → http://${ip}:${PORT}`));
});
