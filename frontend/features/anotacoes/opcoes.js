// O que a barra de formatação oferece: estilos de parágrafo, fontes,
// tamanhos e a paleta de cores (a mesma organização do Google Docs).

export const ESTILOS = [
  { valor: 'p', nome: 'Texto normal', atalho: '0' },
  { valor: 'h1', nome: 'Título 1', atalho: '1' },
  { valor: 'h2', nome: 'Título 2', atalho: '2' },
  { valor: 'h3', nome: 'Título 3', atalho: '3' },
];

// "Padrão" é a fonte do sistema (a mesma do resto do app). As do Google
// Fonts carregam só quando a página de anotações abre; as outras já vêm no
// Windows e no Mac, e no celular caem numa parecida.
export const FONTES = [
  { chave: 'padrao', nome: 'Padrão', familia: null },
  { chave: 'arial', nome: 'Arial', familia: 'Arial, Helvetica, sans-serif' },
  { chave: 'caveat', nome: 'Caveat', familia: 'Caveat, cursive', google: 'Caveat:wght@400;700' },
  { chave: 'courier', nome: 'Courier New', familia: '"Courier New", Courier, monospace' },
  { chave: 'georgia', nome: 'Georgia', familia: 'Georgia, "Times New Roman", serif' },
  { chave: 'lora', nome: 'Lora', familia: 'Lora, Georgia, serif', google: 'Lora:ital,wght@0,400;0,700;1,400;1,700' },
  { chave: 'merriweather', nome: 'Merriweather', familia: 'Merriweather, Georgia, serif', google: 'Merriweather:ital,wght@0,400;0,700;1,400;1,700' },
  { chave: 'montserrat', nome: 'Montserrat', familia: 'Montserrat, Arial, sans-serif', google: 'Montserrat:ital,wght@0,400;0,700;1,400;1,700' },
  { chave: 'opensans', nome: 'Open Sans', familia: '"Open Sans", Arial, sans-serif', google: 'Open+Sans:ital,wght@0,400;0,700;1,400;1,700' },
  { chave: 'playfair', nome: 'Playfair Display', familia: '"Playfair Display", Georgia, serif', google: 'Playfair+Display:ital,wght@0,400;0,700;1,400;1,700' },
  { chave: 'roboto', nome: 'Roboto', familia: 'Roboto, Arial, sans-serif', google: 'Roboto:ital,wght@0,400;0,700;1,400;1,700' },
  { chave: 'times', nome: 'Times New Roman', familia: '"Times New Roman", Times, serif' },
  { chave: 'verdana', nome: 'Verdana', familia: 'Verdana, Geneva, sans-serif' },
];

export const ENDERECO_GOOGLE_FONTS = 'https://fonts.googleapis.com/css2?'
  + FONTES.filter(f => f.google).map(f => `family=${f.google}`).join('&')
  + '&display=swap';

// Em pt, como no Docs. 12 pt (16 px) é o padrão: lê bem e não faz o
// iPhone dar zoom ao tocar no texto.
export const TAMANHOS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96];
export const TAMANHO_PADRAO = 12;

// Paleta de 10 colunas: cinzas, cores vivas e quatro tons de cada uma.
const MATIZES = ['Cereja', 'Vermelho', 'Laranja', 'Amarelo', 'Verde', 'Ciano', 'Azul-centáurea', 'Azul', 'Roxo', 'Magenta'];
const LINHAS_DE_COR = [
  { tom: '', cores: ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'] },
  { tom: 'claro 3', cores: ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'] },
  { tom: 'claro 2', cores: ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'] },
  { tom: 'claro 1', cores: ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'] },
  { tom: 'escuro 1', cores: ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'] },
  { tom: 'escuro 2', cores: ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'] },
];
const CINZAS = [
  ['#000000', 'Preto'], ['#434343', 'Cinza escuro 4'], ['#666666', 'Cinza escuro 3'], ['#999999', 'Cinza escuro 2'],
  ['#b7b7b7', 'Cinza escuro 1'], ['#cccccc', 'Cinza'], ['#d9d9d9', 'Cinza claro 1'], ['#efefef', 'Cinza claro 2'],
  ['#f3f3f3', 'Cinza claro 3'], ['#ffffff', 'Branco'],
];

export const PALETA = [
  CINZAS.map(([cor, nome]) => ({ cor, nome })),
  ...LINHAS_DE_COR.map(({ tom, cores }) => cores.map((cor, i) => ({ cor, nome: tom ? `${MATIZES[i]} ${tom}` : MATIZES[i] }))),
];
