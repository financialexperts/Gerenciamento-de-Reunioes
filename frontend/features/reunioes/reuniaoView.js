import { state } from '../../state/store.js';
import { buscarResumosDaReuniao, faltaAtualizarBanco } from '../../../backend/api/anotacoesRepo.js';
import { faltaTabelaDeCategorias } from '../../../backend/api/categoriasRepo.js';
import { buscarReuniao, faltaTabelaDeReunioes } from '../../../backend/api/reunioesRepo.js';
import { escapeHtml, esperar, movimentoReduzido, normalizar, realcar } from '../../shared/dom.js';
import { estadoHtml } from '../../shared/estado.js';
import { criarTecladoDaGrade } from '../../shared/grade.js';
import { carregarAlinhamento, esperarAlinhamento, professorPorId } from '../alinhamento/alinhamentoView.js';
import { enderecoDasAnotacoes } from '../app/rotas.js';
import { carregarCategorias, incluirCategoria } from '../categorias/categorias.js';
import { simboloDoIcone } from '../categorias/icones.js';
import { abrirNovaCategoria, fecharNovaCategoria } from '../categorias/novaCategoria.js';
import { reuniaoEsqueletoHtml, reuniaoHtml } from './cartaoReuniao.js';
import { diaPorExtenso } from './datas.js';

// Página de uma reunião ("?professor=<id>&reuniao=<id>"): o cartão da
// reunião (dia, horário, local e pauta) e, embaixo, as categorias
// (Feedback, Atualização de aulas…) em quadrados, cada um com o começo das
// anotações daquela categoria nesta reunião. As categorias são uma lista
// só, a mesma dentro de todas as reuniões; cada quadrado abre a página de
// anotações da categoria. Só admin vê as anotações (o RLS delas garante) e
// cria categorias.

const els = {};
let professorId = null;
let reuniaoId = null;
let professor = null;   // item da lista de professores (nome, e-mail)
let reuniao = null;     // a reunião aberta; null = ainda não chegou (ou não deu para carregar)
let resumos = null;     // Map id da categoria → começo das anotações; null = não deu para saber
let abertura = 0;       // muda a cada abertura: descarta o que chegar de uma anterior
let podeCriar = false;
let categoriasNaTela = false; // as categorias (ou o aviso de nenhuma ainda) estão à mostra

const ESTADOS = {
  professorNaoEncontrado: {
    icone: 'i-pessoas',
    titulo: 'Professor não encontrado',
    texto: 'O cadastro pode ter sido removido, ou sua conta não tem acesso a ele.',
    acao: ['voltar-lista', 'Voltar para Alinhamento'],
  },
  reuniaoNaoEncontrada: {
    icone: 'c-calendario',
    titulo: 'Reunião não encontrada',
    texto: 'Ela pode ter sido removida do banco de dados.',
    acao: ['voltar', 'Voltar para o professor'],
  },
  erroProfessor: {
    icone: 'i-sem-conexao',
    titulo: 'Não foi possível carregar a reunião',
    texto: 'Verifique a conexão com a internet e tente de novo.',
    acao: ['recarregar-tudo', 'Tentar de novo'],
  },
  erroReuniao: {
    icone: 'i-sem-conexao',
    titulo: 'Não foi possível carregar a reunião',
    texto: 'Verifique a conexão com a internet e tente de novo.',
    acao: ['recarregar', 'Tentar de novo'],
  },
  semTabela: {
    icone: 'i-alerta',
    titulo: 'Reuniões ainda não configuradas',
    texto: 'Falta criar a tabela de reuniões no banco de dados: rode o arquivo sql/reunioes.sql no SQL Editor do Supabase.',
    acao: ['recarregar', 'Tentar de novo'],
  },
  semAcesso: {
    icone: 'i-documento',
    titulo: 'Anotações só para administradores',
    texto: 'As anotações das reuniões são de quem as conduz. Sua conta não tem acesso a elas.',
    acao: ['voltar', 'Voltar para o professor'],
  },
  erroCategorias: {
    icone: 'i-sem-conexao',
    titulo: 'Não foi possível carregar as categorias',
    texto: 'Verifique a conexão com a internet e tente de novo.',
    acao: ['recarregar', 'Tentar de novo'],
  },
  semTabelaCategorias: {
    icone: 'i-alerta',
    titulo: 'Categorias ainda não configuradas',
    texto: 'Falta criar a tabela de categorias no banco de dados: rode o arquivo sql/categorias_reuniao.sql no SQL Editor do Supabase.',
    acao: ['recarregar', 'Tentar de novo'],
  },
  bancoDesatualizado: {
    icone: 'i-alerta',
    titulo: 'Banco de dados desatualizado',
    texto: 'As anotações ainda estão na estrutura antiga, com uma categoria por reunião. Rode no SQL Editor do Supabase o SQL que separa as anotações por categoria dentro de cada reunião.',
    acao: ['recarregar', 'Tentar de novo'],
  },
};

function estadoSemCategorias() {
  return {
    icone: 'i-grade',
    titulo: 'Nenhuma categoria ainda',
    texto: podeCriar
      ? 'Crie a primeira em “Nova categoria”. Ela aparece em todas as reuniões, de todos os professores.'
      : 'As categorias de anotações são criadas por quem administra o sistema.',
    acao: podeCriar ? ['nova-categoria', 'Nova categoria'] : null,
  };
}

export function iniciarReuniao({ aoVoltar, aoVoltarParaLista, aoAbrirAnotacoes }) {
  els.titulo = document.getElementById('titulo-reuniao');
  els.subtitulo = document.getElementById('subtitulo-reuniao');
  els.voltar = document.getElementById('btn-voltar-professor');
  els.novaCategoria = document.getElementById('btn-nova-categoria');
  els.detalhes = document.getElementById('detalhes-reuniao');
  els.secao = document.getElementById('secao-categorias');
  els.grade = document.getElementById('lista-categorias');
  els.estado = document.getElementById('estado-reuniao');
  els.aviso = document.getElementById('aviso-reuniao');

  els.voltar.addEventListener('click', aoVoltar);
  els.novaCategoria.addEventListener('click', abrirNovaCategoria);

  // Cada quadrado é um link para as anotações da categoria. Clique simples
  // abre aqui mesmo; Ctrl/⌘ ou o botão do meio abrem em outra aba.
  els.grade.addEventListener('click', evento => {
    const cartao = evento.target.closest('.cartao[data-id]');
    if (!cartao || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    evento.preventDefault();
    aoAbrirAnotacoes(professorId, reuniaoId, cartao.dataset.id);
  });
  const teclado = criarTecladoDaGrade({
    grade: els.grade,
    seletor: '.cartao[data-id]',
    nomeDe: cartao => normalizar(cartao.querySelector('.cartao__nome')?.textContent),
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
    if (acao === 'voltar-lista') aoVoltarParaLista();
    if (acao === 'nova-categoria') abrirNovaCategoria();
    if (acao === 'recarregar') abrir(professorId, reuniaoId);
    if (acao === 'recarregar-tudo') {
      carregarAlinhamento();
      abrir(professorId, reuniaoId);
    }
  });
}

// Chamada a cada vez que a página aparece (clique numa reunião,
// Voltar/Avançar do navegador ou endereço aberto direto). O foco vai para
// o título, que o leitor de tela anuncia como o título da página. Voltando
// das anotações (deCategoria), o foco volta para o quadrado da categoria,
// e o começo das anotações espera o salvamento delas (salvando) para já
// vir atualizado.
export function abrirReuniao(idProfessor, idReuniao, { deCategoria = null, salvando = null } = {}) {
  return abrir(idProfessor, idReuniao, { focarTitulo: true, deCategoria, salvando });
}

// Admin cria categorias, como quem cadastra professor no Sistema de Presença.
export function permitirNovaCategoria(permitido) {
  podeCriar = permitido;
  atualizarBotao();
  if (!permitido) fecharNovaCategoria();
  // O texto da tela vazia depende de quem pode criar.
  if (categoriasNaTela && state.categorias?.length === 0) mostrarEstado(estadoSemCategorias(), { comDetalhes: true });
}

// Categoria recém-criada: entra no fim da lista, com foco.
export function adicionarCategoria(categoria) {
  incluirCategoria(categoria);
  if (!categoriasNaTela) return;
  desenharCategorias();
  const cartao = document.getElementById(`categoria-${categoria.id}`);
  if (!cartao) return;
  cartao.classList.add('cartao--novo');
  cartao.addEventListener('animationend', () => cartao.classList.remove('cartao--novo'), { once: true });
  cartao.focus({ preventScroll: true });
  cartao.scrollIntoView({ block: 'nearest', behavior: movimentoReduzido() ? 'auto' : 'smooth' });
  els.aviso.textContent = `Categoria “${categoria.nome}” criada. Ela aparece em todas as reuniões.`;
}

// Ao sair da conta: esquece a página aberta.
export function limparReuniao() {
  abertura++;
  professorId = null;
  reuniaoId = null;
  professor = null;
  reuniao = null;
  resumos = null;
  categoriasNaTela = false;
  els.detalhes.innerHTML = '';
  els.grade.innerHTML = '';
  els.estado.hidden = true;
  els.aviso.textContent = '';
  atualizarBotao();
}

// ---------- Dados ----------

async function abrir(idProfessor, idReuniao, { focarTitulo = false, deCategoria = null, salvando = null } = {}) {
  const minha = ++abertura;
  professorId = idProfessor;
  reuniaoId = idReuniao;
  professor = null;
  reuniao = null;
  resumos = null;
  categoriasNaTela = false;
  els.aviso.textContent = '';
  desenharCabecalho(true);
  mostrarEsqueleto();

  // As cargas andam juntas. As categorias são conferidas a cada abertura:
  // uma criada por outra pessoa já aparece aqui.
  const cargaReuniao = buscarReuniao(idReuniao)
    .then(encontrada => ({ ok: true, reuniao: encontrada }), erro => ({ ok: false, erro }));
  const cargaResumos = Promise.race([salvando, esperar(3000)])
    .then(() => buscarResumosDaReuniao(idReuniao))
    .then(mapa => ({ ok: true, resumos: mapa }), erro => ({ ok: false, erro }));
  const cargaCategorias = carregarCategorias();

  const listaOk = await esperarAlinhamento();
  if (minha !== abertura) return;
  professor = listaOk ? professorPorId(idProfessor) : null;
  if (!listaOk || !professor) {
    desenharCabecalho(false);
    if (focarTitulo) els.titulo.focus({ preventScroll: true });
    return mostrarEstado(listaOk ? ESTADOS.professorNaoEncontrado : ESTADOS.erroProfessor);
  }

  const r = await cargaReuniao;
  if (minha !== abertura) return;
  const daqui = r.ok && r.reuniao && String(r.reuniao.professor_id) === idProfessor;
  reuniao = daqui ? r.reuniao : null;
  desenharCabecalho(false);
  if (focarTitulo) els.titulo.focus({ preventScroll: true });
  if (!r.ok) {
    console.error('Erro ao carregar a reunião:', r.erro);
    return mostrarEstado(faltaTabelaDeReunioes(r.erro) ? ESTADOS.semTabela : ESTADOS.erroReuniao);
  }
  if (!reuniao) return mostrarEstado(ESTADOS.reuniaoNaoEncontrada);
  desenharDetalhes();
  if (!ehAdmin()) return mostrarEstado(ESTADOS.semAcesso, { comDetalhes: true });

  const [c, a] = await Promise.all([cargaCategorias, cargaResumos]);
  if (minha !== abertura) return;
  if (!a.ok && faltaAtualizarBanco(a.erro)) {
    console.error('Banco na estrutura antiga:', a.erro);
    return mostrarEstado(ESTADOS.bancoDesatualizado, { comDetalhes: true });
  }
  // O começo das anotações é um extra: sem ele (sem conexão, por exemplo),
  // os quadrados abrem as anotações do mesmo jeito.
  if (!a.ok) console.warn('Resumo das anotações indisponível:', a.erro);
  resumos = a.ok ? a.resumos : null;
  if (!c.ok && !state.categorias) {
    return mostrarEstado(faltaTabelaDeCategorias(c.erro) ? ESTADOS.semTabelaCategorias : ESTADOS.erroCategorias, { comDetalhes: true });
  }
  categoriasNaTela = true;
  atualizarBotao();
  desenharCategorias();
  if (deCategoria) focarCategoria(deCategoria);
}

function ehAdmin() {
  return state.professores.find(p => p.user_id === state.usuario?.id)?.papel === 'admin';
}

// Ao voltar das anotações, o foco (e o olhar) volta para o quadrado da
// categoria de onde a pessoa saiu, com o mesmo realce das outras grades.
function focarCategoria(id) {
  const cartao = document.getElementById(`categoria-${id}`);
  if (!cartao) return;
  cartao.focus({ preventScroll: true });
  cartao.scrollIntoView({ block: 'nearest' });
  realcar(cartao);
}

// ---------- Desenho ----------

function desenharCabecalho(carregando) {
  const dia = reuniao ? diaPorExtenso(new Date(reuniao.inicio)) : null;
  els.titulo.textContent = dia ? `Reunião de ${dia}` : 'Reunião';
  els.titulo.title = els.titulo.textContent; // título longo cortado com "…"
  els.subtitulo.textContent = professor ? `Com ${professor.nome}` : carregando ? 'Carregando…' : '';
  const voltarPara = professor ? `Voltar para ${professor.nome}` : 'Voltar para o professor';
  els.voltar.setAttribute('aria-label', voltarPara);
  els.voltar.title = voltarPara;
  document.title = dia && professor
    ? `Reunião de ${dia} · ${professor.nome} – Gestão de Reuniões`
    : 'Gestão de Reuniões';
  atualizarBotao();
}

// Só aparece com as categorias na tela: sem a tabela, criar daria erro.
function atualizarBotao() {
  els.novaCategoria.hidden = !(podeCriar && categoriasNaTela);
}

function desenharDetalhes() {
  els.detalhes.innerHTML = reuniaoHtml(reuniao, { tag: 'div', titulo: 'p' });
  els.detalhes.hidden = false;
}

function desenharCategorias() {
  const lista = state.categorias ?? [];
  els.grade.removeAttribute('aria-busy');
  if (!lista.length) return mostrarEstado(estadoSemCategorias(), { comDetalhes: true });

  // Redesenhar não tira o foco de quem estava num quadrado.
  const focado = els.grade.contains(document.activeElement)
    ? document.activeElement.closest('.cartao[data-id]')?.dataset.id
    : null;
  els.estado.hidden = true;
  els.secao.hidden = false;
  els.grade.hidden = false;
  els.grade.innerHTML = lista.map(cartaoHtml).join('');
  if (focado) document.getElementById(`categoria-${focado}`)?.focus({ preventScroll: true });
}

// O quadrado de uma categoria: ícone e nome no topo e, embaixo, o começo
// das anotações, como uma nota. A seta (›) só aparece no celular, quando o
// quadrado vira uma linha: é o indicador de "abre outra página" do iOS.
function cartaoHtml(categoria) {
  const id = String(categoria.id);
  const resumo = resumos?.get(id)?.trim();
  const previa = resumo
    ? `<p class="cartao__previa">${escapeHtml(resumo)}</p>`
    : `<p class="cartao__previa cartao__previa--vazia">${resumos ? 'Escrever anotações' : 'Abrir anotações'}</p>`;
  return `
    <li>
      <a class="cartao cartao--anotacoes" href="${escapeHtml(enderecoDasAnotacoes(professorId, reuniaoId, id))}" id="categoria-${escapeHtml(id)}" data-id="${escapeHtml(id)}">
        <div class="cartao__topo">
          <span class="cartao__icone" aria-hidden="true"><svg class="icone"><use href="#${simboloDoIcone(categoria.icone)}"/></svg></span>
          <p class="cartao__nome">${escapeHtml(categoria.nome)}</p>
        </div>
        ${previa}
        <svg class="icone cartao__seta" aria-hidden="true"><use href="#i-seta-direita"/></svg>
      </a>
    </li>`;
}

function mostrarEsqueleto() {
  els.estado.hidden = true;
  els.detalhes.hidden = false;
  els.detalhes.innerHTML = reuniaoEsqueletoHtml('div');
  els.secao.hidden = false;
  els.grade.hidden = false;
  els.grade.setAttribute('aria-busy', 'true');
  els.grade.innerHTML = `
    <li aria-hidden="true">
      <div class="cartao cartao--anotacoes cartao--esqueleto">
        <div class="cartao__topo">
          <span class="cartao__icone"></span>
          <span class="linha-esqueleto l1"></span>
        </div>
        <span class="linha-esqueleto l2"></span>
        <span class="linha-esqueleto l2"></span>
      </div>
    </li>`.repeat(2);
}

// comDetalhes: o problema é com as anotações, não com a reunião, então o
// cartão dela continua no topo.
function mostrarEstado(estado, { comDetalhes = false } = {}) {
  if (!comDetalhes) {
    els.detalhes.hidden = true;
    els.detalhes.innerHTML = '';
  }
  els.secao.hidden = true;
  els.grade.hidden = true;
  els.grade.innerHTML = '';
  els.grade.removeAttribute('aria-busy');
  els.estado.innerHTML = estadoHtml(estado);
  els.estado.hidden = false;
}
