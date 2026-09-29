import { normalizar } from './dom.js';

// Teclado das grades de cartões, como numa coleção do macOS: as setas andam
// pela grade (↑ e ↓ pulam uma linha inteira, com o número de colunas que a
// tela mostra agora), Home e End vão às pontas e digitar leva ao primeiro
// nome que começa com o texto — repetir a mesma letra percorre quem começa
// com ela.
export function criarTecladoDaGrade({ grade, seletor, nomeDe }) {
  let digitado = '';
  let timer = 0;

  // Devolve o cartão que deve receber o foco, ou null quando a tecla não é
  // da grade (Enter, Tab, atalhos com Ctrl…).
  function destino(evento) {
    const atual = evento.target.closest(seletor);
    if (!atual || evento.altKey || evento.ctrlKey || evento.metaKey) return null;

    const cartoes = [...grade.querySelectorAll(seletor)];
    const i = cartoes.indexOf(atual);
    const colunas = getComputedStyle(grade).gridTemplateColumns.split(' ').length;
    const saltos = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      ArrowDown: i + colunas,
      ArrowUp: i - colunas,
      Home: 0,
      End: cartoes.length - 1,
    };
    if (evento.key in saltos) {
      evento.preventDefault();
      return cartoes[saltos[evento.key]] ?? null;
    }

    // Espaço só conta como letra no meio de um nome ("ana c").
    const letra = evento.key.length === 1 && evento.key !== '/' && (evento.key !== ' ' || digitado);
    if (!letra) return null;
    evento.preventDefault();
    digitado += evento.key === ' ' ? ' ' : normalizar(evento.key);
    clearTimeout(timer);
    timer = setTimeout(() => { digitado = ''; }, 700);

    const inicio = digitado.length === 1 ? i + 1 : i;
    const ordem = [...cartoes.slice(inicio), ...cartoes.slice(0, inicio)];
    return ordem.find(cartao => nomeDe(cartao).startsWith(digitado)) ?? null;
  }

  return { destino, digitando: () => Boolean(digitado) };
}
