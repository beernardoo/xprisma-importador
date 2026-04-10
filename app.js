// app.js — XPrisma Importador (completo)

// ─── ESTADO GLOBAL ────────────────────────────────────────────────────────────
const state = {
  arquivoAtual: null,
  hashAtual: null,
  colCpf: null,
  colContrato: null,
  rowsParseadas: [],
  // Pasta
  dirHandle: null,
  monitoramentoTimer: null,
  arquivosProcessadosLocalmente: new Set(),
  // Entrada direta
  dadosDiretos: [],
  // Controle de processamento
  cancelando: false,
  // Consent/dispatch
  pendingRows: [],
  pendingArquivoId: null,
  pendingModo: 'arquivo', // 'arquivo' | 'direto'
  // Dashboard
  arquivosIgnorados: 0,
  // Reprocessar
  reprocessarArquivoId: null,
};

// ─── UTILS ────────────────────────────────────────────────────────────────────

const formatBytes = b => b < 1024 ? b + ' B' : b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(2)+' MB';
const formatDateTime = dt => new Date(dt).toLocaleString('pt-BR');
const formatTempo = s => !s ? '—' : s < 60 ? s+'s' : Math.floor(s/60)+'m '+(s%60)+'s';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function calcularHashSHA256(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function normalizarCpf(val) { return String(val || '').replace(/\D/g, ''); }
function isArquivoValido(nome) { return /\.(xlsx?|csv)$/i.test(nome); }

// ─── ALERTAS ─────────────────────────────────────────────────────────────────

function mostrarAlerta(msg, tipo = 'info', duracao = 5000) {
  const c = document.getElementById('alertas');
  const d = document.createElement('div');
  d.className = `alerta alerta-${tipo}`;
  d.innerHTML = `<span>${{success:'✓',warning:'⚠',danger:'✕',info:'ℹ'}[tipo]||'ℹ'}</span> <span>${msg}</span>`;
  c.appendChild(d);
  if (duracao > 0) setTimeout(() => d.remove(), duracao);
}

function limparAlertas() { document.getElementById('alertas').innerHTML = ''; }

// Colunas esperadas para mapeamento de disparo
const COLUNAS_ESPERADAS = [
  { key: 'CPF_CNPJ',         req: true, aliases: ['cpf','cnpj','cpf_cnpj','cpfcnpj','documento'] },
  { key: 'NUMERO_CONTRATO',  req: true, aliases: ['contrato','numero_contrato','num_contrato','nr_contrato'] },
  { key: 'NOME',             req: true, aliases: ['nome','name','razao','cliente'] },
  { key: 'TELEFONE',         req: true, aliases: ['telefone','phone','tel','celular','fone','whatsapp'] },
  { key: 'VALOR_DIVIDA',     req: true, aliases: ['valor','divida','saldo','debito'] },
  { key: 'DATA_VENCIMENTO',  req: true, aliases: ['vencimento','vcto','vecto','data'] },
  { key: 'DIAS_ATRASO',      req: true, aliases: ['dias','atraso','vencidos'] },
];

function validarColunas(colunas) {
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s_-]+/g,'');
  const colsNorm = colunas.map(c => norm(c));
  return COLUNAS_ESPERADAS.map(col => {
    const encontrada = col.aliases.some(a => colsNorm.some(c => c.includes(a)));
    return { ...col, encontrada };
  });
}

function mostrarErroArquivo(titulo, msg, colsEncontradas) {
  document.getElementById('erro-arquivo-titulo').textContent = titulo;
  document.getElementById('erro-arquivo-msg').textContent = msg;
  document.getElementById('erro-arquivo').classList.remove('hidden');
  document.getElementById('arquivo-info').classList.add('hidden');
  document.getElementById('upload-area').classList.add('hidden');

  const detalhe = document.getElementById('erro-colunas-detalhe');
  if (colsEncontradas && colsEncontradas.length) {
    const faltando = colsEncontradas.filter(c => !c.encontrada && c.req);
    const aviso    = colsEncontradas.filter(c => !c.encontrada && !c.req);
    const ok       = colsEncontradas.filter(c => c.encontrada);
    let html = `<div class="erro-col-title">Diagnóstico das colunas</div>`;
    html += `<div class="erro-col-grid">`;
    ok.forEach(c      => { html += `<div class="erro-col-item ok">✓ ${c.key}</div>`; });
    aviso.forEach(c   => { html += `<div class="erro-col-item warn">? ${c.key}</div>`; });
    faltando.forEach(c => { html += `<div class="erro-col-item miss">✕ ${c.key} — obrigatória</div>`; });
    html += `</div>`;
    if (faltando.length) {
      html += `<p style="margin-top:10px;font-size:11px;color:var(--danger)">Renomeie as colunas marcadas com ✕ e tente novamente.</p>`;
    }
    detalhe.innerHTML = html;
    detalhe.classList.remove('hidden');
  } else {
    detalhe.classList.add('hidden');
  }
}

function ocultarErroArquivo() {
  document.getElementById('erro-arquivo').classList.add('hidden');
  document.getElementById('erro-colunas-detalhe').classList.add('hidden');
}

function mostrarErroPasta(titulo, msg, colsEncontradas) {
  document.getElementById('erro-pasta-titulo').textContent = titulo;
  document.getElementById('erro-pasta-msg').textContent = msg;
  document.getElementById('erro-pasta').classList.remove('hidden');
  document.getElementById('erro-pasta').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const detalhe = document.getElementById('erro-pasta-colunas');
  if (colsEncontradas && colsEncontradas.length) {
    const faltando = colsEncontradas.filter(c => !c.encontrada && c.req);
    const aviso    = colsEncontradas.filter(c => !c.encontrada && !c.req);
    const ok       = colsEncontradas.filter(c => c.encontrada);
    let html = `<div class="erro-col-title">Diagnóstico das colunas</div><div class="erro-col-grid">`;
    ok.forEach(c       => { html += `<div class="erro-col-item ok">✓ ${c.key}</div>`; });
    aviso.forEach(c    => { html += `<div class="erro-col-item warn">? ${c.key}</div>`; });
    faltando.forEach(c => { html += `<div class="erro-col-item miss">✕ ${c.key} — obrigatória</div>`; });
    html += `</div>`;
    if (faltando.length) html += `<p style="margin-top:10px;font-size:11px;color:var(--danger)">Renomeie as colunas marcadas com ✕ e tente novamente.</p>`;
    detalhe.innerHTML = html;
    detalhe.classList.remove('hidden');
  } else {
    detalhe.classList.add('hidden');
  }
}

// ─── MOVER ARQUIVO PARA PASTA PROCESSADOS ────────────────────────────────────

async function moverParaProcessados(file) {
  if (!state.dirHandle || !file) return false;
  try {
    const procDir = await state.dirHandle.getDirectoryHandle('Processados', { create: true });
    const novoHandle = await procDir.getFileHandle(file.name, { create: true });
    const writable = await novoHandle.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();
    try { await state.dirHandle.removeEntry(file.name); } catch {}
    return true;
  } catch (e) {
    console.warn('Erro ao mover para Processados:', e.message);
    return false;
  }
}

function ocultarErroPasta() {
  document.getElementById('erro-pasta').classList.add('hidden');
  document.getElementById('erro-pasta-colunas').classList.add('hidden');
}

document.getElementById('btn-fechar-erro-pasta').addEventListener('click', ocultarErroPasta);

// ─── TABS ─────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.remove('hidden');
    if (tab === 'dashboard') carregarDashboard();
    if (tab === 'logs') carregarLogs();
  });
});

// ─── SELETOR DE MODO ─────────────────────────────────────────────────────────

document.querySelectorAll('input[name="modo"]').forEach(r => {
  r.addEventListener('change', () => {
    const modo = r.value;
    document.getElementById('modo-manual').classList.toggle('hidden', modo !== 'manual');
    document.getElementById('modo-pasta').classList.toggle('hidden', modo !== 'pasta');
    document.getElementById('modo-direto').classList.toggle('hidden', modo !== 'direto');
    document.getElementById('label-manual').classList.toggle('active', modo === 'manual');
    document.getElementById('label-pasta').classList.toggle('active', modo === 'pasta');
    document.getElementById('label-direto').classList.toggle('active', modo === 'direto');
    limparAlertas();
    ocultarErroArquivo();
    document.getElementById('col-mapper').classList.add('hidden');
    document.getElementById('progresso-container').classList.add('hidden');
  });
});

// ─── MODO 1: UPLOAD MANUAL ────────────────────────────────────────────────────

const uploadArea   = document.getElementById('upload-area');
const inputArquivo = document.getElementById('input-arquivo');
const arquivoInfo  = document.getElementById('arquivo-info');

document.getElementById('btn-selecionar').addEventListener('click', () => inputArquivo.click());
uploadArea.addEventListener('click', () => inputArquivo.click());

uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f) processarSelecaoArquivo(f);
});

inputArquivo.addEventListener('change', () => { if (inputArquivo.files[0]) processarSelecaoArquivo(inputArquivo.files[0]); });

async function processarSelecaoArquivo(file) {
  ocultarErroArquivo();
  limparAlertas();

  // ─── VALIDAÇÃO DE TIPO ───
  if (!isArquivoValido(file.name)) {
    mostrarErroArquivo(
      'Formato de arquivo inválido',
      `"${file.name}" não é suportado. Use apenas XLSX, XLS ou CSV.`
    );
    await dbRegistrarLog({ acao: 'ERRO_ARQUIVO', arquivo_nome: file.name, status: 'erro', detalhes: { motivo: 'formato_invalido' } });
    return;
  }

  state.arquivoAtual = file;
  state.hashAtual = null;
  state.colCpf = null;
  state.colContrato = null;
  state.rowsParseadas = [];
  state.arquivoVemDePasta = false;

  document.getElementById('info-nome').textContent = file.name;
  document.getElementById('info-tamanho').textContent = formatBytes(file.size);
  document.getElementById('info-data').textContent = new Date().toLocaleString('pt-BR');
  document.getElementById('info-hash').textContent = 'calculando...';

  uploadArea.classList.add('hidden');
  arquivoInfo.classList.remove('hidden');
  document.getElementById('col-mapper').classList.add('hidden');
  document.getElementById('progresso-container').classList.add('hidden');

  try {
    const hash = await calcularHashSHA256(file);
    state.hashAtual = hash;
    document.getElementById('info-hash').textContent = hash;
  } catch {
    document.getElementById('info-hash').textContent = 'erro ao calcular';
  }
}

document.getElementById('btn-remover-arquivo').addEventListener('click', () => {
  state.arquivoAtual = null;
  state.hashAtual = null;
  inputArquivo.value = '';
  uploadArea.classList.remove('hidden');
  arquivoInfo.classList.add('hidden');
  ocultarErroArquivo();
  document.getElementById('col-mapper').classList.add('hidden');
  document.getElementById('progresso-container').classList.add('hidden');
  limparAlertas();
});

document.getElementById('btn-carregar').addEventListener('click', async () => {
  if (!state.arquivoAtual) return;

  limparAlertas();

  // Verifica duplicidade de arquivo
  if (state.hashAtual) {
    const jaExiste = await dbArquivoJaProcessado(state.hashAtual);
    if (jaExiste) {
      state.arquivosIgnorados++;
      mostrarAlerta(`Arquivo já processado em ${formatDateTime(jaExiste.data_processamento)} — ${jaExiste.quantidade_enviados} enviados.`, 'warning', 0);
      await dbRegistrarLog({ acao: 'ARQUIVO_DUPLICADO', arquivo_nome: state.arquivoAtual.name, status: 'ok', detalhes: { hash: state.hashAtual, processado_em: jaExiste.data_processamento } });
      return;
    }
  }

  // Parse do arquivo
  let rows;
  try {
    rows = await parseArquivo(state.arquivoAtual);
  } catch (e) {
    mostrarErroArquivo('Erro ao ler o arquivo', e.message + ' — Verifique se o arquivo não está corrompido ou use o layout CSV de exemplo.');
    await dbRegistrarLog({ acao: 'ERRO_ARQUIVO', arquivo_nome: state.arquivoAtual.name, status: 'erro', detalhes: { motivo: 'parse_error', mensagem: e.message } });
    return;
  }

  if (!rows.length) {
    mostrarErroArquivo('Arquivo vazio', 'O arquivo não contém dados. Baixe o layout CSV para preencher corretamente.');
    await dbRegistrarLog({ acao: 'ERRO_ARQUIVO', arquivo_nome: state.arquivoAtual.name, status: 'erro', detalhes: { motivo: 'arquivo_vazio' } });
    return;
  }

  state.rowsParseadas = rows;
  await dbRegistrarLog({ acao: 'UPLOAD_ARQUIVO', arquivo_nome: state.arquivoAtual.name, quantidade_total: rows.length, status: 'ok' });

  const colunas = Object.keys(rows[0]);
  const { cpfCol, contratoCol } = detectarColunas(colunas);
  const diagnostico = validarColunas(colunas);

  if (cpfCol && contratoCol) {
    state.colCpf = cpfCol;
    state.colContrato = contratoCol;
    prepararDisparo(rows, 'arquivo');
  } else {
    const faltam = diagnostico.filter(c => c.req && !c.encontrada).map(c => c.key);
    mostrarErroArquivo(
      'Colunas obrigatórias não encontradas',
      `Não foi possível identificar: ${faltam.join(', ')}. Verifique o cabeçalho do arquivo.`,
      diagnostico
    );
    await dbRegistrarLog({ acao: 'ERRO_ARQUIVO', arquivo_nome: state.arquivoAtual.name, status: 'erro', detalhes: { motivo: 'colunas_faltando', faltam } });
  }
});

// ─── TEMPLATE CSV ─────────────────────────────────────────────────────────────

function downloadTemplateCSV() {
  const lines = [
    '# LAYOUT DE IMPORTACAO XPRISMA',
    '# Campos obrigatorios: CPF_CNPJ, NUMERO_CONTRATO',
    'CPF_CNPJ;NUMERO_CONTRATO;NOME;TELEFONE;VALOR_DIVIDA;DATA_VENCIMENTO;DIAS_ATRASO',
    '12345678900;CONT001;Joao Silva;11999999999;1500.00;2025-06-30;30',
    '98765432100;CONT002;Maria Santos;11888888888;850.00;2025-07-15;15',
  ];
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'layout_importacao_xprisma.csv';
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('btn-download-template').addEventListener('click', downloadTemplateCSV);
document.getElementById('btn-download-template-erro').addEventListener('click', downloadTemplateCSV);

// ─── PARSER DE XLSX/CSV ───────────────────────────────────────────────────────

function parseArquivo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    reader.readAsArrayBuffer(file);
  });
}

function detectarColunas(colunas) {
  const cpfP = /^(cpf|cnpj|cpf_cnpj|cpfcnpj|documento|doc|cpf\/cnpj|nr_cpf|num_cpf)$/i;
  const conP  = /^(contrato|numero_contrato|num_contrato|nr_contrato|cod_contrato|id_contrato|n_contrato|nro_contrato|contrato_numero)$/i;
  return {
    cpfCol:      colunas.find(c => cpfP.test(c.trim())),
    contratoCol: colunas.find(c => conP.test(c.trim())),
  };
}

// ─── MAPEAMENTO DE COLUNAS ────────────────────────────────────────────────────

function abrirColumnMapper(colunas) {
  const selCpf = document.getElementById('select-cpf-col');
  const selCon = document.getElementById('select-contrato-col');
  selCpf.innerHTML = colunas.map(c => `<option value="${c}">${c}</option>`).join('');
  selCon.innerHTML = colunas.map(c => `<option value="${c}">${c}</option>`).join('');
  const rows = state.rowsParseadas.length ? state.rowsParseadas : state.dadosDiretos;
  document.getElementById('col-mapper-preview').textContent = 'Linha 1: ' + JSON.stringify(rows[0]).slice(0, 200);
  document.getElementById('col-mapper').classList.remove('hidden');
}

document.getElementById('btn-cancelar-mapper').addEventListener('click', () => {
  document.getElementById('col-mapper').classList.add('hidden');
});

document.getElementById('btn-confirmar-mapper').addEventListener('click', () => {
  state.colCpf      = document.getElementById('select-cpf-col').value;
  state.colContrato = document.getElementById('select-contrato-col').value;
  document.getElementById('col-mapper').classList.add('hidden');
  const rows = state.rowsParseadas.length ? state.rowsParseadas : state.dadosDiretos;
  prepararDisparo(rows, state.rowsParseadas.length ? 'arquivo' : 'direto');
});

// ─── MODO 3: ENTRADA DIRETA ───────────────────────────────────────────────────

document.getElementById('btn-limpar-direto').addEventListener('click', () => {
  document.getElementById('textarea-direto').value = '';
  document.getElementById('direto-preview').classList.add('hidden');
  state.dadosDiretos = [];
  limparAlertas();
});

document.getElementById('btn-analisar-direto').addEventListener('click', async () => {
  const texto = document.getElementById('textarea-direto').value.trim();
  if (!texto) { mostrarAlerta('Cole os dados no campo acima.', 'warning'); return; }

  limparAlertas();
  const resultado = parseDireto(texto);

  if (!resultado.rows.length) {
    mostrarAlerta('Nenhum dado válido encontrado. Verifique o formato: use ; como separador.', 'danger');
    return;
  }

  state.dadosDiretos = resultado.rows;

  // Preview
  const previewDiv = document.getElementById('direto-preview');
  const colunas = resultado.colunas;

  document.getElementById('direto-preview-count').textContent = resultado.rows.length + ' registros';
  document.getElementById('direto-preview-colunas').textContent = 'Colunas: ' + colunas.join(', ');

  const tabelaWrap = document.getElementById('direto-preview-tabela');
  const maxRows = Math.min(resultado.rows.length, 5);
  let html = '<table><thead><tr>' + colunas.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
  for (let i = 0; i < maxRows; i++) {
    html += '<tr>' + colunas.map(c => `<td>${resultado.rows[i][c] ?? ''}</td>`).join('') + '</tr>';
  }
  if (resultado.rows.length > 5) html += `<tr><td colspan="${colunas.length}" style="text-align:center;color:var(--text-muted)">... e mais ${resultado.rows.length - 5} registros</td></tr>`;
  html += '</tbody></table>';
  tabelaWrap.innerHTML = html;
  previewDiv.classList.remove('hidden');

  await dbRegistrarLog({ acao: 'ENTRADA_DIRETA', quantidade_total: resultado.rows.length, status: 'ok' });

  // Detecta colunas — salva mas não dispara ainda
  const { cpfCol, contratoCol } = detectarColunas(colunas);
  if (cpfCol && contratoCol) {
    state.colCpf = cpfCol;
    state.colContrato = contratoCol;
  } else {
    state.colCpf = null;
    state.colContrato = null;
  }

  // Mostra botão de disparo — usuário decide quando iniciar
  document.getElementById('btn-iniciar-disparo-direto').style.display = '';
  document.getElementById('resultado-envio').classList.add('hidden');
});

document.getElementById('btn-iniciar-disparo-direto').addEventListener('click', () => {
  if (!state.dadosDiretos.length) { mostrarAlerta('Analise os dados primeiro.', 'warning'); return; }
  if (!state.colCpf || !state.colContrato) {
    abrirColumnMapper(Object.keys(state.dadosDiretos[0] || {}));
    return;
  }
  prepararDisparo(state.dadosDiretos, 'direto');
});

function parseDireto(texto) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (!linhas.length) return { rows: [], colunas: [] };

  // Primeira linha = cabeçalho se contiver letras
  const primeiraLinha = linhas[0];
  const temCabecalho = /[a-zA-Z_]/.test(primeiraLinha);

  let colunas, dadosLinhas;
  if (temCabecalho) {
    colunas = primeiraLinha.split(';').map(c => c.trim());
    dadosLinhas = linhas.slice(1);
  } else {
    const numCols = primeiraLinha.split(';').length;
    colunas = Array.from({ length: numCols }, (_, i) => `COLUNA_${i + 1}`);
    dadosLinhas = linhas;
  }

  const rows = dadosLinhas
    .filter(l => l.split(';').some(v => v.trim()))
    .map(l => {
      const vals = l.split(';');
      const obj = {};
      colunas.forEach((c, i) => { obj[c] = (vals[i] || '').trim(); });
      return obj;
    });

  return { rows, colunas };
}

// ─── PREPARAR DISPARO (pré-consent) ──────────────────────────────────────────

async function prepararDisparo(rows, modo) {
  // ─── VALIDAÇÃO DE CAMPOS OBRIGATÓRIOS ────────────────────────────────────────
  const normCol = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_-]+/g, '');
  const findTelefone = row => {
    for (const k of Object.keys(row)) {
      if (['telefone','phone','tel','celular','fone','whatsapp'].some(p => normCol(k).includes(p)))
        return String(row[k] || '').replace(/\D/g, '');
    }
    return '';
  };

  // Helper para encontrar valor de qualquer campo pelo alias
  const findCampo = (row, aliases) => {
    for (const k of Object.keys(row)) {
      if (aliases.some(a => normCol(k).includes(a))) return String(row[k] || '').trim();
    }
    return '';
  };

  const errosValidacao = [];
  rows.forEach((row, i) => {
    const linha = i + 2; // +2 porque linha 1 é cabeçalho
    const cpf      = normalizarCpf(row[state.colCpf]);
    const contrato = String(row[state.colContrato] || '').trim();
    const nome     = findCampo(row, ['nome','name','razao','cliente']);
    const telefone = findTelefone(row);
    const valor    = findCampo(row, ['valor','divida','saldo','debito']);
    const vencto   = findCampo(row, ['vencimento','vcto','vecto','data']);
    const dias     = findCampo(row, ['dias','atraso','vencidos']);

    if (!cpf)      errosValidacao.push(`Linha ${linha}: CPF/CNPJ vazio`);
    if (!contrato) errosValidacao.push(`Linha ${linha}: Número de contrato vazio`);
    if (!nome)     errosValidacao.push(`Linha ${linha}: Nome vazio`);
    if (!telefone) errosValidacao.push(`Linha ${linha}: Telefone vazio`);
    if (!valor)    errosValidacao.push(`Linha ${linha}: Valor da dívida vazio`);
    if (!vencto)   errosValidacao.push(`Linha ${linha}: Data de vencimento vazia`);
    if (!dias)     errosValidacao.push(`Linha ${linha}: Dias de atraso vazio`);
  });

  if (errosValidacao.length > 0) {
    const msg = `⚠️ ${errosValidacao.length} problema(s) encontrado(s) antes do envio:\n\n` +
      errosValidacao.slice(0, 10).join('\n') +
      (errosValidacao.length > 10 ? `\n...e mais ${errosValidacao.length - 10} erros.` : '') +
      '\n\nCorrija os dados e tente novamente.';
    mostrarAlerta(msg.replace(/\n/g, '<br>'), 'danger', 0);
    return;
  }

  // Conta novos vs duplicados
  let novos = 0, duplicados = 0;
  for (const row of rows.slice(0, 50)) { // sample check
    const cpf = normalizarCpf(row[state.colCpf]);
    const con = String(row[state.colContrato] || '');
    if (!cpf || !con) continue;
    const ja = await dbRegistroJaEnviado(cpf, con);
    if (ja && ja.status === 'enviado') duplicados++; else novos++;
  }
  if (rows.length > 50) {
    const ratio = novos / Math.min(50, rows.length - duplicados - novos + novos);
    novos = Math.round(ratio * rows.length);
    duplicados = rows.length - novos;
  }

  state.pendingRows = rows;
  state.pendingModo = modo;
  state.pendingArquivoId = null;

  // Mostra modal de consentimento
  document.getElementById('consent-total').textContent = rows.length;
  document.getElementById('consent-novos').textContent = novos;
  document.getElementById('consent-duplicados').textContent = duplicados;
  // Pré-preenche a descrição com o nome do arquivo (só se veio de arquivo)
  const descEl = document.getElementById('consent-lote-desc');
  descEl.value = (modo === 'arquivo' && state.arquivoAtual?.name) ? state.arquivoAtual.name : '';
  // Reseta checkbox e botão
  const checkEl = document.getElementById('consent-check');
  checkEl.checked = false;
  checkEl.disabled = true;
  document.getElementById('consent-confirmar').disabled = true;
  document.getElementById('modal-consentimento').classList.remove('hidden');
}

// ─── MODAL CONSENTIMENTO ──────────────────────────────────────────────────────

function atualizarEstadoModal() {
  const desc = document.getElementById('consent-lote-desc').value.trim();
  const ok   = !!desc;
  const checkEl = document.getElementById('consent-check');

  // Auto-marca o checkbox quando os campos obrigatórios estão preenchidos
  checkEl.disabled = !ok;
  checkEl.checked  = ok;
  document.getElementById('consent-confirmar').disabled = !ok;
}

document.getElementById('consent-lote-desc').addEventListener('input', atualizarEstadoModal);

document.getElementById('consent-check').addEventListener('change', atualizarEstadoModal);

document.getElementById('consent-close').addEventListener('click', fecharConsentimento);
document.getElementById('consent-cancelar').addEventListener('click', () => {
  fecharConsentimento();
  dbRegistrarLog({ acao: 'DISPARO_CANCELADO', status: 'cancelado', quantidade_total: state.pendingRows.length });
});

document.getElementById('consent-confirmar').addEventListener('click', async () => {
  fecharConsentimento();
  await iniciarProcessamento(false);
});

function fecharConsentimento() {
  document.getElementById('modal-consentimento').classList.add('hidden');
}

// ─── DISPARO FORMULÁRIO ITSCOM ────────────────────────────────────────────────

// ─── CONSTANTES DO FORMULÁRIO ITSCOM ─────────────────────────────────────────
const XPRISMA_FORM_ID     = '2rww9UqxfjZ73c86wFvS';
const XPRISMA_LOCATION_ID = 'DAFYNiR9e9W6obXAA7Rm';
const XPRISMA_RECAPTCHA   = '6LeDBFwpAAAAAJe8ux9-imrqZ2ueRsEtdiWoDDpX';
const XPRISMA_ENDPOINT    = `https://backend.leadconnectorhq.com/forms/submit?formId=${XPRISMA_FORM_ID}&locationId=${XPRISMA_LOCATION_ID}`;
const XPRISMA_TERMS       = 'Ao prosseguir, você concorda em receber chamadas telefônicas e mensagens de texto da Águas Guariroba, realizadas pela Atual Cobrança. Essas comunicações podem ser feitas de forma automatizada, pré-gravada ou com uso de voz por inteligência artificial. Você também concorda em receber comunicações com fins informativos e de marketing relacionadas aos serviços. Para não receber mais contatos, você pode dizer "Não me ligue novamente" a qualquer momento.';

async function gerarTokenRecaptcha() {
  try {
    if (typeof grecaptcha === 'undefined' || !grecaptcha.enterprise) return '';
    return await new Promise(resolve => {
      grecaptcha.enterprise.ready(async () => {
        try { resolve(await grecaptcha.enterprise.execute(XPRISMA_RECAPTCHA, { action: 'LEADGEN_FORM_SUBMIT' })); }
        catch { resolve(''); }
      });
    });
  } catch { return ''; }
}

function formatarTelefoneDisparo(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return '+' + digits;
  if (digits.length >= 10) return '+55' + digits;
  return digits;
}

async function dispararRegistroFormulario(row, cpf, contrato) {
  try {
    // Mapeia colunas da linha para campos do formulário
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_-]+/g, '');
    const find = keys => {
      for (const k of Object.keys(row)) {
        const kn = norm(k);
        if (keys.some(p => kn.includes(p))) return String(row[k] || '').trim();
      }
      return '';
    };

    const nome      = find(['nome', 'name', 'razao', 'cliente']);
    const telefone  = find(['telefone', 'phone', 'tel', 'celular', 'fone', 'whatsapp']);
    const vencimento = find(['vencimento', 'vcto', 'vecto', 'data']);
    const valor     = find(['valor', 'divida', 'saldo', 'debito']);
    const dias      = find(['dias', 'atraso', 'vencidos']);

    // Gera token reCAPTCHA v3 diretamente no browser
    const captchaToken = await gerarTokenRecaptcha();

    // Objeto interno formData exigido pelo formulário GHL/itscom
    const formDataObj = {
      full_name:            nome,
      phone:                formatarTelefoneDisparo(telefone),
      kwzvkvRVPG0XO2wsPJsY: cpf,
      iWG7aSZIvHiuHKfUKoU3: vencimento,
      oave3BWDEY9YcIub1lo5: contrato,
      E7U6I7VDRuX8MoBbkKPT: valor,
      fTcFF96MfD6heYDSw54F:  dias,
      terms_and_conditions:  XPRISMA_TERMS,
      formId:                XPRISMA_FORM_ID,
      location_id:           XPRISMA_LOCATION_ID,
    };

    // Monta FormData (browser nativo)
    const fd = new FormData();
    fd.append('formData',   JSON.stringify(formDataObj));
    fd.append('locationId', XPRISMA_LOCATION_ID);
    fd.append('formId',     XPRISMA_FORM_ID);
    if (captchaToken) fd.append('captchaV3', captchaToken);

    // POST direto do browser (Cloudflare cookies + reCAPTCHA presentes)
    const resp = await fetch(XPRISMA_ENDPOINT, {
      method: 'POST',
      body:   fd,
    });

    const status = resp.status;
    let data;
    try { data = await resp.json(); } catch { data = { raw: await resp.text() }; }

    if (status >= 200 && status < 300) {
      return { success: true, contactId: data?.contact?.id, submissionId: data?.submissionId, status };
    }
    return { success: false, error: `HTTP ${status}`, data };

  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── PROCESSAMENTO PRINCIPAL ──────────────────────────────────────────────────

async function iniciarProcessamento(apenasErros = false) {
  const rows = apenasErros ? state.rowsParseadas : state.pendingRows;
  if (!rows.length) return;

  state.cancelando = false;
  const inicio = Date.now();
  const nomeArquivo = state.arquivoAtual?.name || (state.pendingModo === 'direto' ? 'Entrada Direta' : 'arquivo.xlsx');
  const loteDesc  = document.getElementById('consent-lote-desc')?.value || nomeArquivo;

  // Registra o arquivo no banco (se não for reprocessamento)
  let arquivoId = state.pendingArquivoId;
  if (!apenasErros) {
    try {
      const reg = await dbRegistrarArquivo({
        nome_arquivo: loteDesc,
        hash_arquivo: state.hashAtual || ('direto-' + Date.now()),
        tamanho_arquivo: state.arquivoAtual?.size || 0,
      });
      arquivoId = reg.id;
      state.pendingArquivoId = arquivoId;
    } catch (e) {
      console.warn('Supabase não configurado — processando sem log de arquivo:', e.message);
      arquivoId = 'local-' + Date.now();
      state.pendingArquivoId = arquivoId;
    }
  } else {
    arquivoId = state.reprocessarArquivoId;
  }

  // Mostra progresso
  const prog = document.getElementById('progresso-container');
  prog.classList.remove('hidden');
  document.getElementById('progresso-arquivo-nome').textContent = loteDesc;

  let contTotal = rows.length, contEnviados = 0, contIgnorados = 0, contErros = 0;
  atualizarProgresso(0, contTotal, 0, 0, 0);

  const logEl = document.getElementById('progresso-log');
  logEl.innerHTML = '';
  const addLog = (msg, tipo = '') => {
    const l = document.createElement('div');
    l.className = `log-line ${tipo ? 'log-' + tipo : ''}`;
    l.textContent = msg;
    logEl.appendChild(l);
    logEl.scrollTop = logEl.scrollHeight;
  };

  // Filtro para reprocessamento
  let rowsParaProcessar = rows;
  if (apenasErros && arquivoId) {
    const comErro = await dbRegistrosComErro(arquivoId);
    const chavesErro = new Set(comErro.map(r => `${r.cpf_cnpj}|${r.numero_contrato}`));
    rowsParaProcessar = rows.filter(row => {
      const cpf = normalizarCpf(row[state.colCpf]);
      const con = String(row[state.colContrato] || '');
      return chavesErro.has(`${cpf}|${con}`);
    });
    contTotal = rowsParaProcessar.length;
    addLog(`Reprocessando ${contTotal} registros com erro...`);
  }

  const LOTE = 20;
  for (let i = 0; i < rowsParaProcessar.length; i++) {
    // ─── STOP CHECK ───
    if (state.cancelando) {
      addLog('⏹ Processamento cancelado pelo usuário.', 'skip');
      const tempoSeg = Math.round((Date.now() - inicio) / 1000);
      await dbAtualizarArquivo(arquivoId, { status: 'parcial', quantidade_registros: contTotal, quantidade_enviados: contEnviados, quantidade_erros: contErros, tempo_processamento: tempoSeg });
      await dbRegistrarLog({ acao: 'DISPARO_CANCELADO', arquivo_nome: loteDesc, quantidade_total: contTotal, quantidade_ok: contEnviados, quantidade_erro: contErros, status: 'cancelado' });
      mostrarAlerta(`Processamento cancelado. ${contEnviados} enviados, ${contErros} erros.`, 'warning', 0);
      return;
    }

    const row = rowsParaProcessar[i];
    const cpf = normalizarCpf(row[state.colCpf]);
    const contrato = String(row[state.colContrato] || '').trim();

    const telefoneRaw = (() => {
      for (const k of Object.keys(row)) {
        const kn = String(k).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s_-]+/g,'');
        if (['telefone','phone','tel','celular','fone','whatsapp'].some(p => kn.includes(p)))
          return String(row[k] || '').replace(/\D/g, '');
      }
      return '';
    })();

    const nomeRaw     = (() => { for (const k of Object.keys(row)) { const kn = String(k).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s_-]+/g,''); if (['nome','name','razao','cliente'].some(p=>kn.includes(p))) return String(row[k]||'').trim(); } return ''; })();
    const valorRaw    = (() => { for (const k of Object.keys(row)) { const kn = String(k).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s_-]+/g,''); if (['valor','divida','saldo','debito'].some(p=>kn.includes(p))) return String(row[k]||'').trim(); } return ''; })();
    const venctoRaw   = (() => { for (const k of Object.keys(row)) { const kn = String(k).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s_-]+/g,''); if (['vencimento','vcto','vecto','data'].some(p=>kn.includes(p))) return String(row[k]||'').trim(); } return ''; })();
    const diasRaw     = (() => { for (const k of Object.keys(row)) { const kn = String(k).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s_-]+/g,''); if (['dias','atraso','vencidos'].some(p=>kn.includes(p))) return String(row[k]||'').trim(); } return ''; })();

    const camposVazios = [];
    if (!cpf)        camposVazios.push('CPF/CNPJ');
    if (!contrato)   camposVazios.push('Contrato');
    if (!nomeRaw)    camposVazios.push('Nome');
    if (!telefoneRaw) camposVazios.push('Telefone');
    if (!valorRaw)   camposVazios.push('Valor');
    if (!venctoRaw)  camposVazios.push('Vencimento');
    if (!diasRaw)    camposVazios.push('Dias atraso');

    if (camposVazios.length > 0) {
      contErros++;
      addLog(`Linha ${i+1}: ERRO — campo(s) obrigatório(s) vazio(s): ${camposVazios.join(', ')}`, 'err');
    } else {
      try {
        const jaEnviado = await dbRegistroJaEnviado(cpf, contrato);
        if (jaEnviado && jaEnviado.status === 'enviado' && !apenasErros) {
          contIgnorados++;
          addLog(`${cpf} / ${contrato} — IGNORADO (já enviado)`, 'skip');
        } else {
          // ─── DISPARO PARA O FORMULÁRIO ITSCOM ───
          const resultDisparo = await dispararRegistroFormulario(row, cpf, contrato);
          const statusDisparo = resultDisparo.success ? 'enviado' : 'erro';
          await dbInserirRegistro({ cpf_cnpj: cpf, numero_contrato: contrato, arquivo_id: arquivoId, dados_originais: row, status: statusDisparo });
          if (resultDisparo.success) {
            contEnviados++;
            addLog(`${cpf} / ${contrato} — enviado ✓ (contactId: ${resultDisparo.contactId || '—'})`, 'ok');
          } else {
            contErros++;
            addLog(`${cpf} / ${contrato} — ERRO disparo: ${resultDisparo.error}`, 'err');
            try { await dbMarcarRegistroErro(cpf, contrato, arquivoId, row); } catch {}
          }
        }
      } catch (e) {
        contErros++;
        addLog(`${cpf} / ${contrato} — ERRO: ${e.message}`, 'err');
        try { await dbMarcarRegistroErro(cpf, contrato, arquivoId, row); } catch {}
      }
    }

    if ((i + 1) % LOTE === 0 || i === rowsParaProcessar.length - 1) {
      atualizarProgresso(i + 1, rowsParaProcessar.length, contEnviados, contIgnorados, contErros);
      await sleep(0);
    }
  }

  // Finaliza
  const tempoSeg = Math.round((Date.now() - inicio) / 1000);
  const status = contErros === 0 ? 'processado' : (contEnviados > 0 ? 'parcial' : 'erro');

  const pastaNome = state.arquivoVemDePasta && state.dirHandle ? state.dirHandle.name : null;
  const nomeArquivoLog = pastaNome ? `${pastaNome}/${state.arquivoAtual?.name || loteDesc}` : loteDesc;

  await dbAtualizarArquivo(arquivoId, { status, quantidade_registros: contTotal, quantidade_enviados: contEnviados, quantidade_erros: contErros, quantidade_pendentes: 0, tempo_processamento: tempoSeg });
  await dbRegistrarLog({
    acao: 'DISPARO_CONCLUIDO',
    arquivo_nome: nomeArquivoLog,
    quantidade_total: contTotal,
    quantidade_ok: contEnviados,
    quantidade_erro: contErros,
    status: status === 'erro' ? 'erro' : 'ok',
    detalhes: {
      tempo_seg: tempoSeg,
      ...(pastaNome ? { pasta: pastaNome, arquivo: state.arquivoAtual?.name } : {}),
    },
  });

  const tipoFinal = contErros === 0 ? 'success' : (contEnviados > 0 ? 'warning' : 'danger');
  mostrarAlerta(`Concluído em ${formatTempo(tempoSeg)}: ${contEnviados} enviados, ${contIgnorados} ignorados, ${contErros} erros.`, tipoFinal, 0);
  addLog('─── Processamento concluído ───');
  mostrarResultadoEnvio({ lote: loteDesc, total: contTotal, enviados: contEnviados, ignorados: contIgnorados, erros: contErros, tempo: tempoSeg });

  // Move para Processados se veio de pasta e 100% enviado
  if (state.arquivoVemDePasta && contErros === 0 && contEnviados > 0 && state.arquivoAtual) {
    const movido = await moverParaProcessados(state.arquivoAtual);
    if (movido) {
      addLog(`📁 Movido para ${pastaNome}/Processados/${state.arquivoAtual.name}`, 'ok');
      setTimeout(() => varrerPasta(), 1500); // atualiza lista após mover
    }
  }
}

function mostrarResultadoEnvio({ lote, total, enviados, ignorados, erros, tempo }) {
  const div = document.getElementById('resultado-envio');
  const temErros = erros > 0;
  const tudo = enviados === total;
  document.getElementById('resultado-titulo').textContent = temErros ? (enviados > 0 ? 'Disparo concluído com avisos' : 'Disparo com erros') : 'Disparo concluído com sucesso!';
  document.getElementById('resultado-lote').textContent = `Lote: ${lote}`;
  document.getElementById('resultado-enviados').textContent = enviados;
  document.getElementById('resultado-ignorados').textContent = ignorados;
  document.getElementById('resultado-erros').textContent = erros;
  document.getElementById('resultado-tempo').textContent = formatTempo(tempo);
  div.className = `resultado-envio ${temErros ? (tudo ? 'resultado-parcial' : 'resultado-erro') : 'resultado-ok'}`;
  div.classList.remove('hidden');
  div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.getElementById('btn-novo-disparo').addEventListener('click', () => {
  document.getElementById('resultado-envio').classList.add('hidden');
  document.getElementById('progresso-container').classList.add('hidden');
  document.getElementById('direto-preview').classList.add('hidden');
  document.getElementById('textarea-direto').value = '';
  state.dadosDiretos = [];
  limparAlertas();
});

function atualizarProgresso(atual, total, enviados, ignorados, erros) {
  const pct = total > 0 ? Math.round((atual / total) * 100) : 0;
  document.getElementById('progresso-fill').style.width = pct + '%';
  document.getElementById('progresso-pct').textContent = pct + '%';
  document.getElementById('prog-total').textContent = total;
  document.getElementById('prog-enviados').textContent = enviados;
  document.getElementById('prog-ignorados').textContent = ignorados;
  document.getElementById('prog-erros').textContent = erros;
}

// ─── STOP BUTTON ─────────────────────────────────────────────────────────────

document.getElementById('btn-cancelar-processamento').addEventListener('click', () => {
  state.cancelando = true;
  document.getElementById('btn-cancelar-processamento').disabled = true;
  document.getElementById('btn-cancelar-processamento').textContent = 'Cancelando...';
});

// ─── MODO 2: MONITORAMENTO DE PASTA ──────────────────────────────────────────

document.getElementById('btn-selecionar-pasta').addEventListener('click', selecionarPasta);
document.getElementById('btn-buscar-agora').addEventListener('click', varrerPasta);
document.getElementById('btn-iniciar-monitoramento').addEventListener('click', iniciarMonitoramento);
document.getElementById('btn-parar-monitoramento').addEventListener('click', pararMonitoramento);

async function selecionarPasta() {
  if (!window.showDirectoryPicker) { mostrarAlerta('Seu browser não suporta seleção de pasta. Use Chrome ou Edge.', 'danger', 0); return; }
  try {
    state.dirHandle = await window.showDirectoryPicker();
    const el = document.getElementById('pasta-nome');
    el.textContent = state.dirHandle.name;
    el.classList.add('ativa');
    document.getElementById('btn-buscar-agora').disabled = false;
    document.getElementById('btn-iniciar-monitoramento').disabled = false;
    mostrarAlerta(`Pasta selecionada: ${state.dirHandle.name}`, 'success');
    await varrerPasta();
  } catch (e) { if (e.name !== 'AbortError') mostrarAlerta('Erro: ' + e.message, 'danger'); }
}

async function varrerPasta() {
  if (!state.dirHandle) return;
  limparAlertas();
  const listaEl = document.getElementById('lista-pasta-arquivos');
  listaEl.innerHTML = '';
  const encontrados = [];

  for await (const entry of state.dirHandle.values()) {
    if (entry.kind !== 'file' || !isArquivoValido(entry.name)) continue;
    const file = await entry.getFile();
    const hash = await calcularHashSHA256(file);
    const jaProc = state.arquivosProcessadosLocalmente.has(hash) || (getSupabase() ? await dbArquivoJaProcessado(hash) : false);
    encontrados.push({ file, hash, jaProcessado: !!jaProc });
  }

  document.getElementById('pasta-count').textContent = encontrados.length;
  document.getElementById('pasta-arquivos-encontrados').classList.remove('hidden');

  // Reseta seleção
  document.getElementById('chk-select-all').checked = false;
  document.getElementById('pasta-delete-bar').classList.add('hidden');

  if (!encontrados.length) { listaEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px">Nenhum arquivo XLSX/CSV encontrado.</div>'; mostrarAlerta('Nenhum arquivo encontrado na pasta.', 'info'); return; }

  const atualizarBarraSelecao = () => {
    const checks = listaEl.querySelectorAll('.item-chk');
    const selecionados = [...checks].filter(c => c.checked);
    const bar = document.getElementById('pasta-delete-bar');
    const chkAll = document.getElementById('chk-select-all');
    if (selecionados.length > 0) {
      bar.classList.remove('hidden');
      document.getElementById('pasta-sel-count').textContent = `${selecionados.length} selecionado(s)`;
      chkAll.checked = selecionados.length === checks.length;
      chkAll.indeterminate = selecionados.length > 0 && selecionados.length < checks.length;
    } else {
      bar.classList.add('hidden');
      chkAll.checked = false;
      chkAll.indeterminate = false;
    }
  };

  let novos = 0;
  for (const { file, hash, jaProcessado } of encontrados) {
    const item = document.createElement('div');
    item.className = 'pasta-item';
    const sc = jaProcessado ? 'status-processado' : 'status-novo';
    const st = jaProcessado ? 'Já processado' : 'Novo';

    item.innerHTML = `
      <label class="pasta-item-check-wrap" title="Selecionar">
        <input type="checkbox" class="item-chk" data-nome="${file.name}">
        <span class="custom-check"></span>
      </label>
      <span>📄</span>
      <span class="pasta-item-nome">${file.name}</span>
      <span class="pasta-item-size">${formatBytes(file.size)}</span>
      <span class="pasta-item-status ${sc}">${st}</span>
      ${!jaProcessado ? `<button class="btn btn-success" style="padding:4px 10px;font-size:11px">Processar</button>` : ''}
    `;

    // Checkbox → highlight + barra
    item.querySelector('.item-chk').addEventListener('change', function() {
      item.classList.toggle('selecionado', this.checked);
      atualizarBarraSelecao();
    });

    if (!jaProcessado) {
      novos++;
      item.querySelector('button').addEventListener('click', async () => {
        if (getSupabase() && await dbArquivoJaProcessado(hash)) { mostrarAlerta('Arquivo já processado.', 'warning'); return; }
        ocultarErroPasta();
        let rows;
        try { rows = await parseArquivo(file); } catch (e) { mostrarErroPasta('Erro ao ler arquivo', e.message); return; }
        state.arquivoAtual = file;
        state.hashAtual = hash;
        state.rowsParseadas = rows;
        const colunas = Object.keys(rows[0] || {});
        const { cpfCol, contratoCol } = detectarColunas(colunas);
        const diagnostico = validarColunas(colunas);
        if (cpfCol && contratoCol) {
          state.colCpf = cpfCol;
          state.colContrato = contratoCol;
          state.arquivosProcessadosLocalmente.add(hash);
          state.arquivoVemDePasta = true;
          prepararDisparo(rows, 'arquivo');
        } else {
          const faltam = diagnostico.filter(c => c.req && !c.encontrada).map(c => c.key);
          mostrarErroPasta(
            `Colunas obrigatórias não encontradas em "${file.name}"`,
            `Não foi possível identificar: ${faltam.join(', ')}. Verifique o cabeçalho do arquivo.`,
            diagnostico
          );
          await dbRegistrarLog({ acao: 'ERRO_ARQUIVO', arquivo_nome: file.name, status: 'erro', detalhes: { motivo: 'colunas_faltando', faltam } });
        }
      });
    }
    listaEl.appendChild(item);
  }

  // Select All
  document.getElementById('chk-select-all').onchange = function() {
    listaEl.querySelectorAll('.item-chk').forEach(c => {
      c.checked = this.checked;
      c.closest('.pasta-item').classList.toggle('selecionado', this.checked);
    });
    atualizarBarraSelecao();
  };

  // Remover da lista (só UI — não apaga do disco)
  document.getElementById('btn-excluir-selecionados').onclick = () => {
    const checks = [...listaEl.querySelectorAll('.item-chk:checked')];
    if (!checks.length) return;
    checks.forEach(c => c.closest('.pasta-item').remove());
    atualizarBarraSelecao();
    const restantes = listaEl.querySelectorAll('.pasta-item').length;
    document.getElementById('pasta-count').textContent = restantes;
    document.getElementById('chk-select-all').checked = false;
    if (!restantes) mostrarAlerta('Nenhum arquivo na lista.', 'info');
  };

  if (novos === 0) mostrarAlerta('Nenhum arquivo novo encontrado.', 'info');
  else mostrarAlerta(`${novos} arquivo(s) novo(s) encontrado(s).`, 'success');
}

function iniciarMonitoramento() {
  const min = parseInt(document.getElementById('input-intervalo').value) || 5;
  state.monitoramentoTimer = setInterval(varrerPasta, min * 60000);
  document.getElementById('btn-iniciar-monitoramento').classList.add('hidden');
  document.getElementById('btn-parar-monitoramento').classList.remove('hidden');
  document.getElementById('monitor-status').classList.remove('hidden');
  document.getElementById('monitor-status-text').textContent = `Monitorando a cada ${min} minuto(s)...`;
  mostrarAlerta(`Monitoramento iniciado — varredura a cada ${min} min.`, 'success');
}

function pararMonitoramento() {
  if (state.monitoramentoTimer) { clearInterval(state.monitoramentoTimer); state.monitoramentoTimer = null; }
  document.getElementById('btn-parar-monitoramento').classList.add('hidden');
  document.getElementById('btn-iniciar-monitoramento').classList.remove('hidden');
  document.getElementById('monitor-status').classList.add('hidden');
  mostrarAlerta('Monitoramento pausado.', 'info');
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

async function carregarDashboard(filtros = {}) {
  const stats = await dbEstatisticasGerais();
  document.getElementById('kpi-arquivos-processados').textContent = stats.arquivos;
  document.getElementById('kpi-arquivos-ignorados').textContent = state.arquivosIgnorados;
  document.getElementById('kpi-total-registros').textContent = stats.registros;
  document.getElementById('kpi-total-enviados').textContent = stats.enviados;
  document.getElementById('kpi-total-erros').textContent = stats.erros;
  document.getElementById('kpi-eficiencia').textContent = stats.registros > 0 ? Math.round((stats.enviados / stats.registros) * 100) + '%' : '—';

  const arquivos = await dbListarArquivos(filtros);
  const tbody = document.getElementById('dash-tbody');
  tbody.innerHTML = '';

  if (!arquivos.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Nenhum arquivo encontrado</td></tr>'; return; }

  for (const arq of arquivos) {
    const tr = document.createElement('tr');
    const sc = `status-${arq.status}`;
    const sl = arq.status === 'processado' ? 'Sucesso' : arq.status === 'parcial' ? 'Parcial' : 'Erro';
    const ignorados = Math.max(0, (arq.quantidade_registros||0) - (arq.quantidade_enviados||0) - (arq.quantidade_erros||0));
    const temErros = (arq.quantidade_erros||0) > 0;
    tr.innerHTML = `
      <td class="td-nome" title="${arq.nome_arquivo}">${arq.nome_arquivo}</td>
      <td style="white-space:nowrap">${formatDateTime(arq.data_processamento)}</td>
      <td class="td-num">${arq.quantidade_registros??0}</td>
      <td class="td-num" style="color:var(--success)">${arq.quantidade_enviados??0}</td>
      <td class="td-num" style="color:var(--warning)">${ignorados}</td>
      <td class="td-num" style="color:var(--danger)">${arq.quantidade_erros??0}</td>
      <td style="white-space:nowrap">${formatTempo(arq.tempo_processamento)}</td>
      <td><span class="status-badge ${sc}">${sl}</span></td>
      <td><button class="btn-reprocessar" data-id="${arq.id}" data-nome="${arq.nome_arquivo}" data-erros="${arq.quantidade_erros}" data-enviados="${arq.quantidade_enviados}" ${!temErros?'disabled':''}>Reprocessar</button></td>`;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.btn-reprocessar:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      state.reprocessarArquivoId = btn.dataset.id;
      document.getElementById('modal-arquivo-nome').textContent = btn.dataset.nome;
      document.getElementById('modal-erros').textContent = btn.dataset.erros;
      document.getElementById('modal-enviados-ok').textContent = btn.dataset.enviados;
      document.getElementById('modal-reprocessar').classList.remove('hidden');
    });
  });
}

document.getElementById('btn-filtrar').addEventListener('click', () => {
  carregarDashboard({ data_ini: document.getElementById('filtro-data-ini').value, data_fim: document.getElementById('filtro-data-fim').value, nome: document.getElementById('filtro-nome').value, status: document.getElementById('filtro-status').value });
});
document.getElementById('btn-limpar-filtros').addEventListener('click', () => {
  ['filtro-data-ini','filtro-data-fim','filtro-nome'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('filtro-status').value = '';
  carregarDashboard();
});
document.getElementById('btn-atualizar-dash').addEventListener('click', () => carregarDashboard());

// ─── MODAL REPROCESSAR ────────────────────────────────────────────────────────

document.getElementById('modal-close').addEventListener('click', () => { document.getElementById('modal-reprocessar').classList.add('hidden'); });
document.getElementById('btn-cancelar-reprocessar').addEventListener('click', () => { document.getElementById('modal-reprocessar').classList.add('hidden'); });
document.getElementById('btn-confirmar-reprocessar').addEventListener('click', async () => {
  document.getElementById('modal-reprocessar').classList.add('hidden');
  if (!state.rowsParseadas.length && !state.dadosDiretos.length) {
    mostrarAlerta('Carregue o arquivo original novamente para reprocessar.', 'warning', 0);
    document.querySelectorAll('.tab-btn')[0].click();
    return;
  }
  await iniciarProcessamento(true);
  await dbRegistrarLog({ acao: 'REPROCESSAMENTO', arquivo_nome: document.getElementById('modal-arquivo-nome').textContent, status: 'ok' });
});

// ─── LOGS ─────────────────────────────────────────────────────────────────────

async function carregarLogs(filtros = {}) {
  const logs = await dbListarLogs(filtros);
  const tbody = document.getElementById('logs-tbody');
  tbody.innerHTML = '';

  if (!logs.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Nenhum log registrado</td></tr>'; return; }

  for (const log of logs) {
    const tr = document.createElement('tr');
    const sBadge = log.status === 'ok' ? 'status-processado' : log.status === 'cancelado' ? 'status-parcial' : 'status-erro';
    const sLabel = log.status === 'ok' ? 'OK' : log.status === 'cancelado' ? 'Cancelado' : 'Erro';
    const acaoBadge = `<span class="log-acao-badge log-${log.acao}">${log.acao.replace(/_/g,' ')}</span>`;

    // Monta coluna Pasta/Arquivo
    let detObj = null;
    try { detObj = log.detalhes ? JSON.parse(log.detalhes) : null; } catch {}
    let caminhoHtml;
    if (detObj?.pasta && detObj?.arquivo) {
      caminhoHtml = `<span class="log-pasta">📁 ${detObj.pasta}/</span><br><span class="log-arquivo">📄 ${detObj.arquivo}</span>`;
    } else {
      const nome = log.arquivo_nome || '—';
      caminhoHtml = `<span title="${nome}">${nome}</span>`;
    }

    tr.innerHTML = `
      <td class="log-dt">${formatDateTime(log.timestamp)}</td>
      <td>${acaoBadge}</td>
      <td class="td-nome">${caminhoHtml}</td>
      <td class="td-num">${log.quantidade_total||0}</td>
      <td class="td-num" style="color:var(--success)">${log.quantidade_ok||0}</td>
      <td class="td-num" style="color:var(--danger)">${log.quantidade_erro||0}</td>
      <td><span class="status-badge ${sBadge}">${sLabel}</span></td>
      <td>${detObj ? `<button class="log-detalhes-btn" data-det='${JSON.stringify(detObj)}'>Ver</button>` : '—'}</td>`;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.log-detalhes-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      try {
        const d = JSON.parse(btn.dataset.det);
        const linhas = Object.entries(d).map(([k,v]) => `${k}: ${v}`).join('\n');
        alert(linhas);
      } catch { alert(btn.dataset.det); }
    });
  });
}

document.getElementById('btn-filtrar-logs').addEventListener('click', () => {
  carregarLogs({ acao: document.getElementById('filtro-log-acao').value, status: document.getElementById('filtro-log-status').value, data: document.getElementById('filtro-log-data').value });
});
document.getElementById('btn-atualizar-logs').addEventListener('click', () => carregarLogs());

// ─── CONFIGURAÇÕES ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const { url, key } = carregarCredenciaisSalvas();
  document.getElementById('cfg-url').value = url;
  document.getElementById('cfg-key').value = key;
  document.getElementById('sql-block').textContent = SQL_CRIAR_TABELAS;

  if (url && key) {
    document.getElementById('config-status').textContent = '✓ Conectado';
    document.getElementById('config-status').className = 'config-status config-ok';
  }
});

document.getElementById('btn-salvar-config').addEventListener('click', async () => {
  const url = document.getElementById('cfg-url').value.trim();
  const key = document.getElementById('cfg-key').value.trim();
  const status = document.getElementById('config-status');

  if (!url || !key) { status.textContent = '✕ Preencha URL e Key'; status.className = 'config-status config-fail'; return; }

  const sb = salvarCredenciais(url, key);
  if (!sb) { status.textContent = '✕ Erro ao conectar'; status.className = 'config-status config-fail'; return; }

  try {
    const { error } = await sb.from('arquivos_processados').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    status.textContent = '✓ Conectado com sucesso';
    status.className = 'config-status config-ok';
    limparAlertas();
  } catch (e) {
    status.textContent = '✕ ' + (e.message || 'Erro de conexão');
    status.className = 'config-status config-fail';
  }
});

document.getElementById('btn-copiar-sql').addEventListener('click', () => {
  navigator.clipboard.writeText(SQL_CRIAR_TABELAS).then(() => {
    const btn = document.getElementById('btn-copiar-sql');
    btn.textContent = '✓ Copiado!';
    setTimeout(() => { btn.textContent = '📋 Copiar'; }, 2000);
  });
});

// ─── INIT ─────────────────────────────────────────────────────────────────────

window.addEventListener('load', () => {
  // Garante Upload Manual visível por padrão
  document.querySelectorAll('.mode-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('modo-manual')?.classList.remove('hidden');
  document.querySelectorAll('.mode-option').forEach(l => l.classList.remove('active'));
  document.getElementById('label-manual')?.classList.add('active');
});
