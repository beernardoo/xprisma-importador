// db.js — Camada de acesso ao banco de dados (Supabase)
// Tabelas: arquivos_processados, registros_processados

// ─── ARQUIVOS PROCESSADOS ────────────────────────────────────────────────────

async function dbArquivoJaProcessado(hash) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from('arquivos_processados')
    .select('id, nome_arquivo, data_processamento, status, quantidade_registros, quantidade_enviados, quantidade_erros')
    .eq('hash_arquivo', hash)
    .maybeSingle();
  return data;
}

async function dbRegistrarArquivo(payload) {
  // payload: { nome_arquivo, hash_arquivo, tamanho_arquivo }
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase não configurado');
  const { data, error } = await sb
    .from('arquivos_processados')
    .insert([{
      nome_arquivo: payload.nome_arquivo,
      hash_arquivo: payload.hash_arquivo,
      tamanho_arquivo: payload.tamanho_arquivo || 0,
      status: 'processado',
      quantidade_registros: 0,
      quantidade_enviados: 0,
      quantidade_erros: 0,
      quantidade_pendentes: 0,
      tempo_processamento: 0,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function dbAtualizarArquivo(id, campos) {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb
    .from('arquivos_processados')
    .update(campos)
    .eq('id', id);
  if (error) console.error('Erro ao atualizar arquivo:', error);
}

async function dbListarArquivos(filtros = {}) {
  const sb = getSupabase();
  if (!sb) return [];
  let q = sb
    .from('arquivos_processados')
    .select('*')
    .order('data_processamento', { ascending: false });

  if (filtros.status)     q = q.eq('status', filtros.status);
  if (filtros.nome)       q = q.ilike('nome_arquivo', `%${filtros.nome}%`);
  if (filtros.data_ini)   q = q.gte('data_processamento', filtros.data_ini);
  if (filtros.data_fim)   q = q.lte('data_processamento', filtros.data_fim + 'T23:59:59');

  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}

async function dbEstatisticasGerais() {
  const sb = getSupabase();
  if (!sb) return { arquivos: 0, registros: 0, enviados: 0, erros: 0 };

  const { data } = await sb
    .from('arquivos_processados')
    .select('quantidade_registros, quantidade_enviados, quantidade_erros');

  if (!data) return { arquivos: 0, registros: 0, enviados: 0, erros: 0 };

  return {
    arquivos: data.length,
    registros: data.reduce((s, r) => s + (r.quantidade_registros || 0), 0),
    enviados:  data.reduce((s, r) => s + (r.quantidade_enviados  || 0), 0),
    erros:     data.reduce((s, r) => s + (r.quantidade_erros     || 0), 0),
  };
}

// ─── REGISTROS PROCESSADOS ────────────────────────────────────────────────────

async function dbRegistroJaEnviado(cpfCnpj, numeroContrato) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from('registros_processados')
    .select('id, status')
    .eq('cpf_cnpj', cpfCnpj)
    .eq('numero_contrato', String(numeroContrato))
    .maybeSingle();
  return data;
}

async function dbInserirRegistro(payload) {
  // payload: { cpf_cnpj, numero_contrato, arquivo_id, dados_originais }
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase não configurado');
  const { data, error } = await sb
    .from('registros_processados')
    .insert([{
      cpf_cnpj: payload.cpf_cnpj,
      numero_contrato: String(payload.numero_contrato),
      arquivo_id: payload.arquivo_id,
      status: 'enviado',
      dados_originais: payload.dados_originais || null,
    }])
    .select()
    .single();
  if (error) {
    // conflito de unicidade — já existe
    if (error.code === '23505') return { jaExistia: true };
    throw error;
  }
  return data;
}

async function dbRegistrosComErro(arquivoId) {
  // Retorna registros do arquivo que têm status 'erro'
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from('registros_processados')
    .select('*')
    .eq('arquivo_id', arquivoId)
    .eq('status', 'erro');
  return data || [];
}

async function dbMarcarRegistroErro(cpfCnpj, numeroContrato, arquivoId, dadosOriginais) {
  const sb = getSupabase();
  if (!sb) return;
  // Tenta inserir como erro; se já existir com sucesso, não sobrescreve
  const existente = await dbRegistroJaEnviado(cpfCnpj, numeroContrato);
  if (existente && existente.status === 'enviado') return; // não sobrescreve sucesso

  if (existente) {
    await sb.from('registros_processados')
      .update({ status: 'erro', arquivo_id: arquivoId })
      .eq('cpf_cnpj', cpfCnpj)
      .eq('numero_contrato', String(numeroContrato));
  } else {
    await sb.from('registros_processados')
      .insert([{
        cpf_cnpj: cpfCnpj,
        numero_contrato: String(numeroContrato),
        arquivo_id: arquivoId,
        status: 'erro',
        dados_originais: dadosOriginais || null,
      }]);
  }
}

async function dbAtualizarStatusRegistro(cpfCnpj, numeroContrato, status) {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('registros_processados')
    .update({ status, data_envio: new Date().toISOString() })
    .eq('cpf_cnpj', cpfCnpj)
    .eq('numero_contrato', String(numeroContrato));
}

// ─── SQL PARA CRIAÇÃO DAS TABELAS ─────────────────────────────────────────────

const SQL_CRIAR_TABELAS = `-- ╔══════════════════════════════════════════╗
-- ║  XPrisma — Criar tabelas no Supabase     ║
-- ╚══════════════════════════════════════════╝

-- 1. Tabela de controle de arquivos processados
CREATE TABLE IF NOT EXISTS arquivos_processados (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_arquivo         TEXT NOT NULL,
  hash_arquivo         TEXT NOT NULL,
  tamanho_arquivo      BIGINT DEFAULT 0,
  data_processamento   TIMESTAMPTZ DEFAULT NOW(),
  status               TEXT CHECK (status IN ('processado','parcial','erro')) DEFAULT 'processado',
  quantidade_registros INTEGER DEFAULT 0,
  quantidade_enviados  INTEGER DEFAULT 0,
  quantidade_erros     INTEGER DEFAULT 0,
  quantidade_pendentes INTEGER DEFAULT 0,
  tempo_processamento  INTEGER DEFAULT 0,  -- segundos
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hash_arquivo)
);

-- 2. Tabela de controle de registros por cliente
CREATE TABLE IF NOT EXISTS registros_processados (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cpf_cnpj         TEXT NOT NULL,
  numero_contrato  TEXT NOT NULL,
  arquivo_id       UUID REFERENCES arquivos_processados(id) ON DELETE SET NULL,
  data_envio       TIMESTAMPTZ DEFAULT NOW(),
  status           TEXT DEFAULT 'enviado',
  dados_originais  JSONB,
  UNIQUE(cpf_cnpj, numero_contrato)
);

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_arquivos_hash
  ON arquivos_processados(hash_arquivo);

CREATE INDEX IF NOT EXISTS idx_arquivos_status
  ON arquivos_processados(status);

CREATE INDEX IF NOT EXISTS idx_registros_chave
  ON registros_processados(cpf_cnpj, numero_contrato);

CREATE INDEX IF NOT EXISTS idx_registros_arquivo
  ON registros_processados(arquivo_id);`;
