import { sb } from './supabaseClient.js';

// Categorias de reunião: uma lista só, igual para todos os professores
// (tabela criada por sql/categorias_reuniao.sql).

const COLUNAS = 'id, nome, icone';

export async function buscarCategorias() {
  const { data, error } = await sb.from('categorias_reuniao').select(COLUNAS).order('id');
  if (error) throw error;
  return data ?? [];
}

export async function criarCategoria({ nome, icone }) {
  return sb.from('categorias_reuniao').insert({ nome, icone }).select(COLUNAS).single();
}

// A tabela ainda não existe no banco (o SQL não foi rodado). O PostgREST
// responde PGRST205; versões mais antigas, o erro 42P01 do próprio Postgres.
export function faltaTabelaDeCategorias(erro) {
  return erro?.code === 'PGRST205' || erro?.code === '42P01';
}
