import { sb } from './supabaseClient.js';

// Anotações das reuniões (tabela criada por sql/anotacoes_reuniao.sql): uma
// linha por reunião, criada no primeiro salvamento. Pelo RLS, só admin lê
// e grava.

// null = a reunião ainda não tem anotações.
export async function buscarAnotacoes(reuniaoId) {
  const { data, error } = await sb
    .from('anotacoes_reuniao')
    .select('conteudo, atualizado_em')
    .eq('reuniao_id', reuniaoId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Grava por cima (cria a linha na primeira vez). `atualizado_em` e
// `atualizado_por` são preenchidos pelo banco.
export async function salvarAnotacoes({ reuniao_id, conteudo, resumo }) {
  return sb
    .from('anotacoes_reuniao')
    .upsert({ reuniao_id, conteudo, resumo }, { onConflict: 'reuniao_id' })
    .select('atualizado_em')
    .single();
}

// O começo do texto das anotações de cada reunião de uma categoria com um
// professor, para os cartões: Map de id da reunião → resumo.
export async function buscarResumos(professorId, categoriaId) {
  const { data, error } = await sb
    .from('anotacoes_reuniao')
    .select('reuniao_id, resumo, reunioes!inner(professor_id, categoria_id)')
    .eq('reunioes.professor_id', professorId)
    .eq('reunioes.categoria_id', categoriaId);
  if (error) throw error;
  return new Map((data ?? []).map(linha => [String(linha.reuniao_id), linha.resumo ?? '']));
}

// A tabela ainda não existe no banco (o SQL não foi rodado): mesmos
// códigos da falta das outras tabelas.
export function faltaTabelaDeAnotacoes(erro) {
  return erro?.code === 'PGRST205' || erro?.code === '42P01';
}
