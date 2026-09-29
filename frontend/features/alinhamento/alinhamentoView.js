import { state } from '../../state/store.js';
import { buscarProfessores } from '../../../backend/api/professoresRepo.js';
import { buscarTurmas } from '../../../backend/api/turmasRepo.js';
import { chaveCorCurso, compararTurmas, turmaAtiva } from '../../../backend/domain/turmas.js';
import { escapeHtml, iniciais, listaPorExtenso, normalizar } from '../../shared/dom.js';

// Página "Alinhamento": um cartão grande e selecionável por professor, com
// busca por nome/e-mail e filtros de curso e turma (tudo do banco do
// Sistema de Presença). A grade é um listbox de seleção única: Tab entra
// nela uma vez, as setas andam entre os cartões e Espaço/Enter seleciona.

const els = {};
const ptBR = (a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });

let indice = [];            // um item por professor, já com turmas e cursos
let itemPorId = new Map();
let carga = null;           // carga em andamento (evita duas em paralelo)
let geracao = 0;            // muda ao sair: descarta resposta de carga antiga
let focoId = null;          // cartão que recebe o Tab (roving tabindex)
let digitado = '';          // digitar dentro da grade pula para o nome
let digitadoTimer = 0;
let avisoTimer = 0;

const ESTADOS = {
  semCadastro: {
    icone: 'i-pessoas',
    titulo: 'Nenhum professor cadastrado',
    texto: 'Os professores são cadastrados no Sistema de Presença, em Configurações › Professores.',
  },
  erro: {
    icone: 'i-sem-conexao',
    titulo: 'Não foi possível carregar os professores',
    texto: 'Verifique a conexão com a internet e tente de novo.',
    acao: ['recarregar', 'Tentar de novo'],
  },
};

export function iniciarAlinhamento() {
  els.app = document.getElementById('app');
  els.grade = document.getElementById('lista-professores');
  els.estado = document.getElementById('estado-lista');
  els.contagem = document.getElementById('contagem');
  els.aviso = document.getElementById('aviso-lista');
  els.busca = document.getElementById('busca-professor');
  els.limparBusca = document.getElementById('btn-limpar-busca');
  els.curso = document.getElementById('filtro-curso');
  els.turma = document.getElementById('filtro-turma');
  els.limparFiltros = document.getElementById('btn-limpar-filtros');

  // A busca filtra enquanto se digita (HIG › Search fields).
  els.busca.addEventListener('input', () => {
    state.filtros.texto = els.busca.value;
    render();
  });
  els.busca.addEventListener('keydown', evento => {
    if (evento.key === 'Escape' && els.busca.value) {
      evento.preventDefault();
      limparBusca();
    }
  });
  els.limparBusca.addEventListener('click', () => {
    limparBusca();
    els.busca.focus();
  });

  els.curso.addEventListener('change', () => {
    state.filtros.curso = els.curso.value;
    popularTurmas();
    render();
  });
  els.turma.addEventListener('change', () => {
    state.filtros.turmaId = els.turma.value;
    render();
  });
  els.limparFiltros.addEventListener('click', () => {
    limparFiltros({ manterBusca: true });
    els.curso.focus();
  });

  els.grade.addEventListener('click', evento => {
    const cartao = evento.target.closest('.cartao[data-id]');
    if (cartao) alternarSelecao(cartao.dataset.id);
  });
  els.grade.addEventListener('keydown', navegarPeloTeclado);
  els.grade.addEventListener('focusin', evento => {
    const cartao = evento.target.closest('.cartao[data-id]');
    if (cartao) marcarFoco(cartao);
  });

  els.estado.addEventListener('click', evento => {
    const acao = evento.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'limpar-tudo') {
      limparFiltros();
      els.busca.focus();
    }
    if (acao === 'recarregar') carregarAlinhamento();
  });

  // "/" leva para a busca (sem sequestrar atalhos do navegador como Ctrl+F).
  document.addEventListener('keydown', evento => {
    if (evento.key !== '/' || evento.ctrlKey || evento.metaKey || evento.altKey || els.app.hidden) return;
    if (evento.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    evento.preventDefault();
    els.busca.focus();
    els.busca.select();
  });
}

export function carregarAlinhamento() {
  if (!carga) {
    const promessa = executarCarga().finally(() => {
      if (carga === promessa) carga = null;
    });
    carga = promessa;
  }
  return carga;
}

// Ao sair: esquece dados, filtros e seleção da pessoa anterior.
export function limparAlinhamento() {
  geracao++;
  carga = null;
  indice = [];
  itemPorId = new Map();
  focoId = null;
  state.professores = [];
  state.turmas = [];
  state.filtros = { texto: '', curso: '', turmaId: '' };
  state.selecionadoId = null;
  els.busca.value = '';
  els.limparBusca.hidden = true;
  els.limparFiltros.hidden = true;
  els.curso.innerHTML = '<option value="">Todos</option>';
  els.turma.innerHTML = '<option value="">Todas</option>';
  els.grade.innerHTML = '';
  els.estado.hidden = true;
  els.contagem.textContent = '';
  els.aviso.textContent = '';
}

// ---------- Dados ----------

async function executarCarga() {
  const minhaGeracao = geracao;
  mostrarEsqueleto();
  try {
    const [professores, turmas] = await Promise.all([buscarProfessores(), buscarTurmas()]);
    if (minhaGeracao !== geracao) return;
    state.professores = professores;
    state.turmas = turmas.filter(turmaAtiva).sort(compararTurmas);
    montarIndice();
    popularCursos();
    render();
  } catch (erro) {
    if (minhaGeracao !== geracao) return;
    console.error('Erro ao carregar professores e turmas:', erro);
    els.contagem.textContent = '';
    mostrarEstado(ESTADOS.erro);
  }
}

// Liga cada professor às turmas ativas dele (pelo professor_id, o vínculo
// real) e resume os cursos em que dá aula.
function montarIndice() {
  const turmasPorProfessor = new Map();
  for (const turma of state.turmas) {
    if (turma.professor_id == null) continue;
    const chave = String(turma.professor_id);
    if (!turmasPorProfessor.has(chave)) turmasPorProfessor.set(chave, []);
    turmasPorProfessor.get(chave).push(turma);
  }

  indice = state.professores
    .map(professor => {
      const id = String(professor.id);
      const turmas = turmasPorProfessor.get(id) ?? [];
      const nome = professor.nome?.trim() || professor.email?.trim() || 'Sem nome';
      return {
        id,
        nome,
        email: professor.email?.trim() ?? '',
        turmas,
        cursos: [...new Set(turmas.map(t => t.curso?.trim()).filter(Boolean))].sort(ptBR),
        nomeBusca: normalizar(nome),
        busca: normalizar(`${professor.nome ?? ''} ${professor.email ?? ''}`),
      };
    })
    .sort((a, b) => ptBR(a.nome, b.nome));

  itemPorId = new Map(indice.map(item => [item.id, item]));
}

// ---------- Filtros ----------

const opcao = (valor, texto) => `<option value="${escapeHtml(valor)}">${escapeHtml(texto)}</option>`;

function popularCursos() {
  const cursos = [...new Set(state.turmas.map(t => t.curso?.trim()).filter(Boolean))].sort(ptBR);
  if (!cursos.includes(state.filtros.curso)) state.filtros.curso = '';
  els.curso.innerHTML = '<option value="">Todos</option>' + cursos.map(c => opcao(c, c)).join('');
  els.curso.value = state.filtros.curso;
  els.curso.disabled = !cursos.length;
  popularTurmas();
}

// Com um curso escolhido, lista só as turmas dele; com "Todos", agrupa as
// turmas por curso (títulos de seção no menu).
function popularTurmas() {
  const { curso } = state.filtros;
  const turmas = state.turmas.filter(t => !curso || t.curso?.trim() === curso);
  if (!turmas.some(t => String(t.id) === state.filtros.turmaId)) state.filtros.turmaId = '';

  const opcaoTurma = t => opcao(String(t.id), t.turma?.trim() || 'Turma sem nome');
  let html = '<option value="">Todas</option>';
  if (curso) {
    html += turmas.map(opcaoTurma).join('');
  } else {
    const grupos = new Map();
    for (const turma of turmas) {
      const nomeCurso = turma.curso?.trim() || 'Sem curso';
      if (!grupos.has(nomeCurso)) grupos.set(nomeCurso, []);
      grupos.get(nomeCurso).push(turma);
    }
    const nomes = [...grupos.keys()].sort((a, b) => (a === 'Sem curso') - (b === 'Sem curso') || ptBR(a, b));
    for (const nome of nomes) {
      html += `<optgroup label="${escapeHtml(nome)}">${grupos.get(nome).map(opcaoTurma).join('')}</optgroup>`;
    }
  }
  els.turma.innerHTML = html;
  els.turma.value = state.filtros.turmaId;
  els.turma.disabled = !turmas.length;
}

function filtrar() {
  const { texto, curso, turmaId } = state.filtros;
  const termos = normalizar(texto).split(' ').filter(Boolean);
  return indice.filter(item =>
    termos.every(termo => item.busca.includes(termo))
    && (!curso || item.turmas.some(t => t.curso?.trim() === curso))
    && (!turmaId || item.turmas.some(t => String(t.id) === turmaId)));
}

function limparBusca() {
  els.busca.value = '';
  state.filtros.texto = '';
  render();
}

function limparFiltros({ manterBusca = false } = {}) {
  if (!manterBusca) {
    els.busca.value = '';
    state.filtros.texto = '';
  }
  state.filtros.curso = '';
  state.filtros.turmaId = '';
  els.curso.value = '';
  popularTurmas();
  render();
}

// ---------- Desenho ----------

function render() {
  const temBusca = Boolean(state.filtros.texto.trim());
  const temFiltro = Boolean(state.filtros.curso || state.filtros.turmaId);
  els.limparBusca.hidden = !els.busca.value;
  els.limparFiltros.hidden = !temFiltro;
  els.grade.removeAttribute('aria-busy');

  const lista = filtrar();
  anunciarContagem(lista.length, temBusca || temFiltro);

  if (!indice.length) return mostrarEstado(ESTADOS.semCadastro);
  if (!lista.length) return mostrarEstado(estadoSemResultado(temBusca, temFiltro));

  els.estado.hidden = true;
  els.grade.hidden = false;
  els.grade.innerHTML = lista.map(cartaoHtml).join('');
  ajustarTabulacao();
}

function cartaoHtml(item) {
  const selecionado = item.id === state.selecionadoId;
  // O leitor de tela lê o cartão numa frase só, na ordem em que aparece.
  const rotulo = [
    item.nome,
    item.email || 'sem e-mail cadastrado',
    item.cursos.length ? `cursos: ${listaPorExtenso(item.cursos)}` : 'sem turmas ativas',
  ].join(', ');

  const cursos = item.cursos.length
    ? `<ul class="cartao__cursos">${item.cursos.map(curso => `
        <li class="chip" data-curso="${chaveCorCurso(curso)}" title="${escapeHtml(curso)}"><span>${escapeHtml(curso)}</span></li>`).join('')}
      </ul>`
    : '<p class="cartao__sem-cursos">Sem turmas ativas</p>';

  return `
    <div class="cartao" role="option" id="professor-${escapeHtml(item.id)}" data-id="${escapeHtml(item.id)}"
         tabindex="-1" aria-selected="${selecionado}" aria-label="${escapeHtml(rotulo)}">
      <span class="avatar" aria-hidden="true">${escapeHtml(iniciais(item.nome))}</span>
      <span class="cartao__marcador" aria-hidden="true"><svg class="icone"><use href="#i-check"/></svg></span>
      <div class="cartao__info">
        <p class="cartao__nome">${escapeHtml(item.nome)}</p>
        <p class="cartao__email"${item.email ? ` title="${escapeHtml(item.email)}"` : ''}>${escapeHtml(item.email || 'Sem e-mail cadastrado')}</p>
        ${cursos}
      </div>
    </div>`;
}

function mostrarEsqueleto() {
  els.estado.hidden = true;
  els.grade.hidden = false;
  els.grade.setAttribute('aria-busy', 'true');
  els.contagem.textContent = 'Carregando professores…';
  els.grade.innerHTML = `
    <div class="cartao cartao--esqueleto" aria-hidden="true">
      <span class="avatar"></span>
      <div class="cartao__info">
        <span class="linha-esqueleto l1"></span>
        <span class="linha-esqueleto l2"></span>
        <span class="linha-esqueleto l3"></span>
      </div>
    </div>`.repeat(8);
}

function mostrarEstado({ icone, titulo, texto, acao }) {
  els.grade.hidden = true;
  els.grade.innerHTML = '';
  els.estado.innerHTML = `
    <svg class="icone" aria-hidden="true"><use href="#${icone}"/></svg>
    <h3 class="estado__titulo">${escapeHtml(titulo)}</h3>
    <p class="estado__texto">${escapeHtml(texto)}</p>
    ${acao ? `<button type="button" class="botao-secundario" data-acao="${acao[0]}">${escapeHtml(acao[1])}</button>` : ''}`;
  els.estado.hidden = false;
}

// A tela vazia diz o que aconteceu e oferece o próximo passo (HIG › Writing).
function estadoSemResultado(temBusca, temFiltro) {
  const termo = state.filtros.texto.trim();
  let texto = 'Nenhum professor dá aula nessa combinação de curso e turma.';
  if (temBusca) {
    texto = `Nenhum nome ou e-mail corresponde a “${termo}”${temFiltro ? ' no curso e na turma escolhidos' : ''}.`;
  }
  const rotuloAcao = temBusca && temFiltro ? 'Limpar busca e filtros' : temBusca ? 'Limpar busca' : 'Limpar filtros';
  return { icone: 'i-lupa', titulo: 'Nenhum professor encontrado', texto, acao: ['limpar-tudo', rotuloAcao] };
}

// O subtítulo muda na hora; o leitor de tela recebe o resultado só quando
// a digitação para, em vez de uma frase por letra.
function anunciarContagem(visiveis, filtrando) {
  const total = indice.length;
  const quantos = n => `${n} ${n === 1 ? 'professor' : 'professores'}`;
  const texto = !total ? 'Nenhum professor' : filtrando ? `${visiveis} de ${quantos(total)}` : quantos(total);
  els.contagem.textContent = texto;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => {
    els.aviso.textContent = filtrando && !visiveis ? 'Nenhum professor encontrado' : texto;
  }, 500);
}

// ---------- Seleção e teclado ----------

function alternarSelecao(id) {
  state.selecionadoId = state.selecionadoId === id ? null : id;
  for (const cartao of els.grade.querySelectorAll('.cartao[data-id]')) {
    cartao.setAttribute('aria-selected', String(cartao.dataset.id === state.selecionadoId));
  }
}

// Só um cartão fica no Tab: o último focado, senão o selecionado, senão o primeiro.
function ajustarTabulacao() {
  const cartoes = [...els.grade.querySelectorAll('.cartao[data-id]')];
  const alvo = cartoes.find(c => c.dataset.id === focoId)
    ?? cartoes.find(c => c.dataset.id === state.selecionadoId)
    ?? cartoes[0];
  for (const cartao of cartoes) cartao.tabIndex = cartao === alvo ? 0 : -1;
}

function marcarFoco(cartao) {
  focoId = cartao.dataset.id;
  for (const outro of els.grade.querySelectorAll('.cartao[data-id]')) outro.tabIndex = outro === cartao ? 0 : -1;
}

function focar(cartao) {
  marcarFoco(cartao);
  cartao.focus({ preventScroll: true });
  cartao.scrollIntoView({ block: 'nearest' });
}

function navegarPeloTeclado(evento) {
  const atual = evento.target.closest('.cartao[data-id]');
  if (!atual || evento.altKey || evento.ctrlKey || evento.metaKey) return;

  const cartoes = [...els.grade.querySelectorAll('.cartao[data-id]')];
  const i = cartoes.indexOf(atual);
  const colunas = getComputedStyle(els.grade).gridTemplateColumns.split(' ').length;
  const destinos = {
    ArrowRight: i + 1,
    ArrowLeft: i - 1,
    ArrowDown: i + colunas,
    ArrowUp: i - colunas,
    Home: 0,
    End: cartoes.length - 1,
  };

  if (evento.key in destinos) {
    evento.preventDefault();
    const alvo = cartoes[destinos[evento.key]];
    if (alvo) focar(alvo);
    return;
  }
  if (evento.key === 'Enter' || (evento.key === ' ' && !digitado)) {
    evento.preventDefault();
    alternarSelecao(atual.dataset.id);
    return;
  }
  if (evento.key.length === 1 && evento.key !== '/') pularParaNome(evento, cartoes, i);
}

// Digitar com a grade em foco leva ao primeiro nome que começa com o texto;
// repetir a mesma letra percorre quem começa com ela.
function pularParaNome(evento, cartoes, i) {
  evento.preventDefault();
  digitado += evento.key === ' ' ? ' ' : normalizar(evento.key);
  clearTimeout(digitadoTimer);
  digitadoTimer = setTimeout(() => { digitado = ''; }, 700);

  const inicio = digitado.length === 1 ? i + 1 : i;
  const ordem = [...cartoes.slice(inicio), ...cartoes.slice(0, inicio)];
  const alvo = ordem.find(cartao => itemPorId.get(cartao.dataset.id)?.nomeBusca.startsWith(digitado));
  if (alvo) focar(alvo);
}
