import { state } from '../../state/store.js';
import { buscarResumosDoProfessor } from '../../../backend/api/anotacoesRepo.js';
import { buscarReunioes, faltaTabelaDeReunioes } from '../../../backend/api/reunioesRepo.js';
import { separarReunioes, situacaoDaReuniao } from '../../../backend/domain/reunioes.js';
import { chaveCorCurso } from '../../../backend/domain/turmas.js';
import { escapeHtml, esperar, movimentoReduzido, realcar } from '../../shared/dom.js';
import { estadoHtml } from '../../shared/estado.js';
import { carregarAlinhamento, esperarAlinhamento, professorPorId } from '../alinhamento/alinhamentoView.js';
import { enderecoDaReuniao } from '../app/rotas.js';
import { carregarCategorias } from '../categorias/categorias.js';
import { previasHtml, reuniaoEsqueletoHtml, reuniaoHtml } from '../reunioes/cartaoReuniao.js';
import { diaDaSemana, diaPorExtenso, hora } from '../reunioes/datas.js';
import { abrirNovaReuniao } from '../reunioes/novaReuniao.js';

// Página de um professor ("?professor=<id>"): quem é (nome, e-mail e
// cursos) e as reuniões com ele, cada uma com o dia em destaque numa folha
// de calendário — primeiro as próximas, depois as que já aconteceram. Cada
// reunião tem dentro todas as categorias (Feedback, Atualização de
// aulas…): para admin, o cartão mostra o começo das anotações de cada uma
// e abre a página da reunião. Admin marca reuniões em "Nova reunião".

const els = {};
let professorId = null;
let professor = null;   // item da lista (nome, e-mail, cursos) aberto agora
let reunioes = null;    // null = ainda não chegaram (ou não deu para carregar)
let resumos = null;     // Map id da reunião → Map id da categoria → começo das anotações; null = não deu para saber
let abertura = 0;       // muda a cada abertura: descarta o que chegar de uma anterior
let podeCriar = false;
let podeAnotar = false;

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
  erroReunioes: {
    icone: 'i-sem-conexao',
    titulo: 'Não foi possível carregar as reuniões',
    texto: 'Verifique a conexão com a internet e tente de novo.',
    acao: ['recarregar', 'Tentar de novo'],
  },
  semTabela: {
    icone: 'i-alerta',
    titulo: 'Reuniões ainda não configuradas',
    texto: 'Falta criar a tabela de reuniões no banco de dados: rode o arquivo sql/reunioes.sql no SQL Editor do Supabase.',
    acao: ['recarregar', 'Tentar de novo'],
  },
};

function estadoSemReunioes() {
  return {
    icone: 'c-calendario',
    titulo: 'Nenhuma reunião ainda',
    texto: podeCriar
      ? 'Crie a primeira em “Nova reunião”. Pode ser uma reunião marcada para frente ou uma que já aconteceu.'
      : 'As reuniões são marcadas por quem administra o sistema.',
    acao: podeCriar ? ['nova-reuniao', 'Nova reunião'] : null,
  };
}

export function iniciarProfessor({ aoVoltar, aoAbrirReuniao }) {
  els.nome = document.getElementById('professor-nome');
  els.email = document.getElementById('professor-email');
  els.cursos = document.getElementById('professor-cursos');
  els.novaReuniao = document.getElementById('btn-nova-reuniao');
  els.lista = document.getElementById('lista-reunioes');
  els.estado = document.getElementById('estado-reunioes');
  els.aviso = document.getElementById('aviso-reunioes');

  document.getElementById('btn-voltar').addEventListener('click', aoVoltar);
  els.novaReuniao.addEventListener('click', abrirDialogo);
  // O cartão de cada reunião é um link para a página dela. Clique simples
  // abre aqui mesmo; Ctrl/⌘ ou o botão do meio abrem em outra aba.
  els.lista.addEventListener('click', evento => {
    const link = evento.target.closest('.reuniao__abrir');
    if (!link || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    evento.preventDefault();
    aoAbrirReuniao(professorId, link.dataset.id);
  });
  els.estado.addEventListener('click', evento => {
    const acao = evento.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'voltar') aoVoltar();
    if (acao === 'nova-reuniao') abrirDialogo();
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
// reunião (deReuniao), o foco volta para o cartão dela, e o começo das
// anotações espera o salvamento delas (salvando) para já vir atualizado.
export function abrirProfessor(id, { deReuniao = null, salvando = null } = {}) {
  return abrir(id, { focarTitulo: true, deReuniao, salvando });
}

// Criar reunião é coisa de admin, como cadastrar professor.
export function permitirNovaReuniao(permitido) {
  podeCriar = permitido;
  atualizarBotao();
  // O texto da tela vazia depende de quem pode criar.
  if (reunioes?.length === 0) mostrarEstado(estadoSemReunioes());
}

// Anotações também: só admin vê o começo delas e abre a página da reunião.
export function permitirAnotacoes(permitido) {
  if (podeAnotar === permitido) return;
  podeAnotar = permitido;
  if (reunioes?.length) desenharReunioes();
}

// Reunião recém-criada: entra no grupo certo (próximas ou já aconteceram),
// à vista e com um realce que se apaga.
export function adicionarReuniao(reuniao) {
  if (!reunioes || String(reuniao.professor_id) !== professorId) return;
  reunioes = [...reunioes, reuniao];
  desenharReunioes();

  const item = document.getElementById(`reuniao-${reuniao.id}`);
  if (item) {
    item.classList.add('reuniao--nova');
    item.addEventListener('animationend', evento => {
      if (evento.animationName === 'realce') item.classList.remove('reuniao--nova');
    });
    item.scrollIntoView({ block: 'nearest', behavior: movimentoReduzido() ? 'auto' : 'smooth' });
  }
  const inicio = new Date(reuniao.inicio);
  const passada = situacaoDaReuniao(reuniao) === 'passada';
  els.aviso.textContent = `Reunião de ${diaDaSemana(inicio).toLowerCase()}, ${diaPorExtenso(inicio)}, às ${hora(inicio)} criada`
    + (passada ? ', em “Já aconteceram”.' : '.');
}

// Ao sair da conta: esquece o professor aberto e as reuniões dele.
export function limparProfessor() {
  abertura++;
  professorId = null;
  professor = null;
  reunioes = null;
  resumos = null;
  els.lista.innerHTML = '';
  els.estado.hidden = true;
  els.cursos.innerHTML = '';
  els.aviso.textContent = '';
  atualizarBotao();
}

// ---------- Dados ----------

async function abrir(id, { focarTitulo = false, deReuniao = null, salvando = null } = {}) {
  const minha = ++abertura;
  professorId = id;
  professor = null;
  reunioes = null;
  resumos = null;
  els.aviso.textContent = '';
  desenharCabecalho('carregando');
  mostrarEsqueleto();

  // As cargas andam juntas; a página espera o professor antes de mostrar
  // as reuniões.
  const cargaReunioes = buscarReunioes(id).then(lista => ({ ok: true, lista }), erro => ({ ok: false, erro }));
  // O começo das anotações é um extra: se não vier (sem conexão, banco
  // ainda não atualizado), os cartões só não mostram as categorias.
  const cargaResumos = Promise.race([salvando, esperar(3000)])
    .then(() => buscarResumosDoProfessor(id))
    .catch(erro => {
      console.warn('Resumo das anotações indisponível:', erro);
      return null;
    });
  // As categorias são conferidas a cada abertura: uma criada por outra
  // pessoa já aparece nos cartões.
  const cargaCategorias = carregarCategorias();

  const listaOk = await esperarAlinhamento();
  if (minha !== abertura) return;
  professor = listaOk ? professorPorId(id) : null;
  desenharCabecalho(!listaOk ? 'erro' : professor ? 'pronto' : 'nao-encontrado');
  if (focarTitulo) els.nome.focus({ preventScroll: true });
  if (!listaOk) return mostrarEstado(ESTADOS.erroProfessor);
  if (!professor) return mostrarEstado(ESTADOS.naoEncontrado);

  const resultado = await cargaReunioes;
  if (minha !== abertura) return;
  if (!resultado.ok) {
    console.error('Erro ao carregar as reuniões:', resultado.erro);
    return mostrarEstado(faltaTabelaDeReunioes(resultado.erro) ? ESTADOS.semTabela : ESTADOS.erroReunioes);
  }
  const [listaDeResumos] = await Promise.all([cargaResumos, cargaCategorias]);
  if (minha !== abertura) return;
  reunioes = resultado.lista;
  resumos = listaDeResumos;
  atualizarBotao();
  desenharReunioes();
  if (deReuniao) focarReuniao(deReuniao);
}

// O id como veio do banco (número ou uuid, conforme a tabela professores),
// para gravar com o mesmo tipo.
function idOriginalDoProfessor() {
  return state.professores.find(p => String(p.id) === professorId)?.id ?? professorId;
}

function abrirDialogo() {
  if (!podeCriar || !professor || !reunioes) return;
  abrirNovaReuniao({
    professorId: idOriginalDoProfessor(),
    professorNome: professor.nome,
    reunioes,
  });
}

// Ao voltar de uma reunião, o foco (e o olhar) volta para o cartão de onde
// a pessoa saiu, com o mesmo realce das grades.
function focarReuniao(id) {
  const item = document.getElementById(`reuniao-${id}`);
  if (!item) return;
  item.querySelector('.reuniao__abrir')?.focus({ preventScroll: true });
  item.scrollIntoView({ block: 'nearest' });
  realcar(item);
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
  document.title = pronto ? `${professor.nome} – Gestão de Reuniões` : 'Gestão de Reuniões';
  atualizarBotao();
}

function cursosHtml(cursos) {
  if (!cursos.length) return '<li class="cabecalho__sem-cursos">Sem turmas ativas</li>';
  return cursos.map(curso => `
    <li class="chip" data-cor="${chaveCorCurso(curso)}" title="${escapeHtml(curso)}"><span>${escapeHtml(curso)}</span></li>`).join('');
}

// Só aparece com as reuniões carregadas: sem a tabela, criar daria erro.
function atualizarBotao() {
  els.novaReuniao.hidden = !(podeCriar && professor && reunioes);
}

function desenharReunioes() {
  els.lista.removeAttribute('aria-busy');
  if (!reunioes.length) return mostrarEstado(estadoSemReunioes());

  const agora = new Date();
  const { proximas, anteriores } = separarReunioes(reunioes, agora);
  els.estado.hidden = true;
  els.lista.hidden = false;
  els.lista.innerHTML = grupoHtml({
    chave: 'proximas',
    titulo: 'Próximas',
    lista: proximas,
    agora,
    vazio: 'Nenhuma reunião marcada daqui para frente.',
  }) + grupoHtml({ chave: 'anteriores', titulo: 'Já aconteceram', lista: anteriores, agora });
}

// "Próximas" aparece sempre (vazia, avisa que não há nada marcado);
// "Já aconteceram" só quando tem alguma.
function grupoHtml({ chave, titulo, lista, agora, vazio }) {
  if (!lista.length && !vazio) return '';
  const quantas = lista.length === 1 ? '1 reunião' : `${lista.length} reuniões`;
  return `
    <section class="grupo-reunioes" aria-labelledby="titulo-${chave}">
      <div class="secao">
        <h2 class="secao__titulo" id="titulo-${chave}">${titulo}</h2>
        ${lista.length ? `<p class="secao__descricao">${quantas}</p>` : ''}
      </div>
      ${lista.length
        ? `<ul class="grade-reunioes" role="list">${lista.map(r => cartaoHtml(r, agora)).join('')}</ul>`
        : `<p class="grupo-reunioes__vazio">${escapeHtml(vazio)}</p>`}
    </section>`;
}

// Para admin, o cartão abre a página da reunião e mostra embaixo o começo
// das anotações de cada categoria.
function cartaoHtml(reuniao, agora) {
  return reuniaoHtml(reuniao, {
    agora,
    idElemento: `reuniao-${reuniao.id}`,
    href: podeAnotar ? enderecoDaReuniao(professorId, reuniao.id) : null,
    previas: podeAnotar && resumos ? previasHtml(state.categorias, resumos.get(String(reuniao.id))) : '',
  });
}

function mostrarEsqueleto() {
  els.estado.hidden = true;
  els.lista.hidden = false;
  els.lista.setAttribute('aria-busy', 'true');
  els.lista.innerHTML = `<ul class="grade-reunioes" aria-hidden="true">${reuniaoEsqueletoHtml().repeat(3)}</ul>`;
}

function mostrarEstado(estado) {
  els.lista.hidden = true;
  els.lista.innerHTML = '';
  els.lista.removeAttribute('aria-busy');
  els.estado.innerHTML = estadoHtml(estado);
  els.estado.hidden = false;
}
