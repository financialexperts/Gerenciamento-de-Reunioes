const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Todo texto vindo do banco passa por aqui antes de entrar em innerHTML.
export function escapeHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);
}

// Para comparar sem diferenciar acento, maiúscula e espaço repetido
// ("José" encontra "jose").
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Iniciais do monograma: primeira letra do primeiro e do último nome
// ("Maria da Silva" → "MS"). Aceita e-mail quando falta o nome.
export function iniciais(nomeOuEmail) {
  const partes = String(nomeOuEmail ?? '').split('@')[0].split(/[\s._-]+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes.at(-1)[0]).toUpperCase();
}

// ["Elas", "Master", "Evolution"] → "Elas, Master e Evolution"
const formatoLista = new Intl.ListFormat('pt-BR', { type: 'conjunction' });
export function listaPorExtenso(itens) {
  return formatoLista.format(itens);
}

export function movimentoReduzido() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Realce azul-claro que se apaga sozinho (cartoes.css › .cartao--realce):
// "você veio daqui" ao voltar para uma grade.
export function realcar(cartao) {
  cartao.classList.remove('cartao--realce');
  void cartao.offsetWidth; // recomeça a animação se já estava rodando
  cartao.classList.add('cartao--realce');
  cartao.addEventListener('animationend', () => cartao.classList.remove('cartao--realce'), { once: true });
}

export function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Botão em espera: desabilita, troca o rótulo ("Entrando…") e mostra o
// indicador. Devolve a função que volta o botão ao normal.
export function ocupado(botao, textoEsperando) {
  const rotulo = botao.querySelector('.rotulo-botao');
  const original = rotulo.textContent;
  rotulo.textContent = textoEsperando;
  botao.disabled = true;
  botao.setAttribute('aria-busy', 'true');
  return () => {
    rotulo.textContent = original;
    botao.disabled = false;
    botao.removeAttribute('aria-busy');
  };
}
