import { sb } from './supabaseClient.js';

// Tabela `turmas` do Sistema de Presença: id, turma (nome, ex. "Segunda
// 14:00"), curso (texto livre), professor_id (quem dá aula) e ativa.
// Vem tudo; quem descarta as turmas encerradas é `turmaAtiva()`.
export async function buscarTurmas() {
  const { data, error } = await sb.from('turmas').select('*').order('turma');
  if (error) throw error;
  return data ?? [];
}
