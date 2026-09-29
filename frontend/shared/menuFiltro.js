import { escapeHtml, normalizar } from './dom.js';

// Menu de escolha única que abre de um botão pop-up. Substitui o <select>
// nativo: no Windows a lista dele sai apertada, com o visual antigo do
// sistema, sem busca e sem espaço para a cor do curso ou o professor da
// turma. Segue o padrão listbox da ARIA — setas movem o destaque, Enter
// escolhe, Esc fecha — e o popover do navegador fecha ao clicar fora.
//
// `montar()` é chamado a cada abertura e devolve:
//   { selecionado, todos: Opcao, grupos: [{ titulo?, cor?, opcoes: Opcao[] }] }
//   Opcao = { valor, texto, detalhe?, cor?, rotulo? (frase para leitor de tela) }

let proximoId = 0;

export function criarMenuFiltro({ botao, painel, rotulo, buscaPlaceholder = null, montar, aoEscolher }) {
  const id = `menu-filtro-${++proximoId}`;
  painel.innerHTML = `
    ${buscaPlaceholder ? `
      <div class="menu-filtro__busca">
        <svg class="icone" aria-hidden="true"><use href="#i-lupa"/></svg>
        <input class="menu-filtro__campo" type="search" role="combobox" aria-autocomplete="list"
               aria-expanded="true" aria-controls="${id}-lista" aria-label="${escapeHtml(buscaPlaceholder)}"
               placeholder="${escapeHtml(buscaPlaceholder)}" autocomplete="off" spellcheck="false">
      </div>` : ''}
    <div class="menu-filtro__lista" id="${id}-lista" role="listbox" aria-label="${escapeHtml(rotulo)}"${buscaPlaceholder ? '' : ' tabindex="0"'}></div>
    <p class="menu-filtro__vazio" role="status" hidden></p>`;

  const campo = painel.querySelector('.menu-filtro__campo');
  const lista = painel.querySelector('.menu-filtro__lista');
  const vazio = painel.querySelector('.menu-filtro__vazio');
  const alvoTeclado = campo ?? lista; // tem o foco e o aria-activedescendant
  let opcoes = [];
  let ativa = -1;
  let digitado = '';
  let digitadoTimer = 0;

  botao.setAttribute('popovertarget', painel.id);
  botao.setAttribute('aria-haspopup', 'listbox');
  botao.setAttribute('aria-expanded', 'false');
  // Seta para baixo/cima no botão abre o menu, como num pop-up do macOS.
  botao.addEventListener('keydown', evento => {
    if ((evento.key === 'ArrowDown' || evento.key === 'ArrowUp') && !painel.matches(':popover-open')) {
      evento.preventDefault();
      botao.click();
    }
  });

  painel.addEventListener('beforetoggle', evento => {
    if (evento.newState !== 'open') return;
    if (campo) campo.value = '';
    renderizar();
    posicionar();
  });
  painel.addEventListener('toggle', evento => {
    const aberto = evento.newState === 'open';
    botao.setAttribute('aria-expanded', String(aberto));
    if (!aberto) return;
    posicionar(); // de novo, agora com a largura real do painel
    alvoTeclado.focus({ preventScroll: true });
    opcoes[ativa]?.scrollIntoView({ block: 'nearest' });
  });
  addEventListener('resize', () => {
    if (painel.matches(':popover-open')) posicionar();
  });

  campo?.addEventListener('input', renderizar);
  alvoTeclado.addEventListener('keydown', aoTeclar);

  // O destaque acompanha o ponteiro, como nos menus do Mac.
  lista.addEventListener('pointermove', evento => {
    const opcao = evento.target.closest('[role="option"]');
    if (opcao) destacar(opcoes.indexOf(opcao), false);
  });
  lista.addEventListener('click', evento => {
    const opcao = evento.target.closest('[role="option"]');
    if (opcao) escolher(opcao.dataset.valor);
  });
  // Clicar numa opção não tira o foco do campo de busca.
  lista.addEventListener('mousedown', evento => {
    if (evento.target.closest('.opcao, .menu-filtro__grupo')) evento.preventDefault();
  });

  function renderizar() {
    const { selecionado, todos, grupos } = montar();
    const termo = normalizar(campo?.value);
    let total = 0;

    const opcaoHtml = (opcao, classeExtra = '') => `
      <div class="opcao${classeExtra}" role="option" id="${id}-o${total++}" data-valor="${escapeHtml(opcao.valor)}"
           aria-selected="${opcao.valor === selecionado}"${opcao.rotulo ? ` aria-label="${escapeHtml(opcao.rotulo)}"` : ''}>
        <svg class="icone opcao__check" aria-hidden="true"><use href="#i-check"/></svg>
        ${opcao.cor ? `<span class="opcao__ponto" data-cor="${opcao.cor}" aria-hidden="true"></span>` : ''}
        <span class="opcao__texto">${escapeHtml(opcao.texto)}</span>
        ${opcao.detalhe ? `<span class="opcao__detalhe">${escapeHtml(opcao.detalhe)}</span>` : ''}
      </div>`;

    const partes = termo ? [] : [opcaoHtml(todos, ' opcao--todos')];
    grupos.forEach((grupo, g) => {
      const visiveis = grupo.opcoes.filter(opcao =>
        !termo || normalizar(`${opcao.texto} ${opcao.detalhe ?? ''} ${grupo.titulo ?? ''}`).includes(termo));
      if (!visiveis.length) return;
      const itens = visiveis.map(opcao => opcaoHtml(opcao)).join('');
      partes.push(grupo.titulo
        ? `<div role="group" aria-labelledby="${id}-g${g}">
             <div class="menu-filtro__grupo" id="${id}-g${g}" role="presentation" data-cor="${grupo.cor ?? ''}">${escapeHtml(grupo.titulo)}</div>
             ${itens}
           </div>`
        : itens);
    });

    lista.innerHTML = partes.join('');
    vazio.hidden = total > 0;
    vazio.textContent = total ? '' : `Nada encontrado para “${campo?.value.trim() ?? ''}”.`;
    opcoes = [...lista.querySelectorAll('[role="option"]')];
    ativa = -1;
    // Buscando, o destaque vai para o primeiro resultado; senão, para a opção atual.
    destacar(termo ? 0 : Math.max(0, opcoes.findIndex(o => o.dataset.valor === selecionado)));
  }

  function destacar(indice, rolar = true) {
    if (indice === ativa) return;
    opcoes[ativa]?.classList.remove('ativa');
    ativa = indice;
    const opcao = opcoes[indice];
    if (!opcao) {
      alvoTeclado.removeAttribute('aria-activedescendant');
      return;
    }
    opcao.classList.add('ativa');
    alvoTeclado.setAttribute('aria-activedescendant', opcao.id);
    if (rolar) opcao.scrollIntoView({ block: 'nearest' });
  }

  function aoTeclar(evento) {
    const ultimo = opcoes.length - 1;
    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault();
        destacar(Math.min(ativa + 1, ultimo));
        break;
      case 'ArrowUp':
        evento.preventDefault();
        destacar(Math.max(ativa - 1, 0));
        break;
      case 'PageDown':
        evento.preventDefault();
        destacar(Math.min(ativa + 8, ultimo));
        break;
      case 'PageUp':
        evento.preventDefault();
        destacar(Math.max(ativa - 8, 0));
        break;
      case 'Home':
      case 'End':
        if (campo) return; // no campo de busca, movem o cursor do texto
        evento.preventDefault();
        destacar(evento.key === 'Home' ? 0 : ultimo);
        break;
      case 'Enter':
        evento.preventDefault();
        if (opcoes[ativa]) escolher(opcoes[ativa].dataset.valor);
        break;
      case ' ':
        if (campo) return; // no campo de busca, o espaço é digitado
        evento.preventDefault();
        if (digitado) pularPorDigitacao(' ');
        else if (opcoes[ativa]) escolher(opcoes[ativa].dataset.valor);
        break;
      case 'Tab':
        // Fecha e devolve o foco ao botão; o Tab segue normalmente a partir dele.
        painel.hidePopover();
        botao.focus();
        break;
      default:
        if (!campo && evento.key.length === 1 && !evento.ctrlKey && !evento.metaKey && !evento.altKey) {
          evento.preventDefault();
          pularPorDigitacao(evento.key);
        }
    }
  }

  // Sem campo de busca, digitar leva à primeira opção que começa com o texto.
  function pularPorDigitacao(tecla) {
    digitado += normalizar(tecla) || ' ';
    clearTimeout(digitadoTimer);
    digitadoTimer = setTimeout(() => { digitado = ''; }, 700);
    const inicio = digitado.length === 1 ? ativa + 1 : ativa;
    const ordem = [...opcoes.slice(inicio), ...opcoes.slice(0, inicio)];
    const alvo = ordem.find(opcao => normalizar(opcao.querySelector('.opcao__texto').textContent).startsWith(digitado));
    if (alvo) destacar(opcoes.indexOf(alvo));
  }

  function escolher(valor) {
    painel.hidePopover();
    botao.focus();
    aoEscolher(valor);
  }

  // Abre logo abaixo do botão, sem sair da janela; a lista rola por dentro.
  function posicionar() {
    const r = botao.getBoundingClientRect();
    const larguraJanela = document.documentElement.clientWidth;
    const largura = painel.offsetWidth || parseFloat(getComputedStyle(painel).width) || 304;
    const esquerda = Math.min(r.left, larguraJanela - largura - 8);
    painel.style.left = `${Math.round(Math.max(8, esquerda))}px`;
    painel.style.top = `${Math.round(r.bottom + 6)}px`;
    painel.style.maxHeight = `${Math.round(Math.max(200, Math.min(460, innerHeight - r.bottom - 18)))}px`;
  }

  return {
    fechar() {
      if (painel.matches(':popover-open')) painel.hidePopover();
    },
  };
}
