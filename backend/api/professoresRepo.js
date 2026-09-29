import { sb } from './supabaseClient.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/env.js';

// Tabela `professores` do Sistema de Presença: id, nome, email, papel
// ('admin' | 'professor') e user_id (vínculo com o login do Supabase Auth).
// O RLS decide o que volta: admin enxerga todos; professor, só a si mesmo.
export async function buscarProfessores() {
  const { data, error } = await sb.from('professores').select('*').order('nome');
  if (error) throw error;
  return data ?? [];
}

// Cria a conta de login pelo cadastro público do Supabase Auth — o mesmo
// caminho do Sistema de Presença (professoresRepo.js de lá). Vai por fetch,
// e não por sb.auth.signUp, porque o signUp trocaria a sessão de quem está
// logado pela do professor novo.
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
