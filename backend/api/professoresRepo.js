import { sb } from './supabaseClient.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/env.js';

export async function buscarProfessores() {
  const { data, error } = await sb.from('professores').select('*').order('nome');
  if (error) throw error;
  return data ?? [];
}

export async function criarContaAuth(email, senha) {
  const resposta = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password: senha }),
  });
  return { status: resposta.status, corpo: await resposta.json().catch(() => ({})) };
}

// Mesma tabela e mesmas colunas que o Sistema de Presença grava: o professor
// aparece lá na hora (Configurações › Professores e ao editar uma turma).
export async function criarPerfilProfessor({ nome, email, papel, user_id }) {
  return sb.from('professores').insert({ nome, email, papel, user_id }).select().single();
}
