// O HTML das anotações passa por aqui ao abrir, ao colar e ao salvar: só
// ficam as marcações que o editor sabe criar (parágrafos, títulos, listas,
// negrito, cores, fontes…). Scripts, imagens, eventos e estilos de outros
// sites são descartados, e o texto continua. Ao colar do Google Docs, do
// Word ou de uma página, o que dá para manter (negrito, cor, tamanho…)
// é mantido.

export const RECUO_PX = 40;      // um nível de recuo de parágrafo
export const RECUO_MAX = 8;      // níveis
export const TAMANHO_MIN = 6;    // pt
export const TAMANHO_MAX = 96;   // pt

// Some junto com tudo o que tem dentro.
const DESCARTAR = new Set([
  'SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'FRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'IMG', 'PICTURE',
  'VIDEO', 'AUDIO', 'CANVAS', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'HEAD', 'META', 'LINK', 'TITLE',
  'NOSCRIPT', 'HR', 'MAP', 'AREA',
]);

// Marcação de texto (dentro da linha) → a tag que o editor usa.
const EM_LINHA = {
  B: 'b', STRONG: 'b',
  I: 'i', EM: 'i', CITE: 'i', DFN: 'i', VAR: 'i',
  U: 'u', INS: 'u',
  S: 's', STRIKE: 's', DEL: 's',
  SUB: 'sub', SUP: 'sup',
  A: 'a', BR: 'br',
  SPAN: 'span', FONT: 'span', MARK: 'span', SMALL: 'span', BIG: 'span', CODE: 'span', KBD: 'span', SAMP: 'span', TT: 'span', Q: 'span', ABBR: 'span',
};

const TITULOS = { H1: 'h1', H2: 'h2', H3: 'h3', H4: 'h3', H5: 'h3', H6: 'h3' };

// Caixas de outros sites (div, tabela, seção…) viram parágrafos.
const CAIXAS = new Set([
  'P', 'DIV', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'FIGURE',
  'FIGCAPTION', 'ADDRESS', 'PRE', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION', 'DL',
  'DT', 'DD', 'FIELDSET', 'LEGEND', 'DETAILS', 'SUMMARY', 'CENTER', 'FORM', 'BODY', 'HTML',
]);

const BLOCOS = new Set(['P', 'H1', 'H2', 'H3']);
const LISTAS = new Set(['UL', 'OL']);

// <font size="1…7"> (Word, sites antigos) em pt.
const TAMANHO_DA_FONT = { 1: 7.5, 2: 10, 3: 12, 4: 13.5, 5: 18, 6: 24, 7: 36 };
const TAMANHO_DA_PALAVRA = { 'xx-small': 7, 'x-small': 7.5, small: 10, medium: 12, large: 13.5, 'x-large': 18, 'xx-large': 24, 'xxx-large': 36 };

// colado: HTML de fora (espaços da formatação do código-fonte são juntados).
// emLinha: um trecho de uma linha só volta sem o <p>, para entrar no meio
// do parágrafo em vez de quebrá-lo.
export function limparHtml(html, { colado = false, emLinha = false } = {}) {
  const modelo = document.createElement('template');
  modelo.innerHTML = html ?? ''; // conteúdo de <template> é inerte: nada roda nem carrega
  const bruto = document.createElement('div');
  limparFilhos(modelo.content, bruto, { colado });
  const limpo = estruturar(bruto);
  if (colado) for (const bloco of limpo.querySelectorAll('p, h1, h2, h3, li')) aparar(bloco);
  const unico = limpo.children.length === 1 ? limpo.firstElementChild : null;
  if (emLinha && unico?.localName === 'p' && !unico.getAttribute('style')) return unico.innerHTML;
  return limpo.innerHTML;
}

// Endereço de um link digitado ou colado: só web, e-mail e telefone.
// Aceita sem "https://" ("financialexperts.com.br") e e-mail solto.
export function enderecoDoLink(texto) {
  const valor = texto?.trim();
  if (!valor || /\s/.test(valor)) return null;
  if (/^(mailto|tel):/i.test(valor)) return valor;
  if (/^[^@/:]+@[^@/:]+\.[^@/:]+$/.test(valor)) return `mailto:${valor}`;
  const comEsquema = /^[a-z][a-z\d+.-]*:/i.test(valor) ? valor : `https://${valor}`;
  try {
    const url = new URL(comEsquema);
    const web = url.protocol === 'https:' || url.protocol === 'http:';
    return web && (url.hostname.includes('.') || url.hostname === 'localhost') ? url.href : null;
  } catch {
    return null;
  }
}

// ---------- 1. Só elementos, atributos e estilos conhecidos ----------

function limparFilhos(origem, destino, opcoes) {
  for (const no of origem.childNodes) {
    const limpo = limparNo(no, opcoes);
    if (limpo) destino.append(limpo);
  }
}

function limparNo(no, opcoes) {
  if (no.nodeType === Node.TEXT_NODE) {
    const texto = opcoes.colado ? no.data.replace(/[ \t\n\r\f]+/g, ' ') : no.data;
    return texto ? document.createTextNode(texto) : null;
  }
  if (no.nodeType !== Node.ELEMENT_NODE) return null; // comentários, instruções do Word…
  const nome = no.tagName.toUpperCase();
  if (DESCARTAR.has(nome)) return null;

  let tag = EM_LINHA[nome] ?? TITULOS[nome] ?? (LISTAS.has(nome) ? nome.toLowerCase() : null)
    ?? (nome === 'LI' ? 'li' : null) ?? (CAIXAS.has(nome) ? 'p' : null);
  if (!tag) return filhosLimpos(no, opcoes); // desconhecido (o:p, tags de outros apps): fica o texto

  // O Google Docs embrulha tudo num <b style="font-weight:normal">.
  if (tag === 'b' && pesoNormal(no.style?.fontWeight)) tag = 'span';

  const el = document.createElement(tag);
  if (tag === 'br') return el;
  copiarEstilos(no, el, tag);
  copiarAtributos(no, el, tag);
  if (nome === 'BLOCKQUOTE') el.style.marginLeft = `${RECUO_PX}px`;
  limparFilhos(no, el, opcoes);

  if (tag === 'a' && !el.hasAttribute('href')) return desembrulhado(el);
  if (tag === 'span' && !el.getAttribute('style')) return desembrulhado(el);
  return el;
}

function filhosLimpos(no, opcoes) {
  const fragmento = document.createDocumentFragment();
  limparFilhos(no, fragmento, opcoes);
  return fragmento;
}

function desembrulhado(el) {
  const fragmento = document.createDocumentFragment();
  fragmento.append(...el.childNodes);
  return fragmento;
}

function copiarAtributos(origem, el, tag) {
  if (tag === 'a') {
    const href = enderecoDoLink(origem.getAttribute('href'));
    if (href) el.setAttribute('href', href);
  }
  if (tag === 'ul' && origem.classList.contains('lista-tarefas')) el.className = 'lista-tarefas';
  if (tag === 'li' && origem.hasAttribute('data-feito')) el.setAttribute('data-feito', '');
}

// Estilos de texto valem em qualquer elemento de texto; alinhamento e recuo,
// só nos blocos. No bloco, estilo de texto desce para um <span> por dentro,
// para os botões da barra conseguirem trocá-lo depois.
function copiarEstilos(origem, el, tag) {
  const css = origem.style;
  if (!css) return;
  const texto = estilosDeTexto(origem, css);
  if (tag === 'p' || tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'li') {
    const alinhamento = alinhamentoValido(css.textAlign || origem.getAttribute('align'));
    if (alinhamento) el.style.textAlign = alinhamento;
    if (tag !== 'li') {
      const recuo = recuoValido(css.marginLeft);
      if (recuo) el.style.marginLeft = recuo;
    }
    if (Object.keys(texto).length) el.dataset.estiloTexto = JSON.stringify(texto);
    return;
  }
  if (tag === 'ul' || tag === 'ol' || tag === 'br') return;
  for (const [propriedade, valor] of Object.entries(texto)) el.style.setProperty(propriedade, valor);
}

function estilosDeTexto(origem, css) {
  const saida = {};
  const corTexto = corValida(css.color || origem.getAttribute?.('color'));
  if (corTexto) saida.color = corTexto;
  const fundo = corValida(css.backgroundColor);
  if (fundo) saida['background-color'] = fundo;
  const familia = familiaValida(css.fontFamily || origem.getAttribute?.('face'));
  if (familia) saida['font-family'] = familia;
  const tamanho = tamanhoValido(css.fontSize) ?? tamanhoDaFont(origem);
  if (tamanho) saida['font-size'] = tamanho;
  if (pesoNegrito(css.fontWeight)) saida['font-weight'] = 'bold';
  if (/italic|oblique/.test(css.fontStyle)) saida['font-style'] = 'italic';
  const linhas = `${css.textDecorationLine || ''} ${css.textDecoration || ''}`;
  const decoracao = ['underline', 'line-through'].filter(d => linhas.includes(d));
  if (decoracao.length) saida['text-decoration-line'] = decoracao.join(' ');
  return saida;
}

function pesoNegrito(peso) {
  return peso === 'bold' || peso === 'bolder' || Number(peso) >= 600;
}

function pesoNormal(peso) {
  return peso === 'normal' || peso === 'lighter' || (Number(peso) > 0 && Number(peso) < 600);
}

function corValida(valor) {
  const cor = valor?.trim();
  if (!cor || /^(transparent|initial|inherit|unset|revert|currentcolor|windowtext)$/i.test(cor)) return null;
  if (/\b(url|var|expression)\s*\(/i.test(cor)) return null;
  // Totalmente transparente: rgba(…, 0) ou rgb(… / 0)
  if (/^(rgba?|hsla?)\((?:[^,]*,){3}\s*0(\.0+)?%?\s*\)$/i.test(cor) || /\/\s*0(\.0+)?%?\s*\)$/.test(cor)) return null;
  return CSS.supports('color', cor) ? cor : null;
}

function familiaValida(valor) {
  const familia = valor?.trim();
  if (!familia || familia.length > 200 || !/^[\p{L}\p{N}\s"',._-]+$/u.test(familia)) return null;
  if (/^(inherit|initial|unset|revert)$/i.test(familia)) return null;
  return familia;
}

function tamanhoValido(valor) {
  const texto = valor?.trim().toLowerCase();
  if (!texto) return null;
  let pt = TAMANHO_DA_PALAVRA[texto] ?? null;
  const numero = /^(\d*\.?\d+)(pt|px)$/.exec(texto);
  if (numero) pt = numero[2] === 'pt' ? Number(numero[1]) : Number(numero[1]) * 0.75;
  if (!pt) return null;
  return `${arredondarTamanho(pt)}pt`;
}

function tamanhoDaFont(origem) {
  if (origem.tagName !== 'FONT') return null;
  const pt = TAMANHO_DA_FONT[origem.getAttribute('size')];
  return pt ? `${pt}pt` : null;
}

export function arredondarTamanho(pt) {
  return Math.min(TAMANHO_MAX, Math.max(TAMANHO_MIN, Math.round(pt * 2) / 2));
}

function alinhamentoValido(valor) {
  const alinhamento = { center: 'center', right: 'right', end: 'right', justify: 'justify' }[valor?.trim().toLowerCase()];
  return alinhamento ?? null;
}

function recuoValido(valor) {
  const numero = /^(\d*\.?\d+)(px|pt)$/.exec(valor?.trim() ?? '');
  if (!numero) return null;
  const px = numero[2] === 'pt' ? Number(numero[1]) / 0.75 : Number(numero[1]);
  const niveis = Math.min(RECUO_MAX, Math.round(px / RECUO_PX));
  return niveis > 0 ? `${niveis * RECUO_PX}px` : null;
}

// ---------- 2. Estrutura que o editor entende ----------
// No topo, só parágrafos, títulos e listas; dentro de uma lista, só itens;
// dentro de um item, texto e sublistas. Caixas dentro de caixas (comum no
// HTML de sites) são achatadas.

function estruturar(origem) {
  const saida = document.createElement('div');
  let paragrafo = null;
  const fechar = () => {
    if (paragrafo && temConteudo(paragrafo)) saida.append(paragrafo);
    paragrafo = null;
  };
  for (const no of [...origem.childNodes]) {
    if (ehBloco(no)) {
      fechar();
      saida.append(...achatarBloco(no));
    } else if (ehLista(no)) {
      fechar();
      const lista = arrumarLista(no);
      if (lista) saida.append(lista);
    } else {
      if (!paragrafo && ehEspaco(no)) continue;
      paragrafo ??= document.createElement('p');
      paragrafo.append(no);
    }
  }
  fechar();
  for (const bloco of saida.querySelectorAll('[data-estilo-texto]')) descerEstiloDeTexto(bloco);
  return saida;
}

function achatarBloco(bloco) {
  const resultado = [];
  let atual = null;
  const fechar = () => {
    if (atual && temConteudo(atual)) resultado.push(atual);
    atual = null;
  };
  for (const no of [...bloco.childNodes]) {
    if (ehBloco(no)) {
      fechar();
      resultado.push(...achatarBloco(no));
    } else if (ehLista(no)) {
      fechar();
      const lista = arrumarLista(no);
      if (lista) resultado.push(lista);
    } else {
      if (!atual && ehEspaco(no)) continue;
      atual ??= bloco.cloneNode(false);
      atual.append(no);
    }
  }
  fechar();
  return resultado;
}

function arrumarLista(lista) {
  const nova = lista.cloneNode(false);
  let ultimo = null;
  for (const no of [...lista.childNodes]) {
    if (no.nodeName === 'LI') {
      ultimo = arrumarItem(no);
      nova.append(ultimo);
    } else if (ehLista(no)) {
      // Sublista solta dentro da lista (o Chrome às vezes cria): vai para o
      // item de cima.
      const sub = arrumarLista(no);
      if (!sub) continue;
      if (!ultimo) {
        ultimo = document.createElement('li');
        nova.append(ultimo);
      }
      ultimo.append(sub);
    } else if (!ehEspaco(no)) {
      // Texto solto dentro da lista vira um item.
      const item = document.createElement('li');
      item.append(no);
      ultimo = arrumarItem(item);
      nova.append(ultimo);
    }
  }
  return nova.children.length ? nova : null;
}

function arrumarItem(item) {
  const novo = item.cloneNode(false);
  for (const no of [...item.childNodes]) {
    if (ehLista(no)) {
      const sub = arrumarLista(no);
      if (sub) novo.append(sub);
    } else if (ehBloco(no)) {
      for (const parte of achatarBloco(no)) {
        if (ehLista(parte)) {
          novo.append(parte);
          continue;
        }
        if (temConteudo(novo)) novo.append(document.createElement('br'));
        novo.append(...parte.childNodes);
      }
    } else {
      novo.append(no);
    }
  }
  return novo;
}

function descerEstiloDeTexto(bloco) {
  const estilos = JSON.parse(bloco.dataset.estiloTexto);
  bloco.removeAttribute('data-estilo-texto');
  const conteudo = [...bloco.childNodes].filter(no => !ehLista(no));
  if (!conteudo.length) return;
  const span = document.createElement('span');
  for (const [propriedade, valor] of Object.entries(estilos)) span.style.setProperty(propriedade, valor);
  conteudo[0].before(span);
  span.append(...conteudo);
}

// Espaços no começo e no fim de um bloco colado (vindos da indentação do
// código-fonte) não aparecem no original, então não aparecem aqui.
function aparar(bloco) {
  const textos = [];
  const caminhante = document.createTreeWalker(bloco, NodeFilter.SHOW_TEXT);
  while (caminhante.nextNode()) {
    if (caminhante.currentNode.parentElement.closest('ul, ol') !== bloco.closest('ul, ol')) continue;
    textos.push(caminhante.currentNode);
  }
  if (textos.length) {
    textos[0].data = textos[0].data.replace(/^ +/, '');
    textos.at(-1).data = textos.at(-1).data.replace(/ +$/, '');
  }
}

function ehBloco(no) {
  return no.nodeType === Node.ELEMENT_NODE && BLOCOS.has(no.tagName);
}

function ehLista(no) {
  return no.nodeType === Node.ELEMENT_NODE && LISTAS.has(no.tagName);
}

function ehEspaco(no) {
  return no.nodeType === Node.TEXT_NODE && !/[^ \t\n\r\f]/.test(no.data);
}

// Texto (inclusive espaço fixo, que o Word usa para linha em branco) ou
// uma quebra de linha.
function temConteudo(el) {
  return /[^ \t\n\r\f]/.test(el.textContent) || el.querySelector('br') !== null;
}
