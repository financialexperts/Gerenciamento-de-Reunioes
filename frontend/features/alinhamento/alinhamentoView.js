import { state } from '../../state/store.js';
import { buscarProfessores } from '../../../backend/api/professoresRepo.js';
import { buscarTurmas } from '../../../backend/api/turmasRepo.js';
import { chaveCorCurso, compararTurmas, turmaAtiva } from '../../../backend/domain/turmas.js';
import { escapeHtml, iniciais, listaPorExtenso, movimentoReduzido, normalizar } from '../../shared/dom.js';
import { estadoHtml } from '../../shared/estado.js';
import { criarTecladoDaGrade } from '../../shared/grade.js';
import { criarMenuFiltro } from '../../shared/menuFiltro.js';
import { enderecoDoProfessor } from '../app/rotas.js';

const els = {};
const ptBR = (a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
const quantos = n => `${n} ${n === 1 ? 'professor' : 'professores'}`;

let menus = [];             // menus dos filtros de curso e turma
let indice = [];            // um item por professor, já com turmas e cursos
let itemPorId = new Map();
let carga = null;           // carga em andamento (evita duas em paralelo)
let cargaOk = false;        // a última carga terminou bem
let geracao = 0;            // muda ao sair: descarta resposta de carga antiga
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

export function iniciarAlinhamento({ aoAbrirProfessor }) {
  els.app = document.getElementById('app');
  els.titulo = document.getElementById('titulo-alinhamento');
  els.controles = document.getElementById('controles-alinhamento');
  els.grade = document.getElementById('lista-professores');
  els.estado = document.getElementById('estado-lista');
  els.contagem = document.getElementById('contagem');
  els.aviso = document.getElementById('aviso-lista');
  els.busca = document.getElementById('busca-professor');
  els.limparBusca = document.getElementById('btn-limpar-busca');
  els.curso = document.getElementById('filtro-curso');
  els.cursoValor = document.getElementById('filtro-curso-valor');
  els.cursoPonto = document.getElementById('filtro-curso-ponto');
  els.turma = document.getElementById('filtro-turma');
  els.turmaValor = document.getElementById('filtro-turma-valor');
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

  menus = [
    criarMenuFiltro({
      botao: els.curso,
      painel: document.getElementById('menu-curso'),
      rotulo: 'Cursos',
      montar: montarMenuCursos,
      aoEscolher: escolherCurso,
    }),
    criarMenuFiltro({
      botao: els.turma,
      painel: document.getElementById('menu-turma'),
      rotulo: 'Turmas',
      buscaPlaceholder: 'Buscar turma ou professor',
      montar: montarMenuTurmas,
      aoEscolher: escolherTurma,
    }),
  ];
  atualizarBotoesFiltro();

  els.limparFiltros.addEventListener('click', () => {
    limparFiltros({ manterBusca: true });
    els.curso.focus();
  });

  // Cada cartão é um link para a página do professor. Clique simples abre
  // aqui mesmo; Ctrl/⌘ ou o botão do meio abrem em outra aba, como qualquer link.
  els.grade.addEventListener('click', evento => {
    const cartao = evento.target.closest('.cartao[data-id]');
    if (!cartao || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    evento.preventDefault();
    aoAbrirProfessor(cartao.dataset.id);
  });
  const teclado = criarTecladoDaGrade({
    grade: els.grade,
    seletor: '.cartao[data-id]',
    nomeDe: cartao => itemPorId.get(cartao.dataset.id)?.nomeBusca ?? '',
  });
  els.grade.addEventListener('keydown', evento => {
    const alvo = teclado.destino(evento);
    if (!alvo) return;
    alvo.focus({ preventScroll: true });
    alvo.scrollIntoView({ block: 'nearest' });
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
    if (evento.key !== '/' || evento.ctrlKey || evento.metaKey || evento.altKey || els.app.hidden || els.controles.hidden) return;
    if (evento.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    evento.preventDefault();
    els.busca.focus();
    els.busca.select();
  });
}

// Devolve true quando a lista chegou e false quando a carga falhou.
export function carregarAlinhamento() {
  if (!carga) {
    const promessa = executarCarga().finally(() => {
      if (carga === promessa) carga = null;
    });
    carga = promessa;
  }
  return carga;
}

// Para quem precisa da lista pronta (a página de um professor aberta pelo
// endereço, antes de a lista chegar): espera a carga em andamento, se houver.
export function esperarAlinhamento() {
  return carga ?? Promise.resolve(cargaOk);
}

// Professor já com turmas e cursos resumidos, ou null se não está na lista
// (id que não existe ou que o RLS não deixa ver).
export function professorPorId(id) {
  return itemPorId.get(String(id)) ?? null;
}

// Ao voltar de um professor, o foco (e o olhar) volta para o cartão de onde
// a pessoa saiu, com um realce que se apaga, como numa lista do iOS.
export function focarProfessor(id) {
  const cartao = document.getElementById(`professor-${id}`);
  if (!cartao) {
    els.titulo.focus({ preventScroll: true });
    return;
  }
  cartao.focus({ preventScroll: true });
  cartao.scrollIntoView({ block: 'nearest' });
  realcar(cartao);
}

// Professor recém-cadastrado: entra na lista sem recarregar a página, em
// destaque e à vista (busca e filtros são limpos para ele aparecer).
export function adicionarProfessor(professor) {
  state.professores.push(professor);
  montarIndice();
  limparFiltros();
  const cartao = document.getElementById(`professor-${professor.id}`);
  if (!cartao) return;
  cartao.focus({ preventScroll: true });
  cartao.scrollIntoView({ block: 'center', behavior: movimentoReduzido() ? 'auto' : 'smooth' });
  realcar(cartao);
}

// Ao sair: esquece dados e filtros da pessoa anterior.
export function limparAlinhamento() {
  geracao++;
  carga = null;
  cargaOk = false;
  indice = [];
  itemPorId = new Map();
  state.professores = [];
  state.turmas = [];
  state.filtros = { texto: '', curso: '', turmaId: '' };
  for (const menu of menus) menu.fechar();
  els.busca.value = '';
  els.limparBusca.hidden = true;
  els.limparFiltros.hidden = true;
  atualizarBotoesFiltro();
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
    if (minhaGeracao !== geracao) return false;
    state.professores = professores;
    state.turmas = turmas.filter(turmaAtiva).sort(compararTurmas);
    montarIndice();
    validarFiltros();
    atualizarBotoesFiltro();
    render();
    cargaOk = true;
  } catch (erro) {
    if (minhaGeracao !== geracao) return false;
    console.error('Erro ao carregar professores e turmas:', erro);
    els.contagem.textContent = '';
    mostrarEstado(ESTADOS.erro);
    cargaOk = false;
  }
  return cargaOk;
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

function cursosAtivos() {
  return [...new Set(state.turmas.map(t => t.curso?.trim()).filter(Boolean))].sort(ptBR);
}

function turmasDoCurso(curso) {
  return state.turmas.filter(t => !curso || t.curso?.trim() === curso);
}

// Menu de cursos: cor de cada curso e quantos professores dão aula nele,
// para prever o resultado antes de escolher.
function montarMenuCursos() {
  const professoresNoCurso = curso => indice.filter(item => item.cursos.includes(curso)).length;
  return {
    selecionado: state.filtros.curso,
    todos: { valor: '', texto: 'Todos os cursos', detalhe: String(indice.length), rotulo: `Todos os cursos, ${quantos(indice.length)}` },
    grupos: [{
      opcoes: cursosAtivos().map(curso => {
        const n = professoresNoCurso(curso);
        return { valor: curso, texto: curso, cor: chaveCorCurso(curso), detalhe: String(n), rotulo: `${curso}, ${quantos(n)}` };
      }),
    }],
  };
}

// Menu de turmas: com "Todos os cursos", seções por curso; com um curso
// escolhido, só as turmas dele. Cada turma mostra quem dá aula nela.
function montarMenuTurmas() {
  const { curso } = state.filtros;
  const grupos = new Map();
  for (const turma of turmasDoCurso(curso)) {
    const nomeCurso = turma.curso?.trim() || 'Sem curso';
    if (!grupos.has(nomeCurso)) grupos.set(nomeCurso, []);
    grupos.get(nomeCurso).push(turma);
  }
  const nomes = [...grupos.keys()].sort((a, b) => (a === 'Sem curso') - (b === 'Sem curso') || ptBR(a, b));

  const opcaoTurma = turma => {
    const texto = turma.turma?.trim() || 'Turma sem nome';
    // O texto solto `turma.professor` só cobre quem o RLS não deixa ver.
    const professor = itemPorId.get(String(turma.professor_id))?.nome || turma.professor?.trim() || null;
    return {
      valor: String(turma.id),
      texto,
      detalhe: professor ?? 'Sem professor',
      rotulo: professor ? `${texto}, com ${professor}` : `${texto}, sem professor`,
    };
  };

  return {
    selecionado: state.filtros.turmaId,
    todos: { valor: '', texto: curso ? `Todas as turmas de ${curso}` : 'Todas as turmas' },
    grupos: nomes.map(nome => ({
      titulo: curso ? null : nome,
      cor: chaveCorCurso(nome),
      opcoes: grupos.get(nome).map(opcaoTurma),
    })),
  };
}

function escolherCurso(curso) {
  state.filtros.curso = curso;
  // A turma escolhida só continua valendo se for do curso novo.
  const turma = state.turmas.find(t => String(t.id) === state.filtros.turmaId);
  if (turma && curso && turma.curso?.trim() !== curso) state.filtros.turmaId = '';
  atualizarBotoesFiltro();
  render();
}

function escolherTurma(turmaId) {
  state.filtros.turmaId = turmaId;
  atualizarBotoesFiltro();
  render();
}

// Depois de recarregar, descarta filtro que aponta para curso/turma que sumiu.
function validarFiltros() {
  const { curso, turmaId } = state.filtros;
  if (curso && !cursosAtivos().includes(curso)) state.filtros.curso = '';
  if (turmaId && !turmasDoCurso(state.filtros.curso).some(t => String(t.id) === turmaId)) state.filtros.turmaId = '';
}

// O botão mostra o valor escolhido e fica azulado quando está filtrando.
function atualizarBotoesFiltro() {
  const { curso, turmaId } = state.filtros;
  els.cursoValor.textContent = curso || 'Todos';
  els.cursoPonto.hidden = !curso;
  els.cursoPonto.dataset.cor = chaveCorCurso(curso);
  els.curso.classList.toggle('popup--ativo', Boolean(curso));
  els.curso.title = curso;
  els.curso.disabled = !cursosAtivos().length;

  const turma = state.turmas.find(t => String(t.id) === turmaId);
  const nomeTurma = turma ? turma.turma?.trim() || 'Turma sem nome' : '';
  els.turmaValor.textContent = nomeTurma || 'Todas';
  els.turma.classList.toggle('popup--ativo', Boolean(turma));
  els.turma.title = nomeTurma;
  els.turma.disabled = !turmasDoCurso(curso).length;
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
  atualizarBotoesFiltro();
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
}

function cartaoHtml(item) {
  // O leitor de tela lê o cartão numa frase só, na ordem em que aparece.
  const rotulo = [
    item.nome,
    item.email || 'sem e-mail cadastrado',
    item.cursos.length ? `cursos: ${listaPorExtenso(item.cursos)}` : 'sem turmas ativas',
  ].join(', ');

  const cursos = item.cursos.length
    ? `<ul class="cartao__cursos">${item.cursos.map(curso => `
        <li class="chip" data-cor="${chaveCorCurso(curso)}" title="${escapeHtml(curso)}"><span>${escapeHtml(curso)}</span></li>`).join('')}
      </ul>`
    : '<p class="cartao__sem-cursos">Sem turmas ativas</p>';

  // A seta (›) só aparece no celular, quando o quadrado vira uma linha: é o
  // indicador de "abre outra página" das listas do iOS.
  return `
    <li>
      <a class="cartao" href="${escapeHtml(enderecoDoProfessor(item.id))}" id="professor-${escapeHtml(item.id)}"
         data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(rotulo)}">
        <span class="avatar" aria-hidden="true">${escapeHtml(iniciais(item.nome))}</span>
        <svg class="icone cartao__seta" aria-hidden="true"><use href="#i-seta-direita"/></svg>
        <div class="cartao__info">
          <p class="cartao__nome">${escapeHtml(item.nome)}</p>
          <p class="cartao__email"${item.email ? ` title="${escapeHtml(item.email)}"` : ''}>${escapeHtml(item.email || 'Sem e-mail cadastrado')}</p>
          ${cursos}
        </div>
      </a>
    </li>`;
}

function mostrarEsqueleto() {
  els.estado.hidden = true;
  els.grade.hidden = false;
  els.grade.setAttribute('aria-busy', 'true');
  els.contagem.textContent = 'Carregando professores…';
  els.grade.innerHTML = `
    <li aria-hidden="true">
      <div class="cartao cartao--esqueleto">
        <span class="avatar"></span>
        <div class="cartao__info">
          <span class="linha-esqueleto l1"></span>
          <span class="linha-esqueleto l2"></span>
          <span class="linha-esqueleto l3"></span>
        </div>
      </div>
    </li>`.repeat(8);
}

function mostrarEstado(estado) {
  els.grade.hidden = true;
  els.grade.innerHTML = '';
  els.estado.innerHTML = estadoHtml(estado);
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
  const texto = !total ? 'Nenhum professor' : filtrando ? `${visiveis} de ${quantos(total)}` : quantos(total);
  els.contagem.textContent = texto;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => {
    els.aviso.textContent = filtrando && !visiveis ? 'Nenhum professor encontrado' : texto;
  }, 500);
}

// Realce azul-claro que se apaga sozinho (cartoes.css › .cartao--realce).
function realcar(cartao) {
  cartao.classList.remove('cartao--realce');
  void cartao.offsetWidth; // recomeça a animação se já estava rodando
  cartao.classList.add('cartao--realce');
  cartao.addEventListener('animationend', () => cartao.classList.remove('cartao--realce'), { once: true });
}
