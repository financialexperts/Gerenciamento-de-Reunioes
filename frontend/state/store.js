// Estado central da aba aberta: um objeto só, lido e alterado pelas telas.
export const state = {
  usuario: null,        // usuário do Supabase Auth (id, email)
  perfil: null,         // linha de `professores` desse usuário (nome, papel)
  professores: [],
  turmas: [],           // só turmas ativas, em ordem de dia da semana
  categorias: null,     // categorias de reunião, iguais para todos; null = ainda não carregadas
  filtros: { texto: '', curso: '', turmaId: '' },
};
