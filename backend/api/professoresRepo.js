import { sb } from './supabaseClient.js';

// Tabela `professores` do Sistema de Presença: id, nome, email, papel
// ('admin' | 'professor') e user_id (vínculo com o login do Supabase Auth).
// O RLS decide o que volta: admin enxerga todos; professor, só a si mesmo.
export async function buscarProfessores() {
  const { data, error } = await sb.from('professores').select('*').order('nome');
  if (error) throw error;
  return data ?? [];
}
