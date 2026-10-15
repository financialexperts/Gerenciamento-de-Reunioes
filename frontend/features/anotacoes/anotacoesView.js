import { state } from '../../state/store.js';
import {
  buscarAnotacoes, faltaAtualizarBanco, faltaTabelaDeAnotacoes, salvarAnotacoes,
} from '../../../backend/api/anotacoesRepo.js';
import { faltaTabelaDeCategorias } from '../../../backend/api/categoriasRepo.js';
import { buscarReuniao, faltaTabelaDeReunioes } from '../../../backend/api/reunioesRepo.js';
import { fimDaReuniao } from '../../../backend/domain/reunioes.js';
import { estadoHtml } from '../../shared/estado.js';
import { carregarAlinhamento, esperarAlinhamento, professorPorId } from '../alinhamento/alinhamentoView.js';
import { carregarCategorias, categoriaPorId } from '../categorias/categorias.js';
import { diaDaSemana, diaPorExtenso, hora } from '../reunioes/datas.js';
import { conteudo, definirConteudo, editavel, focarNoComeco, iniciarEditor, resumo } from './editor.js';
import {
  abrirPainelLink, atualizarBarra, fecharMenus, iniciarBarra, mostrarBarra, mostrarCursor, prepararFontes,
} from './barraFormatacao.js';

// Página de anotações de uma categoria dentro de uma reunião
// ("?professor=…&reuniao=…&categoria=…"): uma folha em branco, como no
// Google Docs, com a barra de formatação. Cada categoria de cada reunião
// tem a sua folha. Salva sozinha logo depois de cada pausa na escrita.
// Enquanto não salva (sem internet, por exemplo), o texto fica guardado
// neste aparelho e é recuperado ao abrir a mesma folha de novo. Só
// administradores fazem anotações (o RLS de sql/anotacoes_reuniao.sql
// garante).

const PAUSA_SALVAR = 900;      // ms depois da última mudança
const PAUSA_RASCUNHO = 400;
const LIMITE = 1_000_000;      // o mesmo do banco
const teclado = matchMedia('(hover: hover) and (pointer: fine)');

const SALVAMENTO = {
  salvo: { texto: 'Salvo', icone: 'i-nuvem-check' },
  salvando: { texto: 'Salvando…', icone: 'i-sincronizar' },
  offline: { texto: 'Sem conexão', icone: 'i-nuvem-alerta', titulo: 'Sem conexão. As anotações ficam guardadas neste aparelho e são salvas quando a internet voltar.' },
  erro: { texto: 'Não foi salvo', icone: 'i-alerta' },
  grande: { texto: 'Texto grande demais', icone: 'i-alerta', titulo: 'As anotações passaram do tamanho máximo. Apague uma parte para voltar a salvar.' },
};

const ESTADOS = {
  semAcesso: {
    icone: 'i-documento',
    titulo: 'Anotações só para administradores',
    texto: 'As anotações das reuniões são de quem as conduz. Sua conta não tem acesso a elas.',
    acao: ['voltar', 'Voltar para a reunião'],
  },
  reuniaoNaoEncontrada: {
    icone: 'c-calendario',
    titulo: 'Reunião não encontrada',
    texto: 'Ela pode ter sido removida do banco de dados.',
    acao: ['voltar', 'Voltar para a reunião'],
  },
  categoriaNaoEncontrada: {
    icone: 'i-grade',
    titulo: 'Categoria não encontrada',
    texto: 'Ela pode ter sido removida do banco de dados.',
    acao: ['voltar', 'Voltar para a reunião'],
  },
  erroCategorias: {
    icone: 'i-sem-conexao',
    titulo: 'Não foi possível carregar a categoria',
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
  erroAnotacoes: {
    icone: 'i-sem-conexao',
    titulo: 'Não foi possível carregar as anotações',
    texto: 'Verifique a conexão com a internet e tente de novo.',
    acao: ['recarregar', 'Tentar de novo'],
  },
  semTabelaReunioes: {
    icone: 'i-alerta',
    titulo: 'Reuniões ainda não configuradas',
    texto: 'Falta criar a tabela de reuniões no banco de dados: rode o arquivo sql/reunioes.sql no SQL Editor do Supabase.',
    acao: ['recarregar', 'Tentar de novo'],
  },
  semTabela: {
    icone: 'i-alerta',
    titulo: 'Anotações ainda não configuradas',
    texto: 'Falta criar a tabela de anotações no banco de dados: rode o arquivo sql/anotacoes_reuniao.sql no SQL Editor do Supabase.',
    acao: ['recarregar', 'Tentar de novo'],
  },
};

const els = {};
let rota = null;            // { professorId, reuniaoId, categoriaId } da página aberta
let abertura = 0;           // muda a cada abertura: descarta o que chegar de uma anterior
let sessao = null;          // a folha (reunião + categoria) aberta no editor (ver novaSessao)
const sessoes = new Set();  // todas com algo ainda por salvar (inclusive de páginas já fechadas)

export function iniciarAnotacoes({ aoVoltar }) {
  els.titulo = document.getElementById('titulo-anotacoes');
  els.subtitulo = document.getElementById('subtitulo-anotacoes');
  els.voltar = document.getElementById('btn-voltar-reuniao');
  els.salvamento = document.getElementById('salvamento');
  els.salvamentoTexto = document.getElementById('salvamento-texto');
  els.salvamentoIcone = els.salvamento.querySelector('use');
  els.tentar = document.getElementById('btn-tentar-salvar');
  els.folha = document.getElementById('folha-anotacoes');
  els.esqueleto = document.getElementById('esqueleto-anotacoes');
  els.editor = document.getElementById('editor-anotacoes');
  els.estado = document.getElementById('estado-anotacoes');
  els.aviso = document.getElementById('aviso-anotacoes');

  iniciarEditor(els.editor, {
    mudar: aoMudarTexto,
    mudarSelecao: atualizarBarra,
    pedirLink: abrirPainelLink,
    mostrarCursor,
  });
  iniciarBarra({
    barra: document.getElementById('ferramentas'),
    menus: document.getElementById('menus-formatacao'),
    editor: els.editor,
    cabecalho: document.getElementById('cabecalho'),
    principal: document.getElementById('principal'),
  });

  els.voltar.addEventListener('click', aoVoltar);
  els.tentar.addEventListener('click', () => {
    if (!sessao) return;
    mostrarSalvamento('salvando');
    salvar(sessao);
  });
  els.estado.addEventListener('click', evento => {
    const acao = evento.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'voltar') aoVoltar();
    if (acao === 'recarregar') abrir(rota);
    if (acao === 'recarregar-tudo') {
      carregarAlinhamento();
      abrir(rota);
    }
  });

  // A internet voltou: salva o que ficou para trás.
  addEventListener('online', () => {
    for (const s of sessoes) if (pendente(s)) salvar(s);
  });
  // App trocado no celular, aba fechada: guarda e salva na hora.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') salvarJa();
  });
  addEventListener('pagehide', salvarJa);
  addEventListener('beforeunload', evento => {
    if (![...sessoes].some(pendente)) return;
    salvarJa();
    evento.preventDefault();
    evento.returnValue = '';
  });
}

export function abrirAnotacoes(dados) {
  return abrir(dados, { focar: true });
}

// Ao sair da página: o que falta salvar é salvo agora (e continua salvando
// em segundo plano). Devolve a promessa do salvamento, para a página da
// reunião mostrar o resumo atualizado.
export function sairDasAnotacoes() {
  abertura++;
  fecharMenus();
  const s = sessao;
  sessao = null;
  editavel(false);
  if (!s) return Promise.resolve();
  s.final = { html: conteudo(), resumo: resumo() };
  s.ativa = false;
  guardarRascunho(s);
  return salvar(s) ?? Promise.resolve();
}

// Antes de sair da conta: tudo o que falta salvar, salvo.
export function salvarAnotacoesPendentes() {
  if (sessao) {
    sessao.final = { html: conteudo(), resumo: resumo() };
    guardarRascunho(sessao);
  }
  return Promise.all([...sessoes].filter(pendente).map(s => salvar(s)));
}

// Ao sair da conta: esquece tudo (o rascunho fica no aparelho, guardado
// para a mesma pessoa).
export function limparAnotacoes() {
  abertura++;
  for (const s of sessoes) {
    s.cancelada = true;
    clearTimeout(s.timer);
    clearTimeout(s.rascunhoTimer);
  }
  sessoes.clear();
  sessao = null;
  rota = null;
  fecharMenus();
  editavel(false);
  els.editor.innerHTML = '';
  els.aviso.textContent = '';
  els.estado.hidden = true;
}

// ---------- Abertura ----------

async function abrir({ professorId, reuniaoId, categoriaId }, { focar = false } = {}) {
  const minha = ++abertura;
  rota = { professorId, reuniaoId, categoriaId };
  sessao = null;
  prepararFontes();
  els.aviso.textContent = '';
  // Com as categorias na memória (vindo da página da reunião), o nome
  // aparece na hora.
  desenharCabecalho({ carregando: true, categoria: categoriaPorId(categoriaId) });
  mostrarCarregando();

  const cargaReuniao = buscarReuniao(reuniaoId).then(reuniao => ({ ok: true, reuniao }), erro => ({ ok: false, erro }));
  const cargaAnotacoes = buscarAnotacoes(reuniaoId, categoriaId)
    .then(anotacoes => ({ ok: true, anotacoes }), erro => ({ ok: false, erro }));
  const cargaCategorias = state.categorias ? null : carregarCategorias();

  const listaOk = await esperarAlinhamento();
  const c = cargaCategorias ? await cargaCategorias : { ok: true };
  if (minha !== abertura) return;
  if (!listaOk) return mostrarEstado(ESTADOS.erroProfessor);
  if (!ehAdmin()) return mostrarEstado(ESTADOS.semAcesso);
  if (!c.ok && !state.categorias) {
    return mostrarEstado(faltaTabelaDeCategorias(c.erro) ? ESTADOS.semTabelaCategorias : ESTADOS.erroCategorias);
  }

  const r = await cargaReuniao;
  if (minha !== abertura) return;
  if (!r.ok) {
    console.error('Erro ao carregar a reunião:', r.erro);
    return mostrarEstado(faltaTabelaDeReunioes(r.erro) ? ESTADOS.semTabelaReunioes : ESTADOS.erroReuniao);
  }
  const { reuniao } = r;
  if (!reuniao || String(reuniao.professor_id) !== professorId) return mostrarEstado(ESTADOS.reuniaoNaoEncontrada);
  const categoria = categoriaPorId(categoriaId);
  if (!categoria) return mostrarEstado(ESTADOS.categoriaNaoEncontrada);
  desenharCabecalho({ reuniao, professor: professorPorId(reuniao.professor_id), categoria });

  const a = await cargaAnotacoes;
  if (minha !== abertura) return;
  if (!a.ok) {
    console.error('Erro ao carregar as anotações:', a.erro);
    if (faltaAtualizarBanco(a.erro)) return mostrarEstado(ESTADOS.bancoDesatualizado);
    return mostrarEstado(faltaTabelaDeAnotacoes(a.erro) ? ESTADOS.semTabela : ESTADOS.erroAnotacoes);
  }

  // O texto do banco; se este aparelho guardou uma versão que não chegou a
  // ser salva, ela volta.
  const chave = chaveDoRascunho(reuniaoId, categoriaId);
  definirConteudo(a.anotacoes?.conteudo ?? '');
  const doBanco = conteudo();
  const rascunho = lerRascunho(chave);
  let recuperado = false;
  if (rascunho?.html) {
    definirConteudo(rascunho.html);
    recuperado = conteudo() !== doBanco;
    if (!recuperado) apagarRascunho({ chave });
  }

  // Os ids como vieram do banco (números), para gravar com o mesmo tipo.
  sessao = novaSessao({ reuniaoId: reuniao.id, categoriaId: categoria.id }, doBanco, chave);
  mostrarEditor();
  if (recuperado) {
    sessao.edicao++;
    sessoes.add(sessao);
    salvar(sessao);
    els.aviso.textContent = 'As alterações que ainda não tinham sido salvas foram recuperadas.';
  } else {
    mostrarSalvamento('salvo', { quando: a.anotacoes?.atualizado_em });
  }
  if (focar && teclado.matches) focarNoComeco();
  else if (focar) els.titulo.focus({ preventScroll: true });
}

function ehAdmin() {
  return state.professores.find(p => p.user_id === state.usuario?.id)?.papel === 'admin';
}

// ---------- Salvamento ----------

function novaSessao({ reuniaoId, categoriaId }, salvo, chave) {
  return {
    reuniaoId,
    categoriaId,
    chave,
    salvo,             // o último HTML gravado no banco
    edicao: 0,         // conta as mudanças
    edicaoSalva: 0,    // a mudança que o último salvamento cobriu
    timer: 0,
    rascunhoTimer: 0,
    emAndamento: null,
    deNovo: false,
    tentativas: 0,
    ativa: true,       // ainda é a página aberta (senão o texto está em `final`)
    final: null,
    cancelada: false,
  };
}

function pendente(s) {
  return s.edicao !== s.edicaoSalva;
}

function aoMudarTexto() {
  const s = sessao;
  if (!s) return;
  s.edicao++;
  sessoes.add(s);
  if (!s.emAndamento && !s.erroAtual) mostrarSalvamento('salvando');
  clearTimeout(s.timer);
  s.timer = setTimeout(() => salvar(s), PAUSA_SALVAR);
  clearTimeout(s.rascunhoTimer);
  s.rascunhoTimer = setTimeout(() => guardarRascunho(s), PAUSA_RASCUNHO);
}

function salvar(s) {
  clearTimeout(s.timer);
  s.timer = 0;
  if (s.cancelada) return Promise.resolve();
  if (s.emAndamento) {
    s.deNovo = true;
    return s.emAndamento;
  }
  const edicao = s.edicao;
  const html = s.ativa ? conteudo() : s.final.html;
  if (html === s.salvo) {
    concluido(s, edicao);
    return Promise.resolve();
  }
  if (html.length > LIMITE) {
    if (s === sessao) mostrarSalvamento('grande');
    return Promise.resolve();
  }
  const texto = s.ativa ? resumo() : s.final.resumo;
  // Sem conexão, o aviso fica até dar certo (não pisca a cada tentativa).
  if (s === sessao && !s.erroAtual) mostrarSalvamento('salvando');

  s.emAndamento = (async () => {
    try {
      const { error } = await salvarAnotacoes({
        reuniao_id: s.reuniaoId,
        categoria_id: s.categoriaId,
        conteudo: html,
        resumo: texto,
      });
      if (error) throw error;
      s.salvo = html;
      s.tentativas = 0;
      concluido(s, edicao);
    } catch (erro) {
      if (s.cancelada) return;
      s.tentativas++;
      const semConexao = falhaDeConexao(erro);
      console.error('Erro ao salvar as anotações:', erro);
      if (s === sessao) mostrarSalvamento(semConexao ? 'offline' : 'erro', { erro });
      // Sem conexão: tenta de novo sozinho, cada vez mais espaçado (até 30 s).
      if (semConexao && !s.timer) s.timer = setTimeout(() => salvar(s), Math.min(30_000, 2_000 * 2 ** (s.tentativas - 1)));
    } finally {
      s.emAndamento = null;
      if (s.deNovo && !s.cancelada) {
        s.deNovo = false;
        salvar(s);
      }
    }
  })();
  return s.emAndamento;
}

function concluido(s, edicao) {
  s.edicaoSalva = Math.max(s.edicaoSalva, edicao);
  if (!pendente(s)) {
    apagarRascunho(s);
    if (!s.ativa) sessoes.delete(s);
  }
  if (s === sessao) mostrarSalvamento(pendente(s) ? 'salvando' : 'salvo', { quando: new Date() });
}

function salvarJa() {
  if (sessao) guardarRascunho(sessao);
  for (const s of sessoes) if (pendente(s)) salvar(s);
}

function falhaDeConexao(erro) {
  if (!navigator.onLine) return true;
  if (erro?.code) return /^(5\d\d|PGRST000|PGRST001|PGRST002)$/.test(String(erro.code));
  return /fetch|network|timeout|load failed/i.test(erro?.message ?? '');
}

function problemaAoSalvar(erro) {
  if (erro?.code === '42501') return 'O banco não reconheceu sua conta como administrador, então as anotações não foram salvas.';
  if (faltaTabelaDeAnotacoes(erro)) return 'As anotações ainda não foram configuradas no banco: rode o arquivo sql/anotacoes_reuniao.sql no Supabase.';
  if (faltaAtualizarBanco(erro)) {
    return 'O banco de dados ainda está na estrutura antiga, com uma categoria por reunião. Rode no Supabase o SQL que separa as anotações por categoria.';
  }
  if (erro?.code === '23503') return 'Esta reunião ou esta categoria não existe mais no banco, então as anotações não foram salvas.';
  return 'Não foi possível salvar as anotações. Elas ficam guardadas neste aparelho; tente de novo em instantes.';
}

// ---------- Rascunho neste aparelho ----------
// Por pessoa, reunião e categoria. Some quando o banco confirma o salvamento.

function chaveDoRascunho(reuniaoId, categoriaId) {
  return `gestao-reunioes:anotacoes:${state.usuario?.id}:${reuniaoId}:${categoriaId}`;
}

function guardarRascunho(s) {
  clearTimeout(s.rascunhoTimer);
  s.rascunhoTimer = 0;
  if (!pendente(s) || s.cancelada) return;
  const html = s.ativa ? els.editor.innerHTML : s.final.html;
  try {
    localStorage.setItem(s.chave, JSON.stringify({ html, em: Date.now() }));
  } catch { /* armazenamento cheio ou bloqueado: o salvamento no banco continua */ }
}

function apagarRascunho(s) {
  clearTimeout(s.rascunhoTimer);
  try { localStorage.removeItem(s.chave); } catch { /* sem armazenamento */ }
}

function lerRascunho(chave) {
  try { return JSON.parse(localStorage.getItem(chave) ?? 'null'); } catch { return null; }
}

// ---------- Desenho ----------

// O título é a categoria ("Feedback"); embaixo, de qual reunião ela é.
function desenharCabecalho({ carregando = false, reuniao = null, professor = null, categoria = null }) {
  els.titulo.textContent = categoria?.nome ?? 'Anotações';
  els.titulo.title = categoria?.nome ?? ''; // nome longo cortado com "…"
  els.editor.setAttribute('aria-label', categoria ? `Anotações de ${categoria.nome}` : 'Anotações da reunião');
  els.voltar.setAttribute('aria-label', 'Voltar para a reunião');
  els.voltar.title = 'Voltar para a reunião';
  els.salvamento.hidden = true;
  if (!reuniao) {
    els.subtitulo.textContent = carregando ? 'Carregando…' : '';
    els.subtitulo.title = '';
    document.title = `${categoria?.nome ?? 'Anotações'} – Gestão de Reuniões`;
    return;
  }
  const inicio = new Date(reuniao.inicio);
  const dia = `${diaDaSemana(inicio)}, ${diaPorExtenso(inicio)}`;
  const texto = [`${dia} · ${hora(inicio)} às ${hora(fimDaReuniao(reuniao))}`, professor?.nome].filter(Boolean).join(' · ');
  els.subtitulo.textContent = texto;
  els.subtitulo.title = texto;
  document.title = `${categoria?.nome ?? 'Anotações'} · Reunião de ${diaPorExtenso(inicio)} – Gestão de Reuniões`;
}

function mostrarCarregando() {
  els.estado.hidden = true;
  els.folha.hidden = false;
  els.esqueleto.hidden = false;
  els.editor.hidden = true;
  editavel(false);
  mostrarBarra(false);
}

function mostrarEditor() {
  els.estado.hidden = true;
  els.folha.hidden = false;
  els.esqueleto.hidden = true;
  els.editor.hidden = false;
  editavel(true);
  mostrarBarra(true);
  atualizarBarra();
}

function mostrarEstado(estado) {
  editavel(false);
  mostrarBarra(false);
  els.folha.hidden = true;
  els.salvamento.hidden = true;
  els.estado.innerHTML = estadoHtml(estado);
  els.estado.hidden = false;
  if (!els.subtitulo.title) els.subtitulo.textContent = '';
}

function mostrarSalvamento(situacao, { quando = null, erro = null } = {}) {
  const s = sessao;
  if (s) s.erroAtual = situacao === 'offline' || situacao === 'erro' || situacao === 'grande';
  const info = SALVAMENTO[situacao];
  const anterior = els.salvamento.dataset.situacao;
  els.salvamento.hidden = false;
  els.salvamento.dataset.situacao = situacao;
  els.salvamentoTexto.textContent = info.texto;
  els.salvamentoIcone.setAttribute('href', `#${info.icone}`);
  let titulo = info.titulo ?? '';
  if (situacao === 'salvo') titulo = quando ? `Tudo salvo · última alteração às ${hora(new Date(quando))}` : 'Tudo salvo';
  if (situacao === 'erro') titulo = problemaAoSalvar(erro);
  els.salvamento.title = titulo;
  els.tentar.hidden = !(situacao === 'offline' || situacao === 'erro');
  // O leitor de tela só ouve quando algo deu errado (não a cada pausa).
  if (situacao !== anterior && (situacao === 'offline' || situacao === 'erro' || situacao === 'grande')) {
    els.aviso.textContent = situacao === 'erro' ? titulo : `${info.texto}. ${info.titulo}`;
  }
  if ((anterior === 'offline' || anterior === 'erro') && situacao === 'salvo') els.aviso.textContent = 'Anotações salvas.';
}
