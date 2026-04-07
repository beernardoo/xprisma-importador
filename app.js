// app.js — Lógica principal do XPrisma Importador

// ─── ESTADO GLOBAL ────────────────────────────────────────────────────────────
const state = {
  arquivoAtual: null,
  hashAtual: null,
  colCpf: null,
  colContrato: null,
  rowsParseadas: [],
  dirHandle: null,
  monitoramentoTimer: null,
  arquivosProcessadosLocalmente: new Set(), // hashes já processados nesta sessão
  reprocessarArquivoId: null,
  arquivosIgnorados: 0,
};

// ─── UTILS ────────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatDateTime(dt) {
  const d = new Date(dt);
  return d.toLocaleString('pt-BR');
}

function formatTempo(seg) {
  if (!seg) return '—';
  if (seg < 60) return seg + 's';
  return Math.floor(seg / 60) + 'm ' + (seg % 60) + 's';
}

async function calcularHashSHA256(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalizarCpf(val) {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

function isArquivoValido(nome) {
  return /\.(xlsx?|csv)$/i.test(nome);
}

// ─── ALERTAS ─────────────────────────────────────────────────────────────────

function mostrarAlerta(msg, tipo = 'info', duracao = 5000) {
  const container = document.getElementById('alertas');
  const div = document.createElement('div');
  div.className = `alerta alerta-${tipo}`;
  const icones = { success: '✓', warning: '⚠', danger: '✕', info: 'ℹ' };
  div.innerHTML = `<span>${icones[tipo] || 'ℹ'}</span> <span>${msg}</span>`;
  container.appendChild(div);
  if (duracao > 0) setTimeout(() => div.remove(), duracao);
  return div;
}

function limparAlertas() {
  document.getElementById('alertas').innerHTML = '';
}

// ─── TABS ─────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.remove('hidden');
    if (tab === 'dashboard') carregarDashboard();
  });
});

// ─── SELETOR DE MODO ─────────────────────────────────────────────────────────

document.querySelectorAll('input[name="modo"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const modo = radio.value;
    document.getElementById('modo-manual').classList.toggle('hidden', modo !== 'manual');
    document.getElementById('modo-pasta').classList.toggle('hidden', modo !== 'pasta');
    document.getElementById('label-manual').classList.toggle('active', modo === 'manual');
    document.getElementById('label-pasta').classList.toggle('active', modo === 'pasta');
    limparAlertas();
  });
});

// ─── MODO 1: UPLOAD MANUAL ────────────────────────────────────────────────────

const uploadArea   = document.getElementById('upload-area');
const inputArquivo = document.getElementById('input-arquivo');
const arquivoInfo  = document.getElementById('arquivo-info');

// Abrir seletor
document.getElementById('btn-selecionar').addEventListener('click', () => inputArquivo.click());
uploadArea.addEventListener('click', () => inputArquivo.click());

// Drag & Drop
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && isArquivoValido(file.name)) processarSelecaoArquivo(file);
  else mostrarAlerta('Formato inválido. Use XLSX, XLS ou CSV.', 'danger');
});

inputArquivo.addEventListener('change', () => {
  if (inputArquivo.files[0]) processarSelecaoArquivo(inputArquivo.files[0]);
});

async function processarSelecaoArquivo(file) {
  state.arquivoAtual = file;
  state.hashAtual = null;
  state.colCpf = null;
  state.colContrato = null;
  state.rowsParseadas = [];

  // Exibe informações básicas
  document.getElementById('info-nome').textContent = file.name;
  document.getElementById('info-tamanho').textContent = formatBytes(file.size);
  document.getElementById('info-data').textContent = new Date().toLocaleString('pt-BR');
  document.getElementById('info-hash').textContent = 'calculando...';

  uploadArea.classList.add('hidden');
  arquivoInfo.classList.remove('hidden');
  document.getElementById('col-mapper').classList.add('hidden');
  document.getElementById('progresso-container').classList.add('hidden');

  // Calcula hash em background
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
  document.getElementById('col-mapper').classList.add('hidden');
  document.getElementById('progresso-container').classList.add('hidden');
  limparAlertas();
});

document.getElementById('btn-carregar').addEventListener('click', async () => {
  if (!state.arquivoAtual) return;

  // Verifica se Supabase está configurado
  if (!getSupabase()) {
    mostrarAlerta('Configure as credenciais do Supabase na aba Configurações antes de continuar.', 'warning');
    return;
  }

  limparAlertas();

  // Verifica duplicidade de arquivo
  if (state.hashAtual) {
    const jaExiste = await dbArquivoJaProcessado(state.hashAtual);
    if (jaExiste) {
      state.arquivosIgnorados++;
      mostrarAlerta(
        `Arquivo já processado anteriormente em ${formatDateTime(jaExiste.data_processamento)} — ${jaExiste.quantidade_enviados} registros enviados.`,
        'warning',
        0
      );
      return;
    }
  }

  // Parse do arquivo
  let rows;
  try {
    rows = await parseArquivo(state.arquivoAtual);
  } catch (e) {
    mostrarAlerta('Erro ao ler o arquivo: ' + e.message, 'danger');
    return;
  }

  if (!rows.length) {
    mostrarAlerta('O arquivo não contém dados.', 'warning');
    return;
  }

  state.rowsParseadas = rows;

  // Detecta colunas automaticamente
  const colunas = Object.keys(rows[0]);
  const { cpfCol, contratoCol } = detectarColunas(colunas);

  if (cpfCol && contratoCol) {
    state.colCpf = cpfCol;
    state.colContrato = contratoCol;
    await iniciarProcessamento(false);
  } else {
    abrirColumnMapper(colunas);
  }
});

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
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsArrayBuffer(file);
  });
}

// Detecção automática de colunas CPF/CNPJ e CONTRATO
function detectarColunas(colunas) {
  const cpfPatterns = /^(cpf|cnpj|cpf_cnpj|cpfcnpj|documento|doc|cpf\/cnpj|nr_cpf|num_cpf)$/i;
  const contratoPatterns = /^(contrato|numero_contrato|num_contrato|nr_contrato|cod_contrato|id_contrato|n_contrato|nro_contrato|contrato_numero)$/i;

  const cpfCol      = colunas.find(c => cpfPatterns.test(c.trim()));
  const contratoCol = colunas.find(c => contratoPatterns.test(c.trim()));
  return { cpfCol, contratoCol };
}

// ─── MAPEAMENTO DE COLUNAS ────────────────────────────────────────────────────

function abrirColumnMapper(colunas) {
  const mapper = document.getElementById('col-mapper');
  const selCpf = document.getElementById('select-cpf-col');
  const selCon = document.getElementById('select-contrato-col');

  selCpf.innerHTML = colunas.map(c => `<option value="${c}">${c}</option>`).join('');
  selCon.innerHTML = colunas.map(c => `<option value="${c}">${c}</option>`).join('');

  // Preview da primeira linha
  const preview = state.rowsParseadas[0];
  document.getElementById('col-mapper-preview').textContent =
    'Primeira linha: ' + JSON.stringify(preview).slice(0, 200);

  mapper.classList.remove('hidden');
}

document.getElementById('btn-cancelar-mapper').addEventListener('click', () => {
  document.getElementById('col-mapper').classList.add('hidden');
});

document.getElementById('btn-confirmar-mapper').addEventListener('click', async () => {
  state.colCpf      = document.getElementById('select-cpf-col').value;
  state.colContrato = document.getElementById('select-contrato-col').value;
  document.getElementById('col-mapper').classList.add('hidden');
  await iniciarProcessamento(false);
});

// ─── PROCESSAMENTO PRINCIPAL ──────────────────────────────────────────────────

async function iniciarProcessamento(apenasErros = false) {
  const rows = state.rowsParseadas;
  if (!rows.length) return;

  const inicio = Date.now();
  const nomeArquivo = state.arquivoAtual?.name || 'arquivo.xlsx';

  // Registra o arquivo no banco
  let arquivoId;
  try {
    const reg = await dbRegistrarArquivo({
      nome_arquivo: nomeArquivo,
      hash_arquivo: state.hashAtual || ('sem-hash-' + Date.now()),
      tamanho_arquivo: state.arquivoAtual?.size || 0,
    });
    arquivoId = reg.id;
  } catch (e) {
    mostrarAlerta('Erro ao registrar arquivo no banco: ' + e.message, 'danger');
    return;
  }

  // Exibe progresso
  const progContainer = document.getElementById('progresso-container');
  progContainer.classList.remove('hidden');
  document.getElementById('progresso-arquivo-nome').textContent = nomeArquivo;

  let contTotal    = rows.length;
  let contEnviados = 0;
  let contIgnorados = 0;
  let contErros    = 0;

  atualizarProgresso(0, contTotal, contEnviados, contIgnorados, contErros);

  const logEl = document.getElementById('progresso-log');
  logEl.innerHTML = '';

  const addLog = (msg, tipo = '') => {
    const line = document.createElement('div');
    line.className = `log-line ${tipo ? 'log-' + tipo : ''}`;
    line.textContent = msg;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  };

  // Se reprocessando, filtrar apenas os com erro
  let rowsParaProcessar = rows;
  if (apenasErros && state.reprocessarArquivoId) {
    arquivoId = state.reprocessarArquivoId;
    const registrosComErro = await dbRegistrosComErro(arquivoId);
    const chavesErro = new Set(registrosComErro.map(r => `${r.cpf_cnpj}|${r.numero_contrato}`));
    rowsParaProcessar = rows.filter(row => {
      const cpf = normalizarCpf(row[state.colCpf]);
      const con = String(row[state.colContrato] || '');
      return chavesErro.has(`${cpf}|${con}`);
    });
    contTotal = rowsParaProcessar.length;
    addLog(`Reprocessando ${contTotal} registros com erro...`, '');
  }

  // Processa em lotes para não travar a UI
  const LOTE = 20;
  for (let i = 0; i < rowsParaProcessar.length; i++) {
    const row = rowsParaProcessar[i];
    const cpf = normalizarCpf(row[state.colCpf]);
    const contrato = String(row[state.colContrato] || '').trim();

    if (!cpf || !contrato) {
      contIgnorados++;
      addLog(`Linha ${i + 1}: CPF/CNPJ ou contrato vazio — ignorado`, 'skip');
    } else {
      try {
        const jaEnviado = await dbRegistroJaEnviado(cpf, contrato);
        if (jaEnviado && jaEnviado.status === 'enviado' && !apenasErros) {
          contIgnorados++;
          addLog(`${cpf} / ${contrato} — IGNORADO (já enviado)`, 'skip');
        } else {
          // Envia o registro
          await dbInserirRegistro({
            cpf_cnpj: cpf,
            numero_contrato: contrato,
            arquivo_id: arquivoId,
            dados_originais: row,
          });
          contEnviados++;
          addLog(`${cpf} / ${contrato} — enviado`, 'ok');
        }
      } catch (e) {
        contErros++;
        addLog(`${cpf} / ${contrato} — ERRO: ${e.message}`, 'err');
        try {
          await dbMarcarRegistroErro(cpf, contrato, arquivoId, row);
        } catch {}
      }
    }

    // Atualiza UI a cada lote
    if ((i + 1) % LOTE === 0 || i === rowsParaProcessar.length - 1) {
      atualizarProgresso(i + 1, rowsParaProcessar.length, contEnviados, contIgnorados, contErros);
      await sleep(0); // yield para a UI respirar
    }
  }

  // Finaliza
  const tempoSeg = Math.round((Date.now() - inicio) / 1000);
  const status = contErros === 0 ? 'processado' : (contEnviados > 0 ? 'parcial' : 'erro');

  await dbAtualizarArquivo(arquivoId, {
    status,
    quantidade_registros: contTotal,
    quantidade_enviados: contEnviados,
    quantidade_erros: contErros,
    quantidade_pendentes: 0,
    tempo_processamento: tempoSeg,
  });

  const msgFinal = `Concluído em ${formatTempo(tempoSeg)}: ${contEnviados} enviados, ${contIgnorados} ignorados, ${contErros} erros.`;
  const tipoFinal = contErros === 0 ? 'success' : (contEnviados > 0 ? 'warning' : 'danger');
  mostrarAlerta(msgFinal, tipoFinal, 0);

  addLog('─── Processamento concluído ───');
}

function atualizarProgresso(atual, total, enviados, ignorados, erros) {
  const pct = total > 0 ? Math.round((atual / total) * 100) : 0;
  document.getElementById('progresso-fill').style.width = pct + '%';
  document.getElementById('progresso-pct').textContent = pct + '%';
  document.getElementById('prog-total').textContent = total;
  document.getElementById('prog-enviados').textContent = enviados;
  document.getElementById('prog-ignorados').textContent = ignorados;
  document.getElementById('prog-erros').textContent = erros;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── MODO 2: MONITORAMENTO DE PASTA ──────────────────────────────────────────

document.getElementById('btn-selecionar-pasta').addEventListener('click', selecionarPasta);
document.getElementById('btn-buscar-agora').addEventListener('click', varrerPasta);
document.getElementById('btn-iniciar-monitoramento').addEventListener('click', iniciarMonitoramento);
document.getElementById('btn-parar-monitoramento').addEventListener('click', pararMonitoramento);

async function selecionarPasta() {
  if (!window.showDirectoryPicker) {
    mostrarAlerta('Seu navegador não suporta seleção de pasta. Use Chrome ou Edge.', 'danger', 0);
    return;
  }
  try {
    state.dirHandle = await window.showDirectoryPicker();
    const nomeEl = document.getElementById('pasta-nome');
    nomeEl.textContent = state.dirHandle.name;
    nomeEl.classList.add('ativa');

    document.getElementById('btn-buscar-agora').disabled = false;
    document.getElementById('btn-iniciar-monitoramento').disabled = false;

    mostrarAlerta(`Pasta selecionada: ${state.dirHandle.name}`, 'success');
    await varrerPasta();
  } catch (e) {
    if (e.name !== 'AbortError') mostrarAlerta('Erro ao selecionar pasta: ' + e.message, 'danger');
  }
}

async function varrerPasta() {
  if (!state.dirHandle) return;
  limparAlertas();

  const arquivosContainer = document.getElementById('pasta-arquivos-encontrados');
  const lista = document.getElementById('lista-pasta-arquivos');
  lista.innerHTML = '';

  const encontrados = [];

  for await (const entry of state.dirHandle.values()) {
    if (entry.kind !== 'file' || !isArquivoValido(entry.name)) continue;
    const file = await entry.getFile();
    const hash = await calcularHashSHA256(file);

    const jaProcessado = state.arquivosProcessadosLocalmente.has(hash) ||
                         (getSupabase() ? await dbArquivoJaProcessado(hash) : false);

    encontrados.push({ entry, file, hash, jaProcessado: !!jaProcessado });
  }

  document.getElementById('pasta-count').textContent = encontrados.length;
  arquivosContainer.classList.remove('hidden');

  if (!encontrados.length) {
    lista.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Nenhum arquivo XLSX/CSV encontrado na pasta.</div>';
    mostrarAlerta('Nenhum arquivo novo encontrado.', 'info');
    return;
  }

  let novos = 0;
  for (const { file, hash, jaProcessado } of encontrados) {
    const item = document.createElement('div');
    item.className = 'pasta-item';

    const statusText = jaProcessado ? 'Já processado' : 'Novo';
    const statusClass = jaProcessado ? 'status-processado' : 'status-novo';

    item.innerHTML = `
      <span>📄</span>
      <span class="pasta-item-nome">${file.name}</span>
      <span class="pasta-item-size">${formatBytes(file.size)}</span>
      <span class="pasta-item-status ${statusClass}">${statusText}</span>
      ${!jaProcessado ? `<button class="btn btn-success" style="padding:4px 10px;font-size:11px" data-hash="${hash}">Processar</button>` : ''}
    `;

    if (!jaProcessado) {
      novos++;
      const btnProcessar = item.querySelector('button');
      btnProcessar.addEventListener('click', async () => {
        state.arquivoAtual = file;
        state.hashAtual = hash;

        if (getSupabase()) {
          const jaExiste = await dbArquivoJaProcessado(hash);
          if (jaExiste) {
            mostrarAlerta('Arquivo já processado anteriormente.', 'warning');
            return;
          }
        }

        let rows;
        try { rows = await parseArquivo(file); } catch (e) {
          mostrarAlerta('Erro ao ler arquivo: ' + e.message, 'danger');
          return;
        }

        state.rowsParseadas = rows;
        const colunas = Object.keys(rows[0] || {});
        const { cpfCol, contratoCol } = detectarColunas(colunas);

        if (cpfCol && contratoCol) {
          state.colCpf = cpfCol;
          state.colContrato = contratoCol;
          await iniciarProcessamento(false);
        } else {
          abrirColumnMapper(colunas);
        }

        state.arquivosProcessadosLocalmente.add(hash);
        btnProcessar.disabled = true;
        btnProcessar.textContent = 'Processando...';
        item.querySelector('.pasta-item-status').textContent = 'Processado';
        item.querySelector('.pasta-item-status').className = 'pasta-item-status status-processado';
      });
    }

    lista.appendChild(item);
  }

  if (novos === 0) {
    mostrarAlerta('Nenhum arquivo novo encontrado.', 'info');
  } else {
    mostrarAlerta(`${novos} arquivo(s) novo(s) encontrado(s).`, 'success');
  }
}

function iniciarMonitoramento() {
  if (!state.dirHandle) return;
  const intervaloMin = parseInt(document.getElementById('input-intervalo').value) || 5;
  const intervaloMs = intervaloMin * 60 * 1000;

  state.monitoramentoTimer = setInterval(varrerPasta, intervaloMs);

  document.getElementById('btn-iniciar-monitoramento').classList.add('hidden');
  document.getElementById('btn-parar-monitoramento').classList.remove('hidden');
  document.getElementById('monitor-status').classList.remove('hidden');
  document.getElementById('monitor-status-text').textContent =
    `Monitorando a cada ${intervaloMin} minuto(s)...`;

  mostrarAlerta(`Monitoramento iniciado — varredura a cada ${intervaloMin} min.`, 'success');
}

function pararMonitoramento() {
  if (state.monitoramentoTimer) {
    clearInterval(state.monitoramentoTimer);
    state.monitoramentoTimer = null;
  }
  document.getElementById('btn-parar-monitoramento').classList.add('hidden');
  document.getElementById('btn-iniciar-monitoramento').classList.remove('hidden');
  document.getElementById('monitor-status').classList.add('hidden');
  mostrarAlerta('Monitoramento pausado.', 'info');
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

async function carregarDashboard(filtros = {}) {
  // KPIs
  const stats = await dbEstatisticasGerais();
  document.getElementById('kpi-arquivos-processados').textContent = stats.arquivos;
  document.getElementById('kpi-arquivos-ignorados').textContent = state.arquivosIgnorados;
  document.getElementById('kpi-total-registros').textContent = stats.registros;
  document.getElementById('kpi-total-enviados').textContent = stats.enviados;
  document.getElementById('kpi-total-erros').textContent = stats.erros;

  const efic = stats.registros > 0
    ? Math.round((stats.enviados / stats.registros) * 100) + '%'
    : '—';
  document.getElementById('kpi-eficiencia').textContent = efic;

  // Tabela
  const arquivos = await dbListarArquivos(filtros);
  const tbody = document.getElementById('dash-tbody');
  tbody.innerHTML = '';

  if (!arquivos.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Nenhum arquivo encontrado</td></tr>';
    return;
  }

  for (const arq of arquivos) {
    const tr = document.createElement('tr');
    const statusClass = `status-${arq.status}`;
    const statusLabel = arq.status === 'processado' ? 'Sucesso' : arq.status === 'parcial' ? 'Parcial' : 'Erro';
    const temErros = (arq.quantidade_erros || 0) > 0;

    const ignorados = (arq.quantidade_registros || 0)
                    - (arq.quantidade_enviados || 0)
                    - (arq.quantidade_erros || 0);

    tr.innerHTML = `
      <td class="td-nome" title="${arq.nome_arquivo}">${arq.nome_arquivo}</td>
      <td style="white-space:nowrap">${formatDateTime(arq.data_processamento)}</td>
      <td class="td-num">${arq.quantidade_registros ?? 0}</td>
      <td class="td-num" style="color:var(--success)">${arq.quantidade_enviados ?? 0}</td>
      <td class="td-num" style="color:var(--warning)">${ignorados > 0 ? ignorados : 0}</td>
      <td class="td-num" style="color:var(--danger)">${arq.quantidade_erros ?? 0}</td>
      <td style="white-space:nowrap">${formatTempo(arq.tempo_processamento)}</td>
      <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
      <td>
        <button class="btn-reprocessar" data-id="${arq.id}" data-nome="${arq.nome_arquivo}"
          data-erros="${arq.quantidade_erros}" data-enviados="${arq.quantidade_enviados}"
          ${!temErros ? 'disabled title="Sem erros para reprocessar"' : ''}>
          Reprocessar
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // Botões reprocessar
  tbody.querySelectorAll('.btn-reprocessar:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      state.reprocessarArquivoId = btn.dataset.id;
      document.getElementById('modal-arquivo-nome').textContent = btn.dataset.nome;
      document.getElementById('modal-erros').textContent = btn.dataset.erros;
      document.getElementById('modal-ignorados-modal').textContent = btn.dataset.enviados;
      document.getElementById('modal-reprocessar').classList.remove('hidden');
    });
  });
}

// Filtros
document.getElementById('btn-filtrar').addEventListener('click', () => {
  carregarDashboard({
    data_ini: document.getElementById('filtro-data-ini').value,
    data_fim: document.getElementById('filtro-data-fim').value,
    nome:     document.getElementById('filtro-nome').value,
    status:   document.getElementById('filtro-status').value,
  });
});

document.getElementById('btn-limpar-filtros').addEventListener('click', () => {
  document.getElementById('filtro-data-ini').value = '';
  document.getElementById('filtro-data-fim').value = '';
  document.getElementById('filtro-nome').value = '';
  document.getElementById('filtro-status').value = '';
  carregarDashboard();
});

document.getElementById('btn-atualizar-dash').addEventListener('click', () => carregarDashboard());

// ─── MODAL REPROCESSAR ────────────────────────────────────────────────────────

document.getElementById('modal-close').addEventListener('click', fecharModal);
document.getElementById('btn-cancelar-reprocessar').addEventListener('click', fecharModal);

function fecharModal() {
  document.getElementById('modal-reprocessar').classList.add('hidden');
  state.reprocessarArquivoId = null;
}

document.getElementById('btn-confirmar-reprocessar').addEventListener('click', async () => {
  fecharModal();
  if (!state.rowsParseadas.length) {
    mostrarAlerta('Carregue o arquivo original novamente para reprocessar.', 'warning', 0);
    // Muda para aba importar
    document.querySelectorAll('.tab-btn')[0].click();
    return;
  }
  await iniciarProcessamento(true);
  carregarDashboard();
});

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

  if (!url || !key) {
    status.textContent = '✕ Preencha URL e Key';
    status.className = 'config-status config-fail';
    return;
  }

  const sb = salvarCredenciais(url, key);
  if (!sb) {
    status.textContent = '✕ Erro ao conectar';
    status.className = 'config-status config-fail';
    return;
  }

  // Testa conexão
  try {
    const { error } = await sb.from('arquivos_processados').select('id').limit(1);
    if (error && error.code !== 'PGRST116') throw error;
    status.textContent = '✓ Conectado com sucesso';
    status.className = 'config-status config-ok';
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

// Verifica se Supabase está configurado ao iniciar
window.addEventListener('load', () => {
  if (!getSupabase()) {
    mostrarAlerta('Configure as credenciais do Supabase na aba Configurações para começar.', 'info', 0);
  }
});
