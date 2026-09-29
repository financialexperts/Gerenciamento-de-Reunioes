import { state } from '../../state/store.js';
import { buscarCategorias, faltaTabelaDeCategorias } from '../../../backend/api/categoriasRepo.js';
import { chaveCorCurso } from '../../../backend/domain/turmas.js';
import { escapeHtml, movimentoReduzido, normalizar } from '../../shared/dom.js';
import { estadoHtml } from '../../shared/estado.js';
import { criarTecladoDaGrade } from '../../shared/grade.js';
import { carregarAlinhamento, esperarAlinhamento, professorPorId } from '../alinhamento/alinhamentoView.js';
import { simboloDoIcone } from '../categorias/icones.js';
import { abrirNovaCategoria, fecharNovaCategoria } from '../categorias/novaCategoria.js';

// Página de um professor: quem é (nome, e-mail e cursos) e as categorias de
// reunião em quadrados, como os cartões do Alinhamento. As categorias são
// uma lista só, igual para todos os professores. Por enquanto, clicar numa
// categoria só a seleciona.

const els = {};
let professorId = null;
let professor = null;         // item da lista (nome, e-mail, cursos) aberto agora
let abertura = 0;             // muda a cada abertura: descarta o que chegar de uma anterior
let geracao = 0;              // muda ao sair: descarta categorias de uma carga antiga
let cargaCategorias = null;   // carga em andamento (evita duas em paralelo)
let podeCriar = false;
let selecionadaId = null;
let focoId = null;            // cartão que recebe o Tab (roving tabindex)
let teclado = null;

const ESTADOS = {
  naoEncontrado: {
    icone: 'i-pessoas',
    titulo: 'Professor não encontrado',
    texto: 'O cadastro pode ter sido removido, ou sua conta não tem acesso a ele.',
    acao: ['voltar', 'Voltar para Alinhamento'],
  },
  erroProfessor: {
    icone: 'i-sem-conexao',
    titulo: 'Não foi possível carregar o professor',
    texto: 'Verifique a conexão com a internet e tente de novo.',
    acao: ['recarregar-tudo', 'Tentar de novo'],
  },
  erroCategorias: {
    icone: 'i-sem-conexao',
    titulo: 'Não foi possível carregar as categorias',
    texto: 'Verifique a conexão com a internet e tente de novo.',
    acao: ['recarregar', 'Tentar de novo'],
  },
  semTabela: {
    icone: 'i-alerta',
    titulo: 'Categorias ainda não configuradas',
    texto: 'Falta criar a tabela de categorias no banco de dados: rode o arquivo sql/categorias_reuniao.sql no SQL Editor do Supabase.',
    acao: ['recarregar', 'Tentar de novo'],
  },
};

function estadoSemCategorias() {
  return {
    icone: 'i-grade',
    titulo: 'Nenhuma categoria ainda',
    texto: podeCriar
      ? 'Crie a primeira em “Nova categoria”. Ela aparece para todos os professores.'
      : 'As categorias de reunião são criadas por quem administra o sistema.',
  };
}

export function iniciarProfessor({ aoVoltar }) {
  els.nome = document.getElementById('professor-nome');
  els.email = document.getElementById('professor-email');
  els.cursos = document.getElementById('professor-cursos');
  els.novaCategoria = document.getElementById('btn-nova-categoria');
  els.secao = document.getElementById('secao-categorias');
  els.grade = document.getElementById('lista-categorias');
  els.estado = document.getElementById('estado-categorias');
  els.aviso = document.getElementById('aviso-categorias');

  document.getElementById('btn-voltar').addEventListener('click', aoVoltar);
  els.novaCategoria.addEventListener('click', () => abrirNovaCategoria(professor?.nome));

  els.grade.addEventListener('click', evento => {
    const cartao = evento.target.closest('.cartao[data-id]');
    if (cartao) alternarSelecao(cartao.dataset.id);
  });
  teclado = criarTecladoDaGrade({
    grade: els.grade,
    seletor: '.cartao[data-id]',
    nomeDe: cartao => normalizar(cartao.textContent),
  });
  els.grade.addEventListener('keydown', aoTeclar);
  els.grade.addEventListener('focusin', evento => {
    const cartao = evento.target.closest('.cartao[data-id]');
    if (cartao) marcarFoco(cartao);
  });

  els.estado.addEventListener('click', evento => {
    const acao = evento.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'voltar') aoVoltar();
    if (acao === 'recarregar') abrir(professorId);
    if (acao === 'recarregar-tudo') {
      carregarAlinhamento();
      abrir(professorId);
    }
  });
}

// Chamada a cada vez que a página aparece (clique na lista, Voltar/Avançar
// do navegador ou endereço aberto direto). O foco vai para o nome, que o
// leitor de tela anuncia como o título da página nova.
export function abrirProfessor(id) {
  return abrir(id, { focarTitulo: true });
}

// Admin cria categorias, como quem cadastra professor no Sistema de Presença.
export function permitirNovaCategoria(permitido) {
  podeCriar = permitido;
  els.novaCategoria.hidden = !(podeCriar && professor);
  if (!permitido) fecharNovaCategoria();
  // O texto da tela vazia depende de quem pode criar.
  if (professor && state.categorias?.length === 0) mostrarEstado(estadoSemCategorias());
}

// Categoria recém-criada: entra no fim da lista, selecionada e com foco.
export function adicionarCategoria(categoria) {
  state.categorias = [...(state.categorias ?? []), categoria];
  selecionadaId = String(categoria.id);
  focoId = selecionadaId;
  desenharCategorias();
  const cartao = document.getElementById(`categoria-${selecionadaId}`);
  if (!cartao) return;
  cartao.classList.add('cartao--novo');
  cartao.addEventListener('animationend', () => cartao.classList.remove('cartao--novo'), { once: true });
  cartao.focus({ preventScroll: true });
  cartao.scrollIntoView({ block: 'nearest', behavior: movimentoReduzido() ? 'auto' : 'smooth' });
  els.aviso.textContent = `Categoria “${categoria.nome}” criada. Ela aparece para todos os professores.`;
}

// Ao sair: esquece o professor aberto e as categorias da sessão anterior.
export function limparProfessor() {
  abertura++;
  geracao++;
  cargaCategorias = null;
  professorId = null;
  professor = null;
  selecionadaId = null;
  focoId = null;
  state.categorias = null;
  els.grade.innerHTML = '';
  els.estado.hidden = true;
  els.cursos.innerHTML = '';
  els.aviso.textContent = '';
  els.novaCategoria.hidden = true;
}

// ---------- Dados ----------

async function abrir(id, { focarTitulo = false } = {}) {
  const minha = ++abertura;
  professorId = id;
  professor = null;
  selecionadaId = null;
  focoId = null;
  els.aviso.textContent = '';
  desenharCabecalho('carregando');

  // As categorias já vêm vindo enquanto a lista de professores termina de
  // chegar. Se já estavam na memória, aparecem na hora e são conferidas.
  const categorias = carregarCategorias();
  if (state.categorias) desenharCategorias();
  else mostrarEsqueleto();

  const listaOk = await esperarAlinhamento();
  if (minha !== abertura) return;
  professor = listaOk ? professorPorId(id) : null;
  desenharCabecalho(!listaOk ? 'erro' : professor ? 'pronto' : 'nao-encontrado');
  if (focarTitulo) els.nome.focus({ preventScroll: true });
  if (!listaOk) return mostrarEstado(ESTADOS.erroProfessor, { semSecao: true });
  if (!professor) return mostrarEstado(ESTADOS.naoEncontrado, { semSecao: true });

  const resultado = await categorias;
  if (minha !== abertura) return;
  if (resultado.ok) {
    if (resultado.mudou) desenharCategorias();
  } else if (!state.categorias) {
    // Sem nada na memória para mostrar; com lista antiga, ela continua na tela.
    mostrarEstado(faltaTabelaDeCategorias(resultado.erro) ? ESTADOS.semTabela : ESTADOS.erroCategorias);
  }
}

// Devolve { ok, mudou } ou { ok: false, erro }.
function carregarCategorias() {
  if (!cargaCategorias) {
    const minhaGeracao = geracao;
    const promessa = buscarCategorias()
      .then(lista => {
        if (minhaGeracao !== geracao) return { ok: false, erro: null };
        const mudou = JSON.stringify(lista) !== JSON.stringify(state.categorias);
        state.categorias = lista;
        return { ok: true, mudou };
      }, erro => {
        console.error('Erro ao carregar as categorias:', erro);
        return { ok: false, erro };
      })
      .finally(() => {
        if (cargaCategorias === promessa) cargaCategorias = null;
      });
    cargaCategorias = promessa;
  }
  return cargaCategorias;
}

// ---------- Desenho ----------

function desenharCabecalho(situacao) {
  const pronto = situacao === 'pronto';
  els.nome.textContent = pronto ? professor.nome : 'Professor';
  els.nome.title = pronto ? professor.nome : ''; // nome longo cortado com "…"
  els.email.textContent = pronto
    ? professor.email || 'Sem e-mail cadastrado'
    : situacao === 'carregando' ? 'Carregando…' : '';
  els.cursos.innerHTML = pronto ? cursosHtml(professor.cursos) : '';
  els.novaCategoria.hidden = !(podeCriar && pronto);
  document.title = pronto ? `${professor.nome} – Gestão de Reuniões` : 'Gestão de Reuniões';
}

function cursosHtml(cursos) {
  if (!cursos.length) return '<li class="cabecalho__sem-cursos">Sem turmas ativas</li>';
  return cursos.map(curso => `
    <li class="chip" data-cor="${chaveCorCurso(curso)}" title="${escapeHtml(curso)}"><span>${escapeHtml(curso)}</span></li>`).join('');
}

function desenharCategorias() {
  const lista = state.categorias ?? [];
  els.secao.hidden = false;
  els.grade.removeAttribute('aria-busy');
  if (!lista.length) return mostrarEstado(estadoSemCategorias());

  const focoNaGrade = els.grade.contains(document.activeElement);
  els.estado.hidden = true;
  els.grade.hidden = false;
  els.grade.innerHTML = lista.map(cartaoHtml).join('');
  ajustarTabulacao();
  if (focoNaGrade) els.grade.querySelector('[tabindex="0"]')?.focus({ preventScroll: true });
}

function cartaoHtml(categoria) {
  const id = String(categoria.id);
  return `
    <div class="cartao cartao--categoria" role="option" id="categoria-${escapeHtml(id)}" data-id="${escapeHtml(id)}"
         tabindex="-1" aria-selected="${id === selecionadaId}">
      <span class="cartao__icone" aria-hidden="true"><svg class="icone"><use href="#${simboloDoIcone(categoria.icone)}"/></svg></span>
      <span class="cartao__marcador" aria-hidden="true"><svg class="icone"><use href="#i-check"/></svg></span>
      <div class="cartao__info">
        <p class="cartao__nome">${escapeHtml(categoria.nome)}</p>
      </div>
    </div>`;
}

function mostrarEsqueleto() {
  els.secao.hidden = false;
  els.estado.hidden = true;
  els.grade.hidden = false;
  els.grade.setAttribute('aria-busy', 'true');
  els.grade.innerHTML = `
    <div class="cartao cartao--esqueleto" aria-hidden="true">
      <span class="cartao__icone"></span>
      <div class="cartao__info"><span class="linha-esqueleto l1"></span></div>
    </div>`.repeat(2);
}

// semSecao: o problema é com o professor, não com as categorias, então o
// título "Categorias de reunião" sai junto.
function mostrarEstado(estado, { semSecao = false } = {}) {
  els.secao.hidden = semSecao;
  els.grade.hidden = true;
  els.grade.innerHTML = '';
  els.grade.removeAttribute('aria-busy');
  els.estado.innerHTML = estadoHtml(estado);
  els.estado.hidden = false;
}

// ---------- Seleção e teclado ----------

function alternarSelecao(id) {
  selecionadaId = selecionadaId === id ? null : id;
  for (const cartao of els.grade.querySelectorAll('.cartao[data-id]')) {
    cartao.setAttribute('aria-selected', String(cartao.dataset.id === selecionadaId));
  }
}

function aoTeclar(evento) {
  const alvo = teclado.destino(evento);
  if (alvo) return focar(alvo);

  const atual = evento.target.closest('.cartao[data-id]');
  const semAtalho = !(evento.altKey || evento.ctrlKey || evento.metaKey || evento.shiftKey);
  if (atual && semAtalho && (evento.key === 'Enter' || (evento.key === ' ' && !teclado.digitando()))) {
    evento.preventDefault();
    alternarSelecao(atual.dataset.id);
  }
}

// Só um cartão fica no Tab: o último focado, senão o selecionado, senão o primeiro.
function ajustarTabulacao() {
  const cartoes = [...els.grade.querySelectorAll('.cartao[data-id]')];
  const alvo = cartoes.find(c => c.dataset.id === focoId)
    ?? cartoes.find(c => c.dataset.id === selecionadaId)
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
