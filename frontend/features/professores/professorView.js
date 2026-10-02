import { state } from '../../state/store.js';
import { buscarCategorias, faltaTabelaDeCategorias } from '../../../backend/api/categoriasRepo.js';
import { chaveCorCurso } from '../../../backend/domain/turmas.js';
import { escapeHtml, movimentoReduzido, normalizar, realcar } from '../../shared/dom.js';
import { estadoHtml } from '../../shared/estado.js';
import { criarTecladoDaGrade } from '../../shared/grade.js';
import { carregarAlinhamento, esperarAlinhamento, professorPorId } from '../alinhamento/alinhamentoView.js';
import { enderecoDaCategoria } from '../app/rotas.js';
import { simboloDoIcone } from '../categorias/icones.js';
import { abrirNovaCategoria, fecharNovaCategoria } from '../categorias/novaCategoria.js';

// Página de um professor: quem é (nome, e-mail e cursos) e as categorias de
// reunião em quadrados, como os cartões do Alinhamento. As categorias são
// uma lista só, igual para todos os professores; cada quadrado abre a
// página da categoria, com as reuniões do professor nela.

const els = {};
let professorId = null;
let professor = null;         // item da lista (nome, e-mail, cursos) aberto agora
let abertura = 0;             // muda a cada abertura: descarta o que chegar de uma anterior
let geracao = 0;              // muda ao sair: descarta categorias de uma carga antiga
let cargaCategorias = null;   // carga em andamento (evita duas em paralelo)
let podeCriar = false;

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

export function iniciarProfessor({ aoVoltar, aoAbrirCategoria }) {
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

  // Cada quadrado é um link para a categoria. Clique simples abre aqui
  // mesmo; Ctrl/⌘ ou o botão do meio abrem em outra aba, como qualquer link.
  els.grade.addEventListener('click', evento => {
    const cartao = evento.target.closest('.cartao[data-id]');
    if (!cartao || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    evento.preventDefault();
    aoAbrirCategoria(professorId, cartao.dataset.id);
  });
  const teclado = criarTecladoDaGrade({
    grade: els.grade,
    seletor: '.cartao[data-id]',
    nomeDe: cartao => normalizar(cartao.textContent),
  });
  els.grade.addEventListener('keydown', evento => {
    const alvo = teclado.destino(evento);
    if (!alvo) return;
    alvo.focus({ preventScroll: true });
    alvo.scrollIntoView({ block: 'nearest' });
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
// leitor de tela anuncia como o título da página nova. Voltando de uma
// categoria (deCategoria), o foco volta para o quadrado dela.
export function abrirProfessor(id, { deCategoria = null } = {}) {
  return abrir(id, { focarTitulo: true, deCategoria });
}

// Admin cria categorias, como quem cadastra professor no Sistema de Presença.
export function permitirNovaCategoria(permitido) {
  podeCriar = permitido;
  els.novaCategoria.hidden = !(podeCriar && professor);
  if (!permitido) fecharNovaCategoria();
  // O texto da tela vazia depende de quem pode criar.
  if (professor && state.categorias?.length === 0) mostrarEstado(estadoSemCategorias());
}

// Categoria recém-criada: entra no fim da lista, com foco.
export function adicionarCategoria(categoria) {
  state.categorias = [...(state.categorias ?? []), categoria];
  desenharCategorias();
  const cartao = document.getElementById(`categoria-${categoria.id}`);
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
  state.categorias = null;
  els.grade.innerHTML = '';
  els.estado.hidden = true;
  els.cursos.innerHTML = '';
  els.aviso.textContent = '';
  els.novaCategoria.hidden = true;
}

// ---------- Dados ----------

async function abrir(id, { focarTitulo = false, deCategoria = null } = {}) {
  const minha = ++abertura;
  professorId = id;
  professor = null;
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
  if (focarTitulo && !(professor && deCategoria && focarCategoria(deCategoria))) {
    els.nome.focus({ preventScroll: true });
  }
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

// Devolve { ok, mudou } ou { ok: false, erro }. A página de uma categoria
// também usa, quando é aberta direto pelo endereço.
export function carregarCategorias() {
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

  // Redesenhar não tira o foco de quem estava num quadrado.
  const focado = els.grade.contains(document.activeElement)
    ? document.activeElement.closest('.cartao[data-id]')?.dataset.id
    : null;
  els.estado.hidden = true;
  els.grade.hidden = false;
  els.grade.innerHTML = lista.map(cartaoHtml).join('');
  if (focado) document.getElementById(`categoria-${focado}`)?.focus({ preventScroll: true });
}

// A seta (›) só aparece no celular, quando o quadrado vira uma linha: é o
// indicador de "abre outra página" das listas do iOS.
function cartaoHtml(categoria) {
  const id = String(categoria.id);
  return `
    <li>
      <a class="cartao" href="${escapeHtml(enderecoDaCategoria(professorId, id))}" id="categoria-${escapeHtml(id)}" data-id="${escapeHtml(id)}">
        <span class="cartao__icone" aria-hidden="true"><svg class="icone"><use href="#${simboloDoIcone(categoria.icone)}"/></svg></span>
        <svg class="icone cartao__seta" aria-hidden="true"><use href="#i-seta-direita"/></svg>
        <div class="cartao__info">
          <p class="cartao__nome">${escapeHtml(categoria.nome)}</p>
        </div>
      </a>
    </li>`;
}

function mostrarEsqueleto() {
  els.secao.hidden = false;
  els.estado.hidden = true;
  els.grade.hidden = false;
  els.grade.setAttribute('aria-busy', 'true');
  els.grade.innerHTML = `
    <li aria-hidden="true">
      <div class="cartao cartao--esqueleto">
        <span class="cartao__icone"></span>
        <div class="cartao__info"><span class="linha-esqueleto l1"></span></div>
      </div>
    </li>`.repeat(2);
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

// Ao voltar de uma categoria, o foco (e o olhar) volta para o quadrado de
// onde a pessoa saiu, com o mesmo realce do Alinhamento.
function focarCategoria(id) {
  const cartao = document.getElementById(`categoria-${id}`);
  if (!cartao) return false;
  cartao.focus({ preventScroll: true });
  cartao.scrollIntoView({ block: 'nearest' });
  realcar(cartao);
  return true;
}
