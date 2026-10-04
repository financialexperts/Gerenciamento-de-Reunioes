import { escapeHtml } from '../../shared/dom.js';
import { RECUO_MAX, RECUO_PX, arredondarTamanho, enderecoDoLink, limparHtml } from './limparHtml.js';
import { FONTES } from './opcoes.js';

// O editor das anotações: uma área contenteditable com os comandos de
// edição do navegador (execCommand) e, por cima, o que eles não fazem bem:
// tamanho em pt, "automático"/"sem cor", recuo, lista de tarefas, colar
// limpo e atalhos do Docs. Desfazer e refazer são deste módulo (fotos do
// texto): os do navegador se perdem quando o texto é arrumado por código.

export const MAC = /Mac|iPhone|iPad/.test(navigator.platform);

// "Automático", "Sem cor" e "Padrão" marcam o trecho com um valor que
// ninguém usaria e depois tiram a propriedade: assim o trecho volta a
// herdar a cor ou a fonte do parágrafo.
const SENTINELA_COR = 'rgb(1, 2, 3)';
const SENTINELA_FONTE = 'gr-fonte-padrao';
const LIMITE_HISTORICO = 100;
const PAUSA_DIGITACAO = 700; // ms sem digitar fecham um passo de desfazer

const BLOCOS = 'p, h1, h2, h3, li';
const GATILHOS = {
  '- ': 'marcadores', '* ': 'marcadores', '• ': 'marcadores',
  '1. ': 'numeros', '1) ': 'numeros',
  '[] ': 'tarefas', '[ ] ': 'tarefas',
};

// Atalhos do Google Docs (⌘ no Mac, Ctrl no resto).
const ATALHOS = [
  { tecla: 'z', comando: 'desfazer' },
  { tecla: 'z', shift: true, comando: 'refazer' },
  { tecla: 'y', comando: 'refazer' },
  { tecla: 'b', comando: 'negrito' },
  { tecla: 'i', comando: 'italico' },
  { tecla: 'u', comando: 'sublinhado' },
  { tecla: 'x', shift: true, comando: 'tachado' },
  { codigo: 'Digit5', shift: true, alt: true, semMod: true, comando: 'tachado' },
  { tecla: 'k', comando: 'link' },
  { codigo: 'Digit7', shift: true, comando: 'numeros' },
  { codigo: 'Digit8', shift: true, comando: 'marcadores' },
  { codigo: 'Digit9', shift: true, comando: 'tarefas' },
  { codigo: 'Digit0', alt: true, comando: 'estilo', valor: 'p' },
  { codigo: 'Digit1', alt: true, comando: 'estilo', valor: 'h1' },
  { codigo: 'Digit2', alt: true, comando: 'estilo', valor: 'h2' },
  { codigo: 'Digit3', alt: true, comando: 'estilo', valor: 'h3' },
  { tecla: 'l', shift: true, comando: 'alinhar', valor: 'left' },
  { tecla: 'e', shift: true, comando: 'alinhar', valor: 'center' },
  { tecla: 'r', shift: true, comando: 'alinhar', valor: 'right' },
  { tecla: 'j', shift: true, comando: 'alinhar', valor: 'justify' },
  { tecla: '\\', comando: 'limpar' },
  { codigo: 'Period', shift: true, comando: 'aumentarFonte' },
  { codigo: 'Comma', shift: true, comando: 'diminuirFonte' },
  { tecla: ']', comando: 'aumentarRecuo' },
  { tecla: '[', comando: 'diminuirRecuo' },
  { tecla: 'enter', comando: 'marcarTarefa' },
];

let editor = null;
let ao = { mudar() {}, mudarSelecao() {}, pedirLink() {} };
let intervalo = null;        // última seleção dentro do editor (os botões da barra usam)
let historico = [];          // fotos { html, selecao }
let posicao = -1;
let registroTimer = 0;
let grupoDigitacao = null;   // 'digitar' | 'apagar': um passo de desfazer por grupo
let executando = false;      // um comando está rodando (o 'input' dele não é digitação)
let ultimoTamanho = 12;      // tamanho do último <font size="7"> criado
let tamanhoPendente = null;  // tamanho escolhido com o cursor parado { pt, no, desloc }
let arrastandoDeDentro = false;
let toqueInicio = null;

export function iniciarEditor(elemento, callbacks) {
  editor = elemento;
  ao = { ...ao, ...callbacks };
  document.execCommand('defaultParagraphSeparator', false, 'p');

  editor.addEventListener('beforeinput', antesDeEditar);
  editor.addEventListener('input', aoEditar);
  editor.addEventListener('compositionend', () => {
    normalizar();
    marcarVazio();
    ao.mudar();
  });
  editor.addEventListener('keydown', aoTeclar);
  editor.addEventListener('paste', aoColar);
  editor.addEventListener('dragstart', () => { arrastandoDeDentro = true; });
  editor.addEventListener('dragend', () => { arrastandoDeDentro = false; });
  editor.addEventListener('drop', aoSoltar);
  editor.addEventListener('focus', () => garantirParagrafo());

  // Caixinha das tarefas: clique marca/desmarca sem mexer no cursor.
  editor.addEventListener('mousedown', evento => {
    if (caixaEm(evento.target, evento.clientX, evento.clientY)) evento.preventDefault();
  });
  editor.addEventListener('click', evento => {
    const item = caixaEm(evento.target, evento.clientX, evento.clientY);
    if (item) alternarTarefa(item);
    else abrirLinkComModificador(evento);
  });
  // No toque, o 'touchend' é cancelado para não abrir o teclado.
  editor.addEventListener('touchstart', evento => {
    const toque = evento.touches[0];
    toqueInicio = evento.touches.length === 1 ? { x: toque.clientX, y: toque.clientY } : null;
  }, { passive: true });
  editor.addEventListener('touchend', evento => {
    const toque = evento.changedTouches[0];
    if (!toqueInicio || !toque || Math.hypot(toque.clientX - toqueInicio.x, toque.clientY - toqueInicio.y) > 10) return;
    const item = caixaEm(document.elementFromPoint(toque.clientX, toque.clientY), toque.clientX, toque.clientY);
    if (!item) return;
    evento.preventDefault();
    alternarTarefa(item);
  }, { passive: false });

  document.addEventListener('selectionchange', () => {
    const sel = getSelection();
    if (!editor.isContentEditable || !sel.rangeCount || !editor.contains(sel.anchorNode)) return;
    intervalo = sel.getRangeAt(0).cloneRange();
    if (tamanhoPendente && (tamanhoPendente.no !== intervalo.startContainer || tamanhoPendente.desloc !== intervalo.startOffset)) {
      tamanhoPendente = null;
    }
    ao.mudarSelecao();
  });
}

// ---------- Conteúdo ----------

export function definirConteudo(html) {
  editor.innerHTML = limparHtml(html) || '<p><br></p>';
  historico = [];
  posicao = -1;
  intervalo = null;
  tamanhoPendente = null;
  grupoDigitacao = null;
  clearTimeout(registroTimer);
  registroTimer = 0;
  marcarVazio();
  registrar();
}

// HTML limpo para salvar ('' quando não há nada escrito).
export function conteudo() {
  if (editor.hasAttribute('data-vazio')) return '';
  return limparHtml(editor.innerHTML);
}

// O começo do texto, uma linha por parágrafo, para o cartão da reunião.
export function resumo() {
  const linhas = [];
  for (const bloco of editor.querySelectorAll(BLOCOS)) {
    const texto = textoProprio(bloco).replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    linhas.push(`${marcadorDoItem(bloco)}${texto}`);
    if (linhas.join('\n').length > 280) break;
  }
  return linhas.join('\n').slice(0, 280);
}

export function editavel(sim) {
  editor.contentEditable = sim ? 'true' : 'false';
  if (!sim) editor.removeAttribute('contenteditable');
}

// Cursor no começo do texto, como no Docs (ao abrir a página no computador).
export function focarNoComeco() {
  editor.focus({ preventScroll: true });
  const faixa = document.createRange();
  faixa.selectNodeContents(editor.querySelector(BLOCOS) ?? editor);
  faixa.collapse(true);
  getSelection().removeAllRanges();
  getSelection().addRange(faixa);
}

// ---------- Comandos ----------

const COMANDOS = {
  negrito: () => nativo('bold'),
  italico: () => nativo('italic'),
  sublinhado: () => nativo('underline'),
  tachado: () => nativo('strikeThrough'),
  estilo: aplicarEstilo,
  fonte: chave => nativo('fontName', FONTES.find(f => f.chave === chave)?.familia ?? SENTINELA_FONTE, { css: true }),
  tamanho: pt => aplicarTamanho(pt),
  aumentarFonte: () => aplicarTamanho(tamanhoAtual() + 1),
  diminuirFonte: () => aplicarTamanho(tamanhoAtual() - 1),
  cor: cor => nativo('foreColor', cor ?? SENTINELA_COR, { css: true }),
  realce: cor => nativo('hiliteColor', cor ?? SENTINELA_COR, { css: true }),
  alinhar: lado => nativo({ left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' }[lado]),
  marcadores: () => alternarLista('marcadores'),
  numeros: () => alternarLista('numeros'),
  tarefas: () => alternarLista('tarefas'),
  aumentarRecuo: () => recuar(1),
  diminuirRecuo: () => recuar(-1),
  limpar: () => nativo('removeFormat'),
  link: aplicarLink,
  removerLink,
  marcarTarefa: () => {
    const item = blocoDe(intervalo?.startContainer)?.closest('.lista-tarefas > li');
    if (item) item.toggleAttribute('data-feito');
  },
};

// Chamado pela barra e pelos atalhos. Fecha a digitação em andamento como
// um passo de desfazer, aplica o comando e registra o resultado.
export function executar(comando, valor) {
  if (!editor.isContentEditable) return;
  if (comando === 'desfazer') return desfazer();
  if (comando === 'refazer') return refazer();
  if (!COMANDOS[comando]) return;
  focarComSelecao();
  registrar();
  executando = true;
  try {
    COMANDOS[comando](valor);
  } finally {
    executando = false;
  }
  normalizar();
  depoisDeMudar();
}

function nativo(nome, valor = null, { css = false } = {}) {
  document.execCommand('styleWithCSS', false, css);
  document.execCommand(nome, false, valor);
}

// Título dentro de uma lista tira aquele item da lista (um título não é
// item de lista, e é o que o sanitizador manteria ao salvar).
function aplicarEstilo(tag) {
  const tipoLista = tipoDaLista(listaDe(intervalo?.startContainer));
  if (tipoLista) {
    if (tag === 'p') return;
    nativo(tipoLista === 'numeros' ? 'insertOrderedList' : 'insertUnorderedList');
  }
  nativo('formatBlock', `<${tag}>`);
}

// O navegador só conhece os tamanhos 1–7 do <font>. O 7 vira marca: logo
// depois, cada <font size="7"> vira <span style="font-size: Npt">.
function aplicarTamanho(pt) {
  ultimoTamanho = arredondarTamanho(pt);
  const sel = getSelection();
  if (sel.isCollapsed) tamanhoPendente = { pt: ultimoTamanho, no: sel.anchorNode, desloc: sel.anchorOffset };
  nativo('fontSize', '7');
}

function tamanhoAtual() {
  return tamanhoPendente?.pt ?? estado().tamanho;
}

function aplicarLink(texto) {
  const href = enderecoDoLink(texto);
  if (!href) return;
  const atual = linkDe(intervalo?.startContainer);
  if (atual) {
    atual.setAttribute('href', href);
    return;
  }
  if (getSelection().isCollapsed) nativo('insertHTML', `<a href="${escapeHtml(href)}">${escapeHtml(texto.trim())}</a>`);
  else nativo('createLink', href);
}

function removerLink() {
  const link = linkDe(intervalo?.startContainer);
  const sel = getSelection();
  if (link && sel.isCollapsed) {
    const tudo = document.createRange();
    tudo.selectNodeContents(link);
    sel.removeAllRanges();
    sel.addRange(tudo);
    nativo('unlink');
    sel.collapseToEnd();
    return;
  }
  nativo('unlink');
}

// ---------- Listas ----------

function alternarLista(tipo) {
  const atual = tipoDaLista(listaDe(intervalo?.startContainer));
  if (atual === tipo) return nativo(tipo === 'numeros' ? 'insertOrderedList' : 'insertUnorderedList'); // desfaz a lista
  if (tipo === 'numeros') {
    nativo('insertOrderedList');
    for (const ol of editor.querySelectorAll('ol.lista-tarefas')) ol.classList.remove('lista-tarefas');
    return;
  }
  if (atual === 'marcadores' || atual === 'tarefas') {
    // Uma lista vira a outra inteira, como o navegador faz com as numeradas.
    for (const lista of listasDaSelecao()) lista.classList.toggle('lista-tarefas', tipo === 'tarefas');
    return;
  }
  nativo('insertUnorderedList');
  separarItensNovos(tipo === 'tarefas');
}

// O navegador junta a lista nova com uma vizinha. Se a vizinha é de outro
// tipo (marcadores × tarefas), os itens novos saem dela para uma lista só
// deles.
function separarItensNovos(tarefas) {
  const sel = getSelection();
  if (!sel.rangeCount) return;
  const faixa = sel.getRangeAt(0);
  const grupos = new Map();
  for (const item of editor.querySelectorAll('ul > li')) {
    if (!faixa.intersectsNode(item)) continue;
    const lista = item.parentElement;
    if (!grupos.has(lista)) grupos.set(lista, []);
    grupos.get(lista).push(item);
  }
  const pontos = pontosDaSelecao();
  for (const [lista, selecionados] of grupos) {
    if (lista.classList.contains('lista-tarefas') === tarefas) continue;
    const itens = [...lista.children];
    if (selecionados.length === itens.length) {
      lista.classList.toggle('lista-tarefas', tarefas);
      continue;
    }
    const primeiro = itens.indexOf(selecionados[0]);
    const ultimo = itens.indexOf(selecionados.at(-1));
    const meio = lista.cloneNode(false);
    meio.classList.toggle('lista-tarefas', tarefas);
    meio.append(...itens.slice(primeiro, ultimo + 1));
    const fim = lista.cloneNode(false);
    fim.append(...itens.slice(ultimo + 1));
    lista.after(meio);
    if (fim.children.length) meio.after(fim);
    if (!lista.children.length) lista.remove();
  }
  aplicarPontos(pontos);
}

function listasDaSelecao() {
  const faixa = getSelection().rangeCount ? getSelection().getRangeAt(0) : intervalo;
  const listas = new Set([listaDe(faixa.startContainer), listaDe(faixa.endContainer)]);
  for (const lista of editor.querySelectorAll('ul')) if (faixa.intersectsNode(lista)) listas.add(lista);
  listas.delete(null);
  return [...listas].filter(lista => lista.localName === 'ul');
}

function alternarTarefa(item) {
  registrar();
  item.toggleAttribute('data-feito');
  depoisDeMudar();
}

// A caixinha é o recuo à esquerda da primeira linha do item.
function caixaEm(alvo, x, y) {
  if (!editor.isContentEditable) return null;
  const item = alvo?.closest?.('.lista-tarefas > li');
  if (!item || !editor.contains(item)) return null;
  const caixa = item.getBoundingClientRect();
  const css = getComputedStyle(item);
  const linha = parseFloat(css.lineHeight) || parseFloat(css.fontSize) * 1.5;
  return x - caixa.left < parseFloat(css.paddingLeft) && y - caixa.top < linha ? item : null;
}

// ---------- Recuo ----------
// Itens de lista entram e saem de sublistas (Tab e Shift+Tab); parágrafos
// e títulos ganham margem, de 40 em 40 px.

function recuar(direcao) {
  const sel = getSelection();
  const faixa = sel.rangeCount ? sel.getRangeAt(0) : intervalo;
  if (!faixa) return;
  const blocos = blocosDaSelecao(faixa);
  const itens = blocos.filter(b => b.localName === 'li');
  const pontos = pontosDaSelecao();

  for (const bloco of blocos) {
    if (bloco.localName === 'li' || bloco.closest('li')) continue;
    const niveis = Math.round((parseFloat(bloco.style.marginLeft) || 0) / RECUO_PX) + direcao;
    bloco.style.marginLeft = niveis > 0 ? `${Math.min(niveis, RECUO_MAX) * RECUO_PX}px` : '';
    if (!bloco.getAttribute('style')) bloco.removeAttribute('style');
  }
  // Item dentro de outro item que também foi escolhido já se move junto.
  const principais = itens.filter(item => !itens.some(outro => outro !== item && outro.contains(item)));
  for (const item of principais) (direcao > 0 ? aumentarItem : diminuirItem)(item);
  aplicarPontos(pontos);
}

// Do bloco onde a seleção começa até o bloco onde ela termina. (Com o
// cursor num subitem, o item de cima não conta: ele só contém o subitem.)
function blocosDaSelecao(faixa) {
  const todos = [...editor.querySelectorAll(BLOCOS)];
  const inicio = todos.indexOf(blocoDe(faixa.startContainer));
  const fim = todos.indexOf(blocoDe(faixa.endContainer));
  if (inicio < 0 || fim < 0) return todos.filter(bloco => faixa.intersectsNode(bloco));
  return todos.slice(inicio, fim + 1);
}

function aumentarItem(item) {
  const anterior = item.previousElementSibling;
  if (anterior?.localName !== 'li') return; // o primeiro item não tem onde entrar
  let sub = anterior.lastElementChild;
  if (!ehLista(sub)) {
    sub = item.parentElement.cloneNode(false);
    anterior.append(sub);
  }
  sub.append(item);
}

function diminuirItem(item) {
  const lista = item.parentElement;
  const itemPai = lista.parentElement;
  if (itemPai?.localName !== 'li') return; // já está no primeiro nível
  // Os itens de baixo viram filhos dele, para a ordem continuar a mesma.
  const seguintes = [];
  for (let irmao = item.nextElementSibling; irmao; irmao = irmao.nextElementSibling) seguintes.push(irmao);
  if (seguintes.length) {
    let sub = item.lastElementChild;
    if (!ehLista(sub)) {
      sub = lista.cloneNode(false);
      item.append(sub);
    }
    sub.append(...seguintes);
  }
  itemPai.after(item);
  if (!lista.children.length) lista.remove();
}

// ---------- Digitação ----------

function antesDeEditar(evento) {
  const tipo = evento.inputType;
  if (tipo === 'historyUndo' || tipo === 'historyRedo') {
    evento.preventDefault();
    tipo === 'historyUndo' ? desfazer() : refazer();
    return;
  }
  if (executando) return;
  // Um passo de desfazer por grupo: digitar, apagar, Enter, colar…
  const grupo = tipo.startsWith('insertText') || tipo === 'insertCompositionText' ? 'digitar'
    : tipo.startsWith('delete') ? 'apagar' : null;
  if (!grupo || grupo !== grupoDigitacao) registrar();
  grupoDigitacao = grupo;
}

function aoEditar(evento) {
  if (evento.isComposing) {
    // No meio de uma composição (teclado do celular, acentos), o texto não
    // pode ser mexido: arruma no compositionend.
    agendarRegistro();
    ao.mudar();
    return;
  }
  normalizar();
  if (!executando) {
    if (evento.inputType === 'insertParagraph') desmarcarItemNovo();
    if (autoformatar(evento)) return;
    agendarRegistro();
  }
  marcarVazio();
  ao.mudar();
  ao.mudarSelecao();
  if (!executando) ao.mostrarCursor?.();
}

function agendarRegistro() {
  clearTimeout(registroTimer);
  registroTimer = setTimeout(registrar, PAUSA_DIGITACAO);
}

// "- " vira lista, "1. " lista numerada, "[] " lista de tarefas (como no
// Docs). Desfazer logo depois devolve o "- " digitado.
function autoformatar(evento) {
  if (evento.inputType !== 'insertText' || !/^[  ]$/.test(evento.data ?? '')) return false;
  const sel = getSelection();
  if (!sel.isCollapsed || !sel.rangeCount) return false;
  const bloco = blocoDe(sel.anchorNode);
  if (bloco?.localName !== 'p' || bloco.closest('li')) return false;
  const antes = document.createRange();
  antes.setStart(bloco, 0);
  antes.setEnd(sel.anchorNode, sel.anchorOffset);
  const comando = GATILHOS[antes.toString().replace(/ /g, ' ')];
  if (!comando) return false;

  registrar();
  executando = true;
  try {
    sel.removeAllRanges();
    sel.addRange(antes);
    nativo('delete');
    COMANDOS[comando]();
  } finally {
    executando = false;
  }
  normalizar();
  depoisDeMudar();
  return true;
}

// Enter num item marcado: o item novo nasce desmarcado.
function desmarcarItemNovo() {
  const item = blocoDe(getSelection().anchorNode)?.closest('.lista-tarefas > li');
  if (!item) return;
  for (const li of [item, item.previousElementSibling]) {
    if (li?.localName === 'li' && !textoProprio(li).trim()) li.removeAttribute('data-feito');
  }
}

function aoTeclar(evento) {
  const mod = MAC ? evento.metaKey : evento.ctrlKey;
  if (evento.key === 'Tab' && !mod && !evento.altKey && listaDe(intervalo?.startContainer)) {
    evento.preventDefault();
    executar(evento.shiftKey ? 'diminuirRecuo' : 'aumentarRecuo');
    return;
  }
  const tecla = evento.key.toLowerCase();
  const atalho = ATALHOS.find(a => (a.semMod ? !mod : mod)
    && Boolean(a.shift) === evento.shiftKey
    && Boolean(a.alt) === evento.altKey
    && (a.tecla ? tecla === a.tecla : evento.code === a.codigo));
  if (!atalho) return;
  evento.preventDefault();
  if (atalho.comando === 'link') ao.pedirLink();
  else executar(atalho.comando, atalho.valor);
}

// ---------- Colar e soltar ----------

function aoColar(evento) {
  if (!evento.clipboardData) return;
  evento.preventDefault();
  inserirDeFora(evento.clipboardData.getData('text/html'), evento.clipboardData.getData('text/plain'));
}

function aoSoltar(evento) {
  if (arrastandoDeDentro || !evento.dataTransfer) return; // mover texto dentro do editor: o navegador cuida
  evento.preventDefault();
  const html = evento.dataTransfer.getData('text/html');
  const texto = evento.dataTransfer.getData('text/plain');
  if (!html && !texto) return; // arquivo solto: imagens não entram nas anotações
  const ponto = pontoNaTela(evento.clientX, evento.clientY);
  if (ponto && editor.contains(ponto.startContainer)) {
    editor.focus({ preventScroll: true });
    getSelection().removeAllRanges();
    getSelection().addRange(ponto);
  }
  inserirDeFora(html, texto);
}

function inserirDeFora(html, texto) {
  focarComSelecao();
  registrar();
  executando = true;
  try {
    const limpo = html ? limparHtml(html, { colado: true, emLinha: true }) : '';
    if (limpo) nativo('insertHTML', limpo);
    else if (texto) inserirTextoPuro(texto);
  } finally {
    executando = false;
  }
  normalizar();
  depoisDeMudar();
  ao.mostrarCursor?.();
}

// Texto de várias linhas: um parágrafo por linha.
function inserirTextoPuro(texto) {
  const linhas = texto.replace(/\r\n?/g, '\n').split('\n');
  if (linhas.length === 1) return nativo('insertText', texto);
  nativo('insertHTML', linhas.map(linha => `<p>${linha ? escapeHtml(linha) : '<br>'}</p>`).join(''));
}

function pontoNaTela(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  const posicao = document.caretPositionFromPoint?.(x, y);
  if (!posicao) return null;
  const faixa = document.createRange();
  faixa.setStart(posicao.offsetNode, posicao.offset);
  return faixa;
}

// Dentro do editor, link abre com Ctrl/⌘ + clique (clique simples põe o
// cursor, para dar para editar o texto do link).
function abrirLinkComModificador(evento) {
  const link = evento.target.closest?.('a[href]');
  if (!link || !(evento.ctrlKey || evento.metaKey)) return;
  evento.preventDefault();
  window.open(link.href, '_blank', 'noopener,noreferrer');
}

// ---------- Desfazer e refazer ----------

export function desfazer() {
  registrar();
  if (posicao <= 0) return;
  posicao--;
  restaurar(historico[posicao]);
}

export function refazer() {
  registrar();
  if (posicao >= historico.length - 1) return;
  posicao++;
  restaurar(historico[posicao]);
}

// Guarda uma foto se o texto mudou desde a última. Se não mudou, só
// atualiza onde estava o cursor: desfazer volta o cursor para onde a
// mudança começou.
function registrar() {
  clearTimeout(registroTimer);
  registroTimer = 0;
  grupoDigitacao = null;
  const html = editor.innerHTML;
  const atual = historico[posicao];
  if (atual?.html === html) {
    atual.selecao = caminhoDaSelecao() ?? atual.selecao;
    return false;
  }
  historico = historico.slice(0, posicao + 1);
  historico.push({ html, selecao: caminhoDaSelecao() });
  if (historico.length > LIMITE_HISTORICO) historico.shift();
  posicao = historico.length - 1;
  return true;
}

function restaurar(foto) {
  editor.innerHTML = foto.html;
  tamanhoPendente = null;
  aplicarCaminho(foto.selecao);
  marcarVazio();
  ao.mudar();
  ao.mudarSelecao();
  ao.mostrarCursor?.();
}

function depoisDeMudar() {
  marcarVazio();
  if (registrar()) ao.mudar();
  ao.mudarSelecao();
}

function caminhoDaSelecao() {
  const sel = getSelection();
  if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return null;
  const ancora = caminhoAte(sel.anchorNode);
  const foco = caminhoAte(sel.focusNode);
  return ancora && foco ? { ancora: [ancora, sel.anchorOffset], foco: [foco, sel.focusOffset] } : null;
}

function aplicarCaminho(selecao) {
  const ancora = selecao && noDoCaminho(selecao.ancora[0]);
  const foco = selecao && noDoCaminho(selecao.foco[0]);
  if (!ancora || !foco) return colocarNoFim();
  if (document.activeElement !== editor) editor.focus({ preventScroll: true });
  getSelection().setBaseAndExtent(ancora, Math.min(selecao.ancora[1], tamanhoDoNo(ancora)), foco, Math.min(selecao.foco[1], tamanhoDoNo(foco)));
}

function caminhoAte(no) {
  const caminho = [];
  while (no && no !== editor) {
    caminho.unshift(Array.prototype.indexOf.call(no.parentNode.childNodes, no));
    no = no.parentNode;
  }
  return no === editor ? caminho : null;
}

function noDoCaminho(caminho) {
  let no = editor;
  for (const indice of caminho) {
    no = no.childNodes[indice];
    if (!no) return null;
  }
  return no;
}

// ---------- Arrumação depois de cada mudança ----------
// Só mexe na seleção se o texto mudou: recolocar o cursor apaga o "estilo
// de digitação" do navegador (negrito ligado com o cursor parado, por ex.).

function normalizar() {
  const pontos = pontosDaSelecao();
  const mudou = converterFontes(pontos) | tirarSentinelas(pontos) | desaninhar(pontos) | garantirParagrafo(pontos);
  if (mudou) aplicarPontos(pontos);
}

// O Chrome às vezes cria a lista dentro do parágrafo (<p><ul>…</ul></p>),
// o que não existe em HTML: ao desfazer ou recarregar, o navegador
// reorganizaria tudo. A lista sobe para o lado do parágrafo, e o texto de
// antes e de depois dela fica em parágrafos próprios.
function desaninhar(pontos) {
  let mudou = false;
  for (const bloco of editor.querySelectorAll('p, h1, h2, h3')) {
    if (!bloco.isConnected || !bloco.querySelector(':scope > :is(ul, ol, p, h1, h2, h3)')) continue;
    const filhos = [...bloco.childNodes];
    const pedacos = [];
    let atual = null;
    for (const no of filhos) {
      if (no.nodeType === Node.ELEMENT_NODE && /^(UL|OL|P|H1|H2|H3)$/.test(no.tagName)) {
        atual = null;
        pedacos.push(no);
      } else {
        if (!atual) {
          atual = bloco.cloneNode(false);
          pedacos.push(atual);
        }
        atual.append(no);
      }
    }
    // Quem apontava para um filho do bloco passa a apontar para o pedaço
    // onde esse filho foi parar.
    for (const p of pontos ?? []) {
      if (p.no !== bloco) continue;
      const filho = filhos[p.desloc];
      const pedaco = filho ? pedacos.find(x => x === filho || x.contains(filho)) : pedacos.at(-1);
      if (!pedaco) continue;
      p.no = pedaco;
      p.desloc = pedaco === filho ? 0 : (filho ? indiceDe(filho) : pedaco.childNodes.length);
    }
    const vazios = pedacos.filter(x => x.nodeType === Node.ELEMENT_NODE && x !== bloco && x.localName === bloco.localName
      && !x.querySelector('br') && !/\S/.test(x.textContent) && !pontos?.some(p => x.contains(p.no)));
    bloco.replaceWith(...pedacos.filter(x => !vazios.includes(x)));
    mudou = true;
  }
  return mudou;
}

function converterFontes(pontos) {
  const fontes = editor.querySelectorAll('font');
  for (const font of fontes) {
    const span = document.createElement('span');
    span.style.fontSize = `${font.getAttribute('size') === '7' ? ultimoTamanho : 12}pt`;
    if (font.color) span.style.color = font.color;
    trocarElemento(font, span, pontos);
    // O tamanho novo vale para o trecho inteiro.
    for (const interno of [...span.querySelectorAll('[style]')]) {
      interno.style.removeProperty('font-size');
      if (!interno.getAttribute('style') && interno.localName === 'span') desembrulhar(interno, pontos);
    }
  }
  return fontes.length > 0;
}

function tirarSentinelas(pontos) {
  const marcados = editor.querySelectorAll(`[style*="${SENTINELA_COR}"], [style*="${SENTINELA_FONTE}"]`);
  for (const el of marcados) {
    if (el.style.color === SENTINELA_COR) el.style.removeProperty('color');
    if (el.style.backgroundColor === SENTINELA_COR) el.style.removeProperty('background-color');
    if (el.style.fontFamily.includes(SENTINELA_FONTE)) el.style.removeProperty('font-family');
    if (!el.getAttribute('style')) {
      el.removeAttribute('style');
      if (el.localName === 'span') desembrulhar(el, pontos);
    }
  }
  return marcados.length > 0;
}

// O texto vive sempre dentro de parágrafos, títulos ou listas. Texto solto
// no topo (navegador apagando tudo, Firefox) entra num parágrafo; vazio,
// fica um parágrafo vazio para o cursor.
function garantirParagrafo(pontos = null) {
  let mudou = false;
  let paragrafo = null;
  for (const no of [...editor.childNodes]) {
    if (no.nodeType === Node.ELEMENT_NODE && /^(P|H1|H2|H3|UL|OL)$/.test(no.tagName)) {
      paragrafo = null;
      continue;
    }
    if (no.nodeType === Node.ELEMENT_NODE && no.tagName === 'DIV') {
      trocarElemento(no, document.createElement('p'), pontos);
      paragrafo = null;
      mudou = true;
      continue;
    }
    if (!paragrafo) {
      paragrafo = document.createElement('p');
      no.before(paragrafo);
    }
    paragrafo.append(no);
    mudou = true;
  }
  if (!editor.firstChild) {
    editor.innerHTML = '<p><br></p>';
    if (pontos) for (const p of pontos) Object.assign(p, { no: editor.firstChild, desloc: 0 });
    mudou = true;
  }
  return mudou;
}

function marcarVazio() {
  const vazio = !/\S/.test(editor.textContent)
    && !editor.querySelector('li, h1, h2, h3')
    && editor.querySelectorAll('p').length <= 1;
  editor.toggleAttribute('data-vazio', vazio);
}

// ---------- Seleção ----------

// Antes de um comando da barra: a seleção volta para o editor se saiu
// (foco no campo do link, por exemplo). Se já está lá, não é tocada.
function focarComSelecao() {
  const sel = getSelection();
  const atual = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  const dentro = atual && editor.contains(atual.startContainer);
  if (document.activeElement !== editor) editor.focus({ preventScroll: true });
  if (dentro) {
    // focus() pode ter levado o cursor para o começo do texto.
    if (!sel.rangeCount || !mesmaFaixa(sel.getRangeAt(0), atual)) {
      sel.removeAllRanges();
      sel.addRange(atual);
    }
  } else if (intervalo && editor.contains(intervalo.startContainer)) {
    sel.removeAllRanges();
    sel.addRange(intervalo.cloneRange());
  } else {
    colocarNoFim();
  }
}

function colocarNoFim() {
  const ultimo = editor.lastElementChild ?? editor;
  const faixa = document.createRange();
  faixa.selectNodeContents(ultimo.localName === 'ul' || ultimo.localName === 'ol' ? ultimo.lastElementChild ?? ultimo : ultimo);
  faixa.collapse(false);
  getSelection().removeAllRanges();
  getSelection().addRange(faixa);
}

function mesmaFaixa(a, b) {
  return a.startContainer === b.startContainer && a.startOffset === b.startOffset
    && a.endContainer === b.endContainer && a.endOffset === b.endOffset;
}

// Pontos (nó, deslocamento) que sobrevivem a mover nós de lugar: textos
// movidos continuam os mesmos objetos; quem aponta para um elemento que
// sai do lugar é corrigido em desembrulhar/trocarElemento.
function pontosDaSelecao() {
  const sel = getSelection();
  if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return null;
  return [{ no: sel.anchorNode, desloc: sel.anchorOffset }, { no: sel.focusNode, desloc: sel.focusOffset }];
}

function aplicarPontos(pontos) {
  if (!pontos?.every(p => editor.contains(p.no))) return;
  const [a, f] = pontos;
  getSelection().setBaseAndExtent(a.no, Math.min(a.desloc, tamanhoDoNo(a.no)), f.no, Math.min(f.desloc, tamanhoDoNo(f.no)));
}

function desembrulhar(el, pontos) {
  const pai = el.parentNode;
  const indice = indiceDe(el);
  const filhos = el.childNodes.length;
  for (const p of pontos ?? []) {
    if (p.no === el) {
      p.no = pai;
      p.desloc += indice;
    } else if (p.no === pai && p.desloc > indice) {
      p.desloc += filhos - 1;
    }
  }
  el.replaceWith(...el.childNodes);
}

function trocarElemento(antigo, novo, pontos) {
  for (const p of pontos ?? []) if (p.no === antigo) p.no = novo;
  novo.append(...antigo.childNodes);
  antigo.replaceWith(novo);
}

// ---------- Leitura do estado (para a barra) ----------

export function estado() {
  const faixa = intervalo && editor.contains(intervalo.startContainer) ? intervalo : null;
  const el = elementoEm(faixa) ?? editor.querySelector(BLOCOS) ?? editor;
  const css = getComputedStyle(el);
  const bloco = blocoDe(el);
  const lista = listaDe(el);
  return {
    negrito: comandoAtivo('bold', faixa),
    italico: comandoAtivo('italic', faixa),
    sublinhado: comandoAtivo('underline', faixa),
    tachado: comandoAtivo('strikeThrough', faixa),
    estilo: bloco && /^h[1-3]$/.test(bloco.localName) ? bloco.localName : 'p',
    fonte: css.fontFamily,
    fontePadrao: getComputedStyle(editor).fontFamily,
    tamanho: tamanhoPendente?.pt ?? arredondarTamanho(parseFloat(css.fontSize) * 0.75),
    cor: css.color,
    realce: realceDe(el),
    alinhamento: { center: 'center', right: 'right', end: 'right', justify: 'justify' }[getComputedStyle(bloco ?? el).textAlign] ?? 'left',
    lista: tipoDaLista(lista),
    link: linkDe(el)?.getAttribute('href') ?? null,
    podeDesfazer: posicao > 0 || registroTimer !== 0,
    podeRefazer: posicao < historico.length - 1 && registroTimer === 0,
  };
}

function comandoAtivo(nome, faixa) {
  if (!faixa) return false;
  try {
    return document.queryCommandState(nome);
  } catch {
    return false;
  }
}

function elementoEm(faixa) {
  if (!faixa) return null;
  const no = faixa.startContainer;
  if (no.nodeType === Node.TEXT_NODE) return no.parentElement;
  const filho = no.childNodes[faixa.startOffset] ?? no.lastChild;
  if (filho?.nodeType === Node.ELEMENT_NODE && filho.localName !== 'br' && !ehLista(filho)) return filho;
  return no;
}

function realceDe(el) {
  for (let atual = el; atual && atual !== editor; atual = atual.parentElement) {
    const fundo = getComputedStyle(atual).backgroundColor;
    if (fundo && fundo !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(fundo)) return fundo;
  }
  return null;
}

// ---------- Utilitários ----------

function blocoDe(no) {
  const el = no?.nodeType === Node.TEXT_NODE ? no.parentElement : no;
  const bloco = el?.closest?.(BLOCOS);
  return bloco && editor.contains(bloco) && bloco !== editor ? bloco : null;
}

function listaDe(no) {
  const item = blocoDe(no)?.closest('li');
  return item && editor.contains(item) ? item.parentElement : null;
}

function linkDe(no) {
  const el = no?.nodeType === Node.TEXT_NODE ? no.parentElement : no;
  const link = el?.closest?.('a[href]');
  return link && editor.contains(link) ? link : null;
}

function tipoDaLista(lista) {
  if (!lista) return null;
  if (lista.localName === 'ol') return 'numeros';
  return lista.classList.contains('lista-tarefas') ? 'tarefas' : 'marcadores';
}

function ehLista(el) {
  return el?.localName === 'ul' || el?.localName === 'ol';
}

// O texto do bloco sem o das sublistas dele.
function textoProprio(bloco) {
  let texto = '';
  const caminhante = document.createTreeWalker(bloco, NodeFilter.SHOW_TEXT);
  while (caminhante.nextNode()) {
    if (blocoDe(caminhante.currentNode) === bloco) texto += caminhante.currentNode.data;
  }
  return texto;
}

function marcadorDoItem(bloco) {
  if (bloco.localName !== 'li') return '';
  const tipo = tipoDaLista(bloco.parentElement);
  if (tipo === 'tarefas') return bloco.hasAttribute('data-feito') ? '☑ ' : '☐ ';
  if (tipo === 'numeros') return `${[...bloco.parentElement.children].indexOf(bloco) + 1}. `;
  return '• ';
}

function indiceDe(no) {
  return Array.prototype.indexOf.call(no.parentNode.childNodes, no);
}

function tamanhoDoNo(no) {
  return no.nodeType === Node.TEXT_NODE ? no.length : no.childNodes.length;
}
