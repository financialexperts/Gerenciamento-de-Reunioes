// Estado central da aba aberta: um objeto só, lido e alterado pelas telas.
export const state = {
  usuario: null,        // usuário do Supabase Auth (id, email)
  perfil: null,         // linha de `professores` desse usuário (nome, papel)
  professores: [],
  turmas: [],           // só turmas ativas, em ordem de dia da semana
  filtros: { texto: '', curso: '', turmaId: '' },
  selecionadoId: null,  // id (em texto) do professor selecionado na grade
};
