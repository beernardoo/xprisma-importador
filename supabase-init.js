// supabase-init.js — Inicialização dinâmica (credenciais salvas no localStorage)

const STORAGE_KEY_URL = 'xprisma_supabase_url';
const STORAGE_KEY_KEY = 'xprisma_supabase_key';

let _supabase = null;

function initSupabase(url, key) {
  if (!url || !key) return null;
  try {
    _supabase = supabase.createClient(url, key);
    return _supabase;
  } catch (e) {
    console.error('Erro ao inicializar Supabase:', e);
    return null;
  }
}

function getSupabase() {
  if (_supabase) return _supabase;
  const url = localStorage.getItem(STORAGE_KEY_URL);
  const key = localStorage.getItem(STORAGE_KEY_KEY);
  if (url && key) return initSupabase(url, key);
  return null;
}

function salvarCredenciais(url, key) {
  localStorage.setItem(STORAGE_KEY_URL, url);
  localStorage.setItem(STORAGE_KEY_KEY, key);
  return initSupabase(url, key);
}

function carregarCredenciaisSalvas() {
  const url = localStorage.getItem(STORAGE_KEY_URL) || '';
  const key = localStorage.getItem(STORAGE_KEY_KEY) || '';
  return { url, key };
}

// Auto-inicializa se já houver credenciais salvas
(function () {
  const { url, key } = carregarCredenciaisSalvas();
  if (url && key) initSupabase(url, key);
})();
