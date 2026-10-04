import { sb } from './supabaseClient.js';

// Reuniões de uma categoria com um professor (tabela criada por
// sql/reunioes.sql). Quem vê o quê é o RLS: admin vê todas, o professor
// só as dele; só admin cria.

const COLUNAS = 'id, professor_id, categoria_id, inicio, duracao_min, formato, local, pauta';

export async function buscarReunioes(professorId, categoriaId) {
  const { data, error } = await sb
    .from('reunioes')
    .select(COLUNAS)
    .eq('professor_id', professorId)
    .eq('categoria_id', categoriaId)
    .order('inicio');
  if (error) throw error;
  return data ?? [];
}

// Uma reunião só (a página de anotações aberta pelo endereço). null = não
// existe ou o RLS não deixa ver.
export async function buscarReuniao(id) {
  const { data, error } = await sb.from('reunioes').select(COLUNAS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// `criado_por` fica de fora: o banco preenche com quem está logado.
export async function criarReuniao({ professor_id, categoria_id, inicio, duracao_min, formato, local, pauta }) {
  return sb
    .from('reunioes')
    .insert({ professor_id, categoria_id, inicio, duracao_min, formato, local, pauta })
    .select(COLUNAS)
    .single();
}

// A tabela ainda não existe no banco (o SQL não foi rodado): mesmos
// códigos da falta da tabela de categorias.
export function faltaTabelaDeReunioes(erro) {
  return erro?.code === 'PGRST205' || erro?.code === '42P01';
}
