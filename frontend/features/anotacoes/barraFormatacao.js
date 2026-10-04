import { escapeHtml } from '../../shared/dom.js';
import { MAC, estado, executar } from './editor.js';
import { enderecoDoLink } from './limparHtml.js';
import { ENDERECO_GOOGLE_FONTS, ESTILOS, FONTES, PALETA, TAMANHOS } from './opcoes.js';

// A barra de formatação das anotações. No computador fica no cabeçalho,
// abaixo do título; no celular fica presa logo acima do teclado (como no
// app Notas), com rolagem para os lados. Os botões não tiram o foco do
// texto (mousedown cancelado), então a seleção e o teclado do celular
// continuam onde estavam. Os menus são popovers do navegador.

const MOD = MAC ? '⌘' : 'Ctrl+';
const SHIFT = MAC ? '⇧' : 'Shift+';
const ALT = MAC ? '⌥' : 'Alt+';
const celular = matchMedia('(max-width: 599px)');

const BOTOES = {
  desfazer: { nome: 'Desfazer', icone: 'i-desfazer', atalho: `${MOD}Z` },
  refazer: { nome: 'Refazer', icone: 'i-refazer', atalho: MAC ? `${MOD}${SHIFT}Z` : `${MOD}Y` },
  diminuirFonte: { nome: 'Diminuir tamanho da fonte', icone: 'i-menos', atalho: `${MOD}${SHIFT},` },
  aumentarFonte: { nome: 'Aumentar tamanho da fonte', icone: 'i-mais', atalho: `${MOD}${SHIFT}.` },
  negrito: { nome: 'Negrito', letra: 'B', atalho: `${MOD}B`, alterna: true },
  italico: { nome: 'Itálico', letra: 'I', atalho: `${MOD}I`, alterna: true },
  sublinhado: { nome: 'Sublinhado', letra: 'U', atalho: `${MOD}U`, alterna: true },
  tachado: { nome: 'Tachado', letra: 'S', atalho: `${MOD}${SHIFT}X`, alterna: true },
  marcadores: { nome: 'Lista com marcadores', icone: 'i-lista-marcadores', atalho: `${MOD}${SHIFT}8`, alterna: true },
  numeros: { nome: 'Lista numerada', icone: 'i-lista-numeros', atalho: `${MOD}${SHIFT}7`, alterna: true },
  tarefas: { nome: 'Lista de tarefas', icone: 'i-lista-tarefas', atalho: `${MOD}${SHIFT}9`, alterna: true },
  diminuirRecuo: { nome: 'Diminuir recuo', icone: 'i-recuo-menos', atalho: `${MOD}[` },
  aumentarRecuo: { nome: 'Aumentar recuo', icone: 'i-recuo-mais', atalho: `${MOD}]` },
  limpar: { nome: 'Limpar formatação', icone: 'i-limpar-formatacao', atalho: `${MOD}\\` },
};

const ALINHAMENTOS = [
  { valor: 'left', nome: 'Alinhar à esquerda', atalho: `${MOD}${SHIFT}L` },
  { valor: 'center', nome: 'Centralizar', atalho: `${MOD}${SHIFT}E` },
  { valor: 'right', nome: 'Alinhar à direita', atalho: `${MOD}${SHIFT}R` },
  { valor: 'justify', nome: 'Justificar', atalho: `${MOD}${SHIFT}J` },
];

// Grupos na ordem do computador. No celular o CSS reordena (data-grupo):
// o mais usado primeiro, à mão do polegar.
const GRUPOS = [
  { nome: 'historico', html: () => botao('desfazer') + botao('refazer') },
  { nome: 'estilo', html: () => botaoMenu('estilo', 'Estilo do texto', `<span class="ferramenta__valor" data-mostra="estilo">Texto normal</span>`) },
  { nome: 'fonte', html: () => botaoMenu('fonte', 'Fonte', `<span class="ferramenta__valor" data-mostra="fonte">Padrão</span>`) },
  {
    nome: 'tamanho',
    html: () => botao('diminuirFonte')
      + botaoMenu('tamanho', 'Tamanho da fonte', `<span class="ferramenta__valor" data-mostra="tamanho">12</span>`, { semSeta: true })
      + botao('aumentarFonte'),
  },
  { nome: 'texto', html: () => botao('negrito') + botao('italico') + botao('sublinhado') + botao('tachado') },
  {
    nome: 'cores',
    html: () => botaoMenu('cor', 'Cor do texto', `<span class="ferramenta__letra-cor" aria-hidden="true">A</span><span class="ferramenta__faixa" data-mostra="cor"></span>`, { semSeta: true })
      + botaoMenu('realce', 'Cor de realce', `<svg class="icone" aria-hidden="true"><use href="#i-marcador"/></svg><span class="ferramenta__faixa" data-mostra="realce"></span>`, { semSeta: true }),
  },
  { nome: 'link', html: () => botaoMenu('link', `Inserir link (${MOD}K)`, `<svg class="icone" aria-hidden="true"><use href="#i-link"/></svg>`, { semSeta: true, dialogo: true }) },
  { nome: 'alinhar', html: () => botaoMenu('alinhar', 'Alinhamento', `<svg class="icone" aria-hidden="true"><use href="#i-alinhar-left" data-mostra="alinhar"/></svg>`) },
  { nome: 'listas', html: () => botao('marcadores') + botao('numeros') + botao('tarefas') },
  { nome: 'recuo', html: () => botao('diminuirRecuo') + botao('aumentarRecuo') },
  { nome: 'limpar', html: () => botao('limpar') },
];

const els = {};
let ultimoPonteiro = 0;
let quadro = 0;
let fontesCarregadas = false;

export function iniciarBarra({ barra, menus, editor, cabecalho, principal }) {
  Object.assign(els, { barra, menus, editor, cabecalho, principal });
  barra.innerHTML = GRUPOS.map(g => `<div class="ferramentas__grupo" data-grupo="${g.nome}" role="group">${g.html()}</div>`).join('');
  menus.innerHTML = menuEstilo() + menuFonte() + menuTamanho() + menuCores('cor') + menuCores('realce') + menuAlinhar() + painelLink();
  els.link = {
    painel: document.getElementById('menu-link'),
    form: document.getElementById('form-link'),
    campo: document.getElementById('link-endereco'),
    erro: document.getElementById('link-erro'),
    abrir: document.getElementById('btn-abrir-link'),
    remover: document.getElementById('btn-remover-link'),
  };

  // Clicar num botão não tira o foco nem a seleção do texto.
  for (const area of [barra, menus]) {
    area.addEventListener('mousedown', evento => {
      if (!evento.target.closest('input, label, .painel-link')) evento.preventDefault();
    });
    area.addEventListener('pointerdown', () => { ultimoPonteiro = performance.now(); });
  }
  barra.addEventListener('click', aoClicar);
  menus.addEventListener('click', aoClicar);
  // Aplica antes de fechar: fechar um popover com o foco dentro devolve o
  // foco ao editor e o navegador põe o cursor no começo do texto.
  for (const entrada of menus.querySelectorAll('input[type="color"]')) {
    entrada.addEventListener('change', () => {
      executar(entrada.dataset.comando, entrada.value);
      fecharMenus();
    });
  }

  for (const menu of menus.querySelectorAll('[popover]')) {
    menu.addEventListener('beforetoggle', evento => {
      if (evento.newState === 'open') prepararMenu(menu);
    });
    menu.addEventListener('toggle', evento => aoAlternarMenu(menu, evento.newState === 'open'));
    menu.addEventListener('keydown', evento => navegarNoMenu(menu, evento));
  }
  els.link.form.addEventListener('submit', aplicarLink);
  els.link.campo.addEventListener('input', () => { els.link.erro.hidden = true; });
  els.link.abrir.addEventListener('click', () => {
    const href = estado().link;
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
  });
  els.link.remover.addEventListener('click', () => {
    executar('removerLink');
    els.link.painel.hidePopover();
  });

  // Teclado: uma parada de Tab para a barra inteira; setas andam nela.
  barra.addEventListener('keydown', navegarNaBarra);
  barra.addEventListener('focusin', evento => {
    const item = evento.target.closest('.ferramenta');
    if (item) marcarParada(item);
    item?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });
  marcarParada(barra.querySelector('.ferramenta'));

  // Janela estreita: a barra rola para o lado, e a ponta esmaece quando há
  // mais botões. No computador, a roda do mouse também rola para o lado.
  barra.addEventListener('scroll', marcarPontas, { passive: true });
  new ResizeObserver(marcarPontas).observe(barra);
  barra.addEventListener('wheel', evento => {
    if (barra.scrollWidth <= barra.clientWidth || Math.abs(evento.deltaX) >= Math.abs(evento.deltaY)) return;
    evento.preventDefault();
    barra.scrollLeft += evento.deltaY;
  }, { passive: false });
  celular.addEventListener('change', () => {
    fecharMenus();
    marcarPontas();
  });

  acompanharTeclado();
}

// Os botões refletem o texto onde o cursor está (um quadro por vez).
export function atualizarBarra() {
  if (!quadro) quadro = requestAnimationFrame(() => {
    quadro = 0;
    desenharEstado();
  });
}

export function fecharMenus() {
  for (const menu of els.menus.querySelectorAll(':popover-open')) menu.hidePopover();
}

export function abrirPainelLink() {
  const botao = els.barra.querySelector('[data-menu="link"]');
  ultimoPonteiro = 0; // aberto pelo atalho: o foco vai para o campo
  els.link.painel.showPopover({ source: botao });
}

// As fontes do Google só carregam quando a página de anotações abre.
export function prepararFontes() {
  if (fontesCarregadas) return;
  fontesCarregadas = true;
  for (const [rel, href] of [['preconnect', 'https://fonts.googleapis.com'], ['preconnect', 'https://fonts.gstatic.com'], ['stylesheet', ENDERECO_GOOGLE_FONTS]]) {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    if (href.includes('gstatic')) link.crossOrigin = '';
    document.head.append(link);
  }
}

export function mostrarBarra(visivel) {
  els.barra.closest('[data-tela]').classList.toggle('cabecalho__ferramentas--oculta', !visivel);
  els.barra.inert = !visivel;
  if (!visivel) fecharMenus();
  requestAnimationFrame(marcarPontas);
}

// Celular: o cursor não fica escondido atrás da barra ou do teclado, nem
// embaixo do cabeçalho.
export function mostrarCursor() {
  const sel = getSelection();
  if (!sel.rangeCount || !els.editor.contains(sel.focusNode)) return;
  const faixa = sel.getRangeAt(0).cloneRange();
  faixa.collapse(sel.focusNode === faixa.startContainer && sel.focusOffset === faixa.startOffset);
  let caixa = faixa.getClientRects()[0];
  if (!caixa) {
    const no = sel.focusNode.nodeType === Node.ELEMENT_NODE ? sel.focusNode : sel.focusNode.parentElement;
    caixa = no.getBoundingClientRect();
  }
  const vv = window.visualViewport;
  const topo = els.cabecalho.getBoundingClientRect().bottom + 8;
  const fundo = celular.matches
    ? els.barra.getBoundingClientRect().top - 16
    : (vv ? vv.offsetTop + vv.height : innerHeight) - 24;
  if (caixa.bottom > fundo) els.principal.scrollTop += caixa.bottom - fundo;
  else if (caixa.top < topo) els.principal.scrollTop -= topo - caixa.top;
}

// ---------- Montagem ----------

function botao(comando) {
  const b = BOTOES[comando];
  const titulo = b.atalho ? `${b.nome} (${b.atalho})` : b.nome;
  const desenho = b.letra
    ? `<span class="ferramenta__letra ferramenta__letra--${comando}" aria-hidden="true">${b.letra}</span>`
    : `<svg class="icone" aria-hidden="true"><use href="#${b.icone}"/></svg>`;
  return `<button type="button" class="ferramenta" data-comando="${comando}" aria-label="${escapeHtml(b.nome)}" title="${escapeHtml(titulo)}" tabindex="-1"${b.alterna ? ' aria-pressed="false"' : ''}>${desenho}</button>`;
}

function botaoMenu(menu, nome, conteudo, { semSeta = false, dialogo = false } = {}) {
  const seta = semSeta ? '' : '<svg class="icone ferramenta__seta" aria-hidden="true"><use href="#i-chevron-baixo"/></svg>';
  return `<button type="button" class="ferramenta ferramenta--menu${semSeta ? '' : ' ferramenta--com-seta'}" data-menu="${menu}" popovertarget="menu-${menu}" aria-haspopup="${dialogo ? 'dialog' : 'menu'}" aria-expanded="false" aria-label="${escapeHtml(nome)}" title="${escapeHtml(nome)}" tabindex="-1">${conteudo}${seta}</button>`;
}

function item(comando, valor, conteudo, { rotulo, atalho, estilo = '' } = {}) {
  return `<button type="button" class="menu-formatacao__item" role="menuitemradio" aria-checked="false" data-comando="${comando}" data-valor="${escapeHtml(valor)}"${rotulo ? ` aria-label="${escapeHtml(rotulo)}"` : ''}${estilo ? ` style="${escapeHtml(estilo)}"` : ''} tabindex="-1">
    <svg class="icone menu-formatacao__check" aria-hidden="true"><use href="#i-check"/></svg>
    ${conteudo}
    ${atalho ? `<span class="menu-formatacao__atalho" aria-hidden="true">${escapeHtml(atalho)}</span>` : ''}
  </button>`;
}

function menuEstilo() {
  const itens = ESTILOS.map(e => item('estilo', e.valor, `<span class="menu-formatacao__estilo menu-formatacao__estilo--${e.valor}">${e.nome}</span>`, { atalho: `${MOD}${ALT}${e.atalho}` }));
  return `<div class="menu-formatacao" id="menu-estilo" popover role="menu" aria-label="Estilo do texto">${itens.join('')}</div>`;
}

function menuFonte() {
  const itens = FONTES.map(f => item('fonte', f.chave, `<span>${f.nome}</span>`, { estilo: f.familia ? `font-family: ${f.familia}` : '' }));
  return `<div class="menu-formatacao menu-formatacao--fontes" id="menu-fonte" popover role="menu" aria-label="Fonte">${itens.join('')}</div>`;
}

function menuTamanho() {
  const itens = TAMANHOS.map(t => item('tamanho', String(t), `<span>${t}</span>`));
  return `<div class="menu-formatacao menu-formatacao--tamanhos" id="menu-tamanho" popover role="menu" aria-label="Tamanho da fonte">${itens.join('')}</div>`;
}

function menuCores(tipo) {
  const cor = tipo === 'cor';
  const nenhuma = cor ? 'Automático' : 'Sem cor';
  const amostras = PALETA.map(linha => `<div class="menu-cores__linha" role="none">${linha.map(({ cor: valor, nome }) => `
    <button type="button" class="menu-cores__amostra" role="menuitemradio" aria-checked="false" data-comando="${tipo}" data-valor="${valor}" aria-label="${escapeHtml(nome)}" title="${escapeHtml(nome)}" style="--amostra: ${valor}" tabindex="-1"></button>`).join('')}</div>`).join('');
  return `
    <div class="menu-formatacao menu-cores" id="menu-${tipo}" popover role="menu" aria-label="${cor ? 'Cor do texto' : 'Cor de realce'}">
      <button type="button" class="menu-cores__nenhuma" role="menuitemradio" aria-checked="false" data-comando="${tipo}" data-valor="" tabindex="-1">
        <span class="menu-cores__amostra menu-cores__amostra--${cor ? 'automatica' : 'nenhuma'}" aria-hidden="true"></span>${nenhuma}
      </button>
      <div class="menu-cores__grade" data-colunas="10">${amostras}</div>
      <label class="menu-cores__personalizada">
        <input type="color" data-comando="${tipo}" value="${cor ? '#0071e3' : '#fff2cc'}" aria-label="Escolher outra cor">
        <span class="menu-cores__arco" aria-hidden="true"></span>
        Outra cor…
      </label>
    </div>`;
}

function menuAlinhar() {
  const itens = ALINHAMENTOS.map(a => item('alinhar', a.valor, `<svg class="icone" aria-hidden="true"><use href="#i-alinhar-${a.valor}"/></svg><span>${a.nome}</span>`, { atalho: a.atalho }));
  return `<div class="menu-formatacao" id="menu-alinhar" popover role="menu" aria-label="Alinhamento">${itens.join('')}</div>`;
}

function painelLink() {
  return `
    <div class="menu-formatacao painel-link" id="menu-link" popover role="dialog" aria-label="Link">
      <form class="painel-link__form" id="form-link" novalidate>
        <label class="vh" for="link-endereco">Endereço do link</label>
        <input class="entrada" id="link-endereco" type="text" inputmode="url" enterkeyhint="done" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Cole ou digite um link" aria-describedby="link-erro">
        <button type="submit" class="botao-primario">Aplicar</button>
      </form>
      <p class="painel-link__erro" id="link-erro" role="alert" hidden>Isso não parece um link. Ex.: financialexperts.com.br</p>
      <div class="painel-link__acoes">
        <button type="button" class="botao-texto" id="btn-abrir-link">
          <svg class="icone" aria-hidden="true"><use href="#i-abrir-externo"/></svg>Abrir link
        </button>
        <button type="button" class="botao-texto botao-texto--perigo" id="btn-remover-link">Remover link</button>
      </div>
    </div>`;
}

// ---------- Ações ----------

function aoClicar(evento) {
  const alvo = evento.target.closest('[data-comando]');
  if (!alvo || alvo.disabled || alvo.matches('input')) return;
  const { comando } = alvo.dataset;
  let valor = alvo.dataset.valor;
  if (comando === 'tamanho') valor = Number(valor);
  if ((comando === 'cor' || comando === 'realce') && !valor) valor = null;
  const menu = alvo.closest('[popover]');
  const doTeclado = menu?.contains(document.activeElement);
  executar(comando, valor);
  if (menu) menu.hidePopover();
  // Pelo teclado, o foco volta para o botão do menu (padrão de menu).
  if (doTeclado) els.barra.querySelector(`[data-menu="${menu.id.slice(5)}"]`)?.focus();
}

function aplicarLink(evento) {
  evento.preventDefault();
  const texto = els.link.campo.value.trim();
  if (!enderecoDoLink(texto)) {
    els.link.erro.hidden = false;
    els.link.campo.setAttribute('aria-invalid', 'true');
    els.link.campo.focus();
    return;
  }
  executar('link', texto);
  els.link.painel.hidePopover();
}

// ---------- Menus ----------

function prepararMenu(menu) {
  const e = estado();
  const atual = {
    estilo: e.estilo,
    fonte: chaveDaFonte(e.fonte, e.fontePadrao),
    tamanho: String(e.tamanho),
    cor: corHex(e.cor),
    realce: e.realce ? corHex(e.realce) : '',
    alinhar: e.alinhamento,
  };
  for (const opcao of menu.querySelectorAll('[role="menuitemradio"]')) {
    const valor = atual[opcao.dataset.comando];
    let marcado = valor !== undefined && opcao.dataset.valor.toLowerCase() === String(valor).toLowerCase();
    // "Automático": a cor do texto é a padrão (nenhuma amostra escolhida).
    if (opcao.dataset.comando === 'cor' && opcao.dataset.valor === '') marcado = atual.cor === corHex(getComputedStyle(els.editor).color);
    opcao.setAttribute('aria-checked', String(marcado));
  }
  if (menu === els.link.painel) {
    els.link.campo.value = e.link ?? textoSelecionadoSeForLink();
    els.link.campo.removeAttribute('aria-invalid');
    els.link.erro.hidden = true;
    els.link.abrir.parentElement.hidden = !e.link;
  }
}

function aoAlternarMenu(menu, aberto) {
  const botao = els.barra.querySelector(`[data-menu="${menu.id.slice(5)}"]`);
  botao?.setAttribute('aria-expanded', String(aberto));
  botao?.classList.toggle('ferramenta--aberta', aberto);
  if (!aberto) {
    if (menu.contains(document.activeElement)) botao?.focus({ preventScroll: true });
    return;
  }
  posicionar(menu, botao);
  if (menu === els.link.painel) {
    els.link.campo.focus();
    els.link.campo.select();
    return;
  }
  // Aberto pelo teclado: foco na opção marcada (ou na primeira).
  const pelaTela = performance.now() - ultimoPonteiro < 800;
  const opcoes = itensDoMenu(menu);
  const marcada = opcoes.find(o => o.getAttribute('aria-checked') === 'true');
  if (!pelaTela) (marcada ?? opcoes[0])?.focus();
  marcada?.scrollIntoView({ block: 'nearest' });
}

function posicionar(menu, botao) {
  const vv = window.visualViewport;
  if (celular.matches) {
    // Acima da barra, de ponta a ponta (a barra está no rodapé).
    const topoDaBarra = els.barra.getBoundingClientRect().top;
    Object.assign(menu.style, {
      left: '8px',
      right: '8px',
      top: 'auto',
      bottom: `${document.documentElement.clientHeight - topoDaBarra + 8}px`,
      maxHeight: `${Math.max(160, topoDaBarra - (vv?.offsetTop ?? 0) - 16)}px`,
    });
    return;
  }
  const caixa = (botao ?? els.barra).getBoundingClientRect();
  const largura = menu.offsetWidth;
  Object.assign(menu.style, {
    left: `${Math.round(Math.min(Math.max(8, caixa.left), document.documentElement.clientWidth - largura - 8))}px`,
    right: 'auto',
    top: `${Math.round(caixa.bottom + 6)}px`,
    bottom: 'auto',
    maxHeight: `${Math.round(Math.max(160, innerHeight - caixa.bottom - 18))}px`,
  });
}

function itensDoMenu(menu) {
  return [...menu.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')];
}

// Setas nos menus; na grade de cores, ←→ andam na linha e ↑↓ na coluna.
function navegarNoMenu(menu, evento) {
  if (evento.target.matches('input')) return;
  const opcoes = itensDoMenu(menu);
  const atual = opcoes.indexOf(document.activeElement);
  if (atual < 0) return;
  const grade = document.activeElement.classList.contains('menu-cores__amostra');
  const passo = { ArrowDown: grade ? 10 : 1, ArrowUp: grade ? -10 : -1, ArrowRight: grade ? 1 : 0, ArrowLeft: grade ? -1 : 0 }[evento.key];
  let destino = null;
  if (passo) {
    // Da "Automático" (índice 0) a seta para baixo vai para a primeira amostra.
    destino = opcoes[Math.min(opcoes.length - 1, Math.max(0, atual + (atual === 0 && passo === 10 ? 1 : passo)))];
  }
  if (evento.key === 'Home') destino = opcoes[0];
  if (evento.key === 'End') destino = opcoes.at(-1);
  if (!destino) return;
  evento.preventDefault();
  destino.focus();
}

function navegarNaBarra(evento) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(evento.key) || !evento.target.closest('.ferramenta')) return;
  const itens = paradasDaBarra();
  const atual = itens.indexOf(evento.target.closest('.ferramenta'));
  const destino = {
    ArrowRight: itens[(atual + 1) % itens.length],
    ArrowLeft: itens[(atual - 1 + itens.length) % itens.length],
    Home: itens[0],
    End: itens.at(-1),
  }[evento.key];
  if (!destino) return;
  evento.preventDefault();
  destino.focus();
}

// Na ordem em que aparecem na tela (no celular o CSS reordena os grupos).
function paradasDaBarra() {
  const itens = [...els.barra.querySelectorAll('.ferramenta:not(:disabled)')];
  const posicoes = new Map(itens.map(i => [i, i.getBoundingClientRect()]));
  return itens.sort((a, b) => (Math.round(posicoes.get(a).top / 8) - Math.round(posicoes.get(b).top / 8)) || (posicoes.get(a).left - posicoes.get(b).left));
}

function marcarParada(alvo) {
  if (!alvo) return;
  for (const item of els.barra.querySelectorAll('.ferramenta')) item.tabIndex = item === alvo ? 0 : -1;
}

// ---------- Estado ----------

function desenharEstado() {
  const e = estado();
  for (const nome of ['negrito', 'italico', 'sublinhado', 'tachado']) pressionar(nome, e[nome]);
  for (const nome of ['marcadores', 'numeros', 'tarefas']) pressionar(nome, e.lista === nome);
  const botaoLink = els.barra.querySelector('[data-menu="link"]');
  botaoLink.classList.toggle('ferramenta--ativa', Boolean(e.link));
  botaoLink.setAttribute('aria-label', e.link ? 'Editar link' : 'Inserir link');

  mostrar('estilo', ESTILOS.find(s => s.valor === e.estilo)?.nome ?? 'Texto normal');
  mostrar('fonte', nomeDaFonte(e.fonte, e.fontePadrao));
  mostrar('tamanho', String(e.tamanho).replace('.', ','));
  els.barra.querySelector('[data-mostra="cor"]').style.background = e.cor;
  const realce = els.barra.querySelector('[data-mostra="realce"]');
  realce.style.background = e.realce ?? '';
  realce.classList.toggle('ferramenta__faixa--vazia', !e.realce);
  els.barra.querySelector('[data-mostra="alinhar"]').setAttribute('href', `#i-alinhar-${e.alinhamento}`);
  els.barra.querySelector('[data-menu="alinhar"]').title = `Alinhamento: ${ALINHAMENTOS.find(a => a.valor === e.alinhamento).nome.toLowerCase()}`;

  els.barra.querySelector('[data-comando="desfazer"]').disabled = !e.podeDesfazer;
  els.barra.querySelector('[data-comando="refazer"]').disabled = !e.podeRefazer;
  // A parada de Tab não pode ficar num botão desligado.
  const parada = els.barra.querySelector('.ferramenta[tabindex="0"]');
  if (!parada || parada.disabled) marcarParada(els.barra.querySelector('.ferramenta:not(:disabled)'));
}

function pressionar(comando, ligado) {
  els.barra.querySelector(`[data-comando="${comando}"]`).setAttribute('aria-pressed', String(Boolean(ligado)));
}

function mostrar(chave, texto) {
  const el = els.barra.querySelector(`[data-mostra="${chave}"]`);
  if (el.textContent !== texto) el.textContent = texto;
}

function primeiraFamilia(lista) {
  return (lista ?? '').split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase();
}

function chaveDaFonte(familia, padrao) {
  const primeira = primeiraFamilia(familia);
  if (primeira === primeiraFamilia(padrao)) return 'padrao';
  return FONTES.find(f => f.familia && primeiraFamilia(f.familia) === primeira)?.chave ?? null;
}

// Fonte de fora da lista (colada do Word, por exemplo) aparece pelo nome.
function nomeDaFonte(familia, padrao) {
  const chave = chaveDaFonte(familia, padrao);
  if (chave) return FONTES.find(f => f.chave === chave).nome;
  const nome = (familia ?? '').split(',')[0].trim().replace(/^["']|["']$/g, '');
  return nome || 'Padrão';
}

function corHex(cor) {
  const partes = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(cor ?? '');
  if (!partes) return (cor ?? '').toLowerCase();
  return `#${partes.slice(1, 4).map(n => Number(n).toString(16).padStart(2, '0')).join('')}`;
}

function textoSelecionadoSeForLink() {
  const texto = getSelection().toString().trim();
  return enderecoDoLink(texto) && !/\s/.test(texto) ? texto : '';
}

// ---------- Celular: barra acima do teclado ----------
// O teclado virtual não encolhe a página (iPhone, e Android desde o
// Chrome 108): a barra sobe pela diferença entre a página e a parte
// visível (visualViewport).

function acompanharTeclado() {
  const vv = window.visualViewport;
  if (!vv) return;
  const raiz = document.documentElement;
  let anterior = -1;
  const atualizar = () => {
    const teclado = Math.max(0, Math.round(raiz.clientHeight - vv.height - vv.offsetTop));
    if (teclado === anterior) return;
    const abriu = teclado > 80 && anterior <= 80;
    anterior = teclado;
    raiz.style.setProperty('--teclado', `${teclado}px`);
    raiz.toggleAttribute('data-teclado', teclado > 80);
    for (const menu of els.menus.querySelectorAll(':popover-open')) posicionar(menu, null);
    if (abriu && celular.matches) requestAnimationFrame(mostrarCursor);
  };
  vv.addEventListener('resize', atualizar);
  vv.addEventListener('scroll', atualizar);
  atualizar();
}

function marcarPontas() {
  const b = els.barra;
  b.toggleAttribute('data-mais-esquerda', b.scrollLeft > 2);
  b.toggleAttribute('data-mais-direita', b.scrollLeft + b.clientWidth < b.scrollWidth - 2);
}
