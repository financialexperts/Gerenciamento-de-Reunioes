import { state } from '../../state/store.js';
import { buscarReunioes, faltaTabelaDeReunioes } from '../../../backend/api/reunioesRepo.js';
import { fimDaReuniao, linkDaChamada, separarReunioes, situacaoDaReuniao } from '../../../backend/domain/reunioes.js';
import { escapeHtml, movimentoReduzido } from '../../shared/dom.js';
import { estadoHtml } from '../../shared/estado.js';
import { carregarAlinhamento, esperarAlinhamento, professorPorId } from '../alinhamento/alinhamentoView.js';
import { carregarCategorias } from '../professores/professorView.js';
import { abrirNovaReuniao } from './novaReuniao.js';
import { diaDaSemana, diaPorExtenso, diasAte, duracaoPorExtenso, folhaDaData, hora, quandoPorExtenso } from './datas.js';

// Página de uma categoria de um professor ("?professor=<id>&categoria=<id>"):
// as reuniões dele nessa categoria, cada uma com o dia em destaque numa
// folha de calendário — primeiro as próximas, depois as que já aconteceram.
// Admin cria reuniões em "Nova reunião".

const els = {};
let professorId = null;
let categoriaId = null;
let professor = null;   // item da lista de professores (nome, e-mail)
let categoria = null;   // { id, nome, icone }
let reunioes = null;    // null = ainda não chegaram (ou não deu para carregar)
let abertura = 0;       // muda a cada abertura: descarta o que chegar de uma anterior
let podeCriar = false;

const ESTADOS = {
  professorNaoEncontrado: {
    icone: 'i-pessoas',
    titulo: 'Professor não encontrado',
    texto: 'O cadastro pode ter sido removido, ou sua conta não tem acesso a ele.',
    acao: ['voltar-lista', 'Voltar para Alinhamento'],
  },
  categoriaNaoEncontrada: {
    icone: 'i-grade',
    titulo: 'Categoria não encontrada',
    texto: 'Ela pode ter sido removida do banco de dados.',
    acao: ['voltar', 'Voltar para o professor'],
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
    titulo: `Nenhuma reunião de ${categoria.nome} ainda`,
    texto: podeCriar
      ? 'Crie a primeira em “Nova reunião”. Pode ser uma reunião marcada para frente ou uma que já aconteceu.'
      : 'As reuniões são marcadas por quem administra o sistema.',
    acao: podeCriar ? ['nova-reuniao', 'Nova reunião'] : null,
  };
}

export function iniciarReunioes({ aoVoltar, aoVoltarParaLista }) {
  els.titulo = document.getElementById('titulo-categoria');
  els.subtitulo = document.getElementById('subtitulo-categoria');
  els.voltar = document.getElementById('btn-voltar-professor');
  els.novaReuniao = document.getElementById('btn-nova-reuniao');
  els.lista = document.getElementById('lista-reunioes');
  els.estado = document.getElementById('estado-reunioes');
  els.aviso = document.getElementById('aviso-reunioes');

  els.voltar.addEventListener('click', aoVoltar);
  els.novaReuniao.addEventListener('click', abrirDialogo);
  els.estado.addEventListener('click', evento => {
    const acao = evento.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'voltar') aoVoltar();
    if (acao === 'voltar-lista') aoVoltarParaLista();
    if (acao === 'nova-reuniao') abrirDialogo();
    if (acao === 'recarregar') abrir(professorId, categoriaId);
    if (acao === 'recarregar-tudo') {
      carregarAlinhamento();
      abrir(professorId, categoriaId);
    }
  });
}

// Chamada a cada vez que a página aparece (clique numa categoria,
// Voltar/Avançar do navegador ou endereço aberto direto). O foco vai para o
// nome da categoria, que o leitor de tela anuncia como o título da página.
export function abrirReunioes(idProfessor, idCategoria) {
  return abrir(idProfessor, idCategoria, { focarTitulo: true });
}

// Criar reunião é coisa de admin, como criar categoria.
export function permitirNovaReuniao(permitido) {
  podeCriar = permitido;
  atualizarBotao();
  // O texto da tela vazia depende de quem pode criar.
  if (reunioes?.length === 0) mostrarEstado(estadoSemReunioes());
}

// Reunião recém-criada: entra no grupo certo (próximas ou já aconteceram),
// à vista e com um realce que se apaga.
export function adicionarReuniao(reuniao) {
  const daqui = String(reuniao.professor_id) === professorId && String(reuniao.categoria_id) === categoriaId;
  if (!reunioes || !daqui) return;
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

// Ao sair da conta: esquece a página aberta.
export function limparReunioes() {
  abertura++;
  professorId = null;
  categoriaId = null;
  professor = null;
  categoria = null;
  reunioes = null;
  els.lista.innerHTML = '';
  els.estado.hidden = true;
  els.aviso.textContent = '';
  atualizarBotao();
}

// ---------- Dados ----------

async function abrir(idProfessor, idCategoria, { focarTitulo = false } = {}) {
  const minha = ++abertura;
  professorId = idProfessor;
  categoriaId = idCategoria;
  professor = null;
  reunioes = null;
  // Com as categorias na memória (vindo da página do professor), o nome
  // aparece na hora.
  categoria = acharCategoria();
  els.aviso.textContent = '';
  desenharCabecalho(true);
  mostrarEsqueleto();

  // As três cargas andam juntas; a página espera professor e categoria
  // antes de mostrar as reuniões.
  const cargaReunioes = buscarReunioes(idProfessor, idCategoria)
    .then(lista => ({ ok: true, lista }), erro => ({ ok: false, erro }));
  const cargaCategorias = state.categorias ? null : carregarCategorias();

  const listaOk = await esperarAlinhamento();
  if (cargaCategorias) await cargaCategorias;
  if (minha !== abertura) return;
  professor = listaOk ? professorPorId(idProfessor) : null;
  categoria = acharCategoria();
  desenharCabecalho(false);
  if (focarTitulo) els.titulo.focus({ preventScroll: true });

  if (!listaOk) return mostrarEstado(ESTADOS.erroProfessor);
  if (!professor) return mostrarEstado(ESTADOS.professorNaoEncontrado);
  if (!state.categorias) return mostrarEstado({ ...ESTADOS.erroReunioes, titulo: 'Não foi possível carregar a categoria' });
  if (!categoria) return mostrarEstado(ESTADOS.categoriaNaoEncontrada);

  const resultado = await cargaReunioes;
  if (minha !== abertura) return;
  if (!resultado.ok) {
    console.error('Erro ao carregar as reuniões:', resultado.erro);
    return mostrarEstado(faltaTabelaDeReunioes(resultado.erro) ? ESTADOS.semTabela : ESTADOS.erroReunioes);
  }
  reunioes = resultado.lista;
  atualizarBotao();
  desenharReunioes();
}

function acharCategoria() {
  return state.categorias?.find(c => String(c.id) === categoriaId) ?? null;
}

// O id como veio do banco (número ou uuid, conforme a tabela professores),
// para gravar com o mesmo tipo.
function idOriginalDoProfessor() {
  return state.professores.find(p => String(p.id) === professorId)?.id ?? professorId;
}

function abrirDialogo() {
  if (!podeCriar || !professor || !categoria || !reunioes) return;
  abrirNovaReuniao({
    professorId: idOriginalDoProfessor(),
    professorNome: professor.nome,
    categoria,
    reunioes,
  });
}

// ---------- Desenho ----------

function desenharCabecalho(carregando) {
  els.titulo.textContent = categoria?.nome ?? 'Categoria';
  els.titulo.title = categoria?.nome ?? ''; // nome longo cortado com "…"
  els.subtitulo.textContent = professor ? `Reuniões com ${professor.nome}` : carregando ? 'Carregando…' : '';
  const voltarPara = professor ? `Voltar para ${professor.nome}` : 'Voltar para o professor';
  els.voltar.setAttribute('aria-label', voltarPara);
  els.voltar.title = voltarPara;
  document.title = professor && categoria
    ? `${categoria.nome} · ${professor.nome} – Gestão de Reuniões`
    : 'Gestão de Reuniões';
  atualizarBotao();
}

// Só aparece com as reuniões carregadas: sem a tabela, criar daria erro.
function atualizarBotao() {
  els.novaReuniao.hidden = !(podeCriar && reunioes && categoria);
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
        ? `<ul class="grade-reunioes" role="list">${lista.map(r => reuniaoHtml(r, agora)).join('')}</ul>`
        : `<p class="grupo-reunioes__vazio">${escapeHtml(vazio)}</p>`}
    </section>`;
}

function reuniaoHtml(reuniao, agora) {
  const inicio = new Date(reuniao.inicio);
  const situacao = situacaoDaReuniao(reuniao, agora);
  const hoje = diasAte(inicio, agora) === 0;
  const quando = situacao === 'agora' ? 'Agora' : quandoPorExtenso(inicio, agora);
  const dia = `${diaDaSemana(inicio)}, ${diaPorExtenso(inicio, { agora })}`;
  const horario = `${hora(inicio)} às ${hora(fimDaReuniao(reuniao))} · ${duracaoPorExtenso(reuniao.duracao_min)}`;
  const online = reuniao.formato === 'online';

  return `
    <li class="reuniao" id="reuniao-${escapeHtml(reuniao.id)}" data-situacao="${situacao}"${hoje ? ' data-hoje' : ''}>
      ${folhaHtml(inicio)}
      <div class="reuniao__info">
        <div class="reuniao__topo">
          <h3 class="reuniao__dia">${escapeHtml(dia)}</h3>
          <span class="reuniao__quando">${escapeHtml(quando)}</span>
        </div>
        <p class="reuniao__linha reuniao__linha--hora">
          <svg class="icone" aria-hidden="true"><use href="#c-relogio"/></svg>
          <span>${escapeHtml(horario)}</span>
        </p>
        <p class="reuniao__linha">
          <svg class="icone" aria-hidden="true"><use href="#${online ? 'i-video' : 'i-pino'}"/></svg>
          <span>${online ? 'Online' : 'Presencial'}${localHtml(reuniao.local, online)}</span>
        </p>
        ${reuniao.pauta ? `<p class="reuniao__pauta">${escapeHtml(reuniao.pauta)}</p>` : ''}
      </div>
    </li>`;
}

// A folha de calendário: mês em vermelho, o dia grande e o dia da semana.
// O leitor de tela lê o dia por extenso no título da reunião.
function folhaHtml(data) {
  const folha = folhaDaData(data);
  return `
    <span class="folha-data" aria-hidden="true">
      <span class="folha-data__mes">${escapeHtml(folha.mes)}</span>
      <span class="folha-data__dia">${escapeHtml(folha.dia)}</span>
      <span class="folha-data__semana">${escapeHtml(folha.semana)}</span>
    </span>`;
}

// Sala, ou o link da chamada (só http/https vira link clicável).
function localHtml(local, online) {
  if (!local) return '';
  const link = online ? linkDaChamada(local) : null;
  if (!link) return ` · ${escapeHtml(local)}`;
  return ` · <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(local)}</a>`;
}

function mostrarEsqueleto() {
  els.estado.hidden = true;
  els.lista.hidden = false;
  els.lista.setAttribute('aria-busy', 'true');
  els.lista.innerHTML = `
    <ul class="grade-reunioes" aria-hidden="true">${`
      <li class="reuniao reuniao--esqueleto">
        <span class="folha-data"></span>
        <div class="reuniao__info">
          <span class="linha-esqueleto l1"></span>
          <span class="linha-esqueleto l2"></span>
        </div>
      </li>`.repeat(3)}
    </ul>`;
}

function mostrarEstado(estado) {
  els.lista.hidden = true;
  els.lista.innerHTML = '';
  els.lista.removeAttribute('aria-busy');
  els.estado.innerHTML = estadoHtml(estado);
  els.estado.hidden = false;
}
