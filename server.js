// server.js — XPrisma Importador
// Serve arquivos estáticos na porta 3456

const express = require('express');
const path    = require('path');
const app     = express();

app.use(express.static(path.join(__dirname, '.')));
app.get('/api/status', (req, res) => res.json({ ok: true, version: '1.2.0' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => console.log(`XPrisma Importador → http://localhost:${PORT}`));
