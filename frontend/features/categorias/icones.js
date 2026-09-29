// Ícones que uma categoria pode ter. A chave fica gravada em
// categorias_reuniao.icone e o desenho é o símbolo "c-<chave>" do index.html.
export const ICONES_CATEGORIA = [
  { chave: 'balao', nome: 'Conversa' },
  { chave: 'livro', nome: 'Livro' },
  { chave: 'calendario', nome: 'Calendário' },
  { chave: 'alvo', nome: 'Meta' },
  { chave: 'grafico', nome: 'Resultados' },
  { chave: 'lampada', nome: 'Ideia' },
  { chave: 'lista', nome: 'Planejamento' },
  { chave: 'capelo', nome: 'Formação' },
  { chave: 'estrela', nome: 'Destaque' },
  { chave: 'bandeira', nome: 'Prioridade' },
  { chave: 'pessoas', nome: 'Equipe' },
  { chave: 'relogio', nome: 'Horário' },
];

export const ICONE_PADRAO = 'balao';

// Chave que este código não conhece (gravada à mão no banco, por exemplo)
// cai no desenho padrão.
export function simboloDoIcone(chave) {
  const conhecida = ICONES_CATEGORIA.some(icone => icone.chave === chave);
  return `c-${conhecida ? chave : ICONE_PADRAO}`;
}
