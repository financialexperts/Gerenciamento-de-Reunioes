import { escapeHtml } from './dom.js';

// Tela vazia, de erro ou sem resultado no lugar de uma grade: o que
// aconteceu e, quando há, o próximo passo (HIG › Writing).
export function estadoHtml({ icone, titulo, texto, acao }) {
  return `
    <svg class="icone" aria-hidden="true"><use href="#${icone}"/></svg>
    <h3 class="estado__titulo">${escapeHtml(titulo)}</h3>
    <p class="estado__texto">${escapeHtml(texto)}</p>
    ${acao ? `<button type="button" class="botao-secundario" data-acao="${acao[0]}">${escapeHtml(acao[1])}</button>` : ''}`;
}
