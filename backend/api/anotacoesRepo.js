import { sb } from './supabaseClient.js';

// Anotações das reuniões (tabela `anotacoes_reuniao`): cada reunião tem uma
// página por categoria, uma linha por par reunião + categoria, criada no
// primeiro salvamento. Pelo RLS, só admin lê e grava.

// null = essa categoria da reunião ainda não tem anotações.
export async function buscarAnotacoes(reuniaoId, categoriaId) {
  const { data, error } = await sb
    .from('anotacoes_reuniao')
    .select('conteudo, atualizado_em')
    .eq('reuniao_id', reuniaoId)
    .eq('categoria_id', categoriaId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Grava por cima (cria a linha na primeira vez). `atualizado_em` e
// `atualizado_por` são preenchidos pelo banco.
export async function salvarAnotacoes({ reuniao_id, categoria_id, conteudo, resumo }) {
  return sb
    .from('anotacoes_reuniao')
    .upsert({ reuniao_id, categoria_id, conteudo, resumo }, { onConflict: 'reuniao_id,categoria_id' })
    .select('atualizado_em')
    .single();
}

// O começo do texto das anotações de todas as reuniões de um professor,
// para os cartões da página dele: Map de id da reunião → Map de id da
// categoria → resumo.
export async function buscarResumosDoProfessor(professorId) {
  const { data, error } = await sb
    .from('anotacoes_reuniao')
    .select('reuniao_id, categoria_id, resumo, reunioes!inner(professor_id)')
    .eq('reunioes.professor_id', professorId);
  if (error) throw error;
  const resumos = new Map();
  for (const linha of data ?? []) {
    const reuniao = String(linha.reuniao_id);
    if (!resumos.has(reuniao)) resumos.set(reuniao, new Map());
    resumos.get(reuniao).set(String(linha.categoria_id), linha.resumo ?? '');
  }
  return resumos;
}

// O mesmo, de uma reunião só (a página dela): Map de id da categoria → resumo.
export async function buscarResumosDaReuniao(reuniaoId) {
  const { data, error } = await sb
    .from('anotacoes_reuniao')
    .select('categoria_id, resumo')
    .eq('reuniao_id', reuniaoId);
  if (error) throw error;
  return new Map((data ?? []).map(linha => [String(linha.categoria_id), linha.resumo ?? '']));
}

// A tabela ainda não existe no banco (o SQL não foi rodado): mesmos
// códigos da falta das outras tabelas.
export function faltaTabelaDeAnotacoes(erro) {
  return erro?.code === 'PGRST205' || erro?.code === '42P01';
}

// O banco ainda está na estrutura antiga, com uma categoria por reunião e
// uma página de anotações por reunião: falta a coluna categoria_id nas
// anotações (42703 ao ler; PGRST204 ao gravar) ou a chave reunião +
// categoria que o "grava por cima" usa (42P10).
export function faltaAtualizarBanco(erro) {
  return ['42703', 'PGRST204', '42P10'].includes(erro?.code);
}
