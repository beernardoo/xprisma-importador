// server.js — XPrisma Importador
// Serve arquivos estáticos na porta 3456

const express = require('express');
const path    = require('path');
const app     = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '.')));

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
