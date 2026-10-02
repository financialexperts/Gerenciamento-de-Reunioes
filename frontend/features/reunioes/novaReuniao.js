import { criarReuniao, faltaTabelaDeReunioes } from '../../../backend/api/reunioesRepo.js';
import { fimDaReuniao, situacaoDaReuniao } from '../../../backend/domain/reunioes.js';
import { ocupado } from '../../shared/dom.js';
import {
  diaDaSemana, diaPorExtenso, diasAte, duracaoPorExtenso, folhaDaData, hora,
  quandoPorExtenso, valorDeData, valorDeHora,
} from './datas.js';

// "Nova reunião": marca uma reunião de uma categoria com um professor. O dia
// é o destaque da janela — a folha de calendário e o "quando" por extenso
// acompanham o que se escolhe — e pode ser no passado, para registrar uma
// reunião que já aconteceu. O botão só aparece para admin; quem garante a
// regra de verdade é o RLS (sql/reunioes.sql).

const DURACOES = [15, 30, 45, 60, 90, 120]; // o banco aceita de 5 a 480 min
const DURACAO_PADRAO = 30;

const LOCAL = {
  presencial: { rotulo: 'Local', placeholder: 'Ex.: Sala 2, unidade Centro', inputmode: 'text' },
  online: { rotulo: 'Link da chamada', placeholder: 'Ex.: meet.google.com/abc-defg-hij', inputmode: 'url' },
};

const dialogo = document.getElementById('dialogo-nova-reuniao');
const form = document.getElementById('form-nova-reuniao');
const descricao = document.getElementById('nova-reuniao-descricao');
const destaque = document.getElementById('dia-reuniao');
const erro = document.getElementById('nova-reuniao-erro');
const botaoSalvar = document.getElementById('btn-salvar-nova-reuniao');
const campo = id => document.getElementById(id);

let aoCriar = () => {};
let contexto = null; // { professorId, professorNome, categoria, reunioes }
let criada = null;   // entregue à página quando a janela fecha
let salvando = false;

export function iniciarNovaReuniao(opcoes) {
  aoCriar = opcoes.aoCriar;
  campo('reuniao-duracao').innerHTML = DURACOES
    .map(minutos => `<option value="${minutos}">${duracaoPorExtenso(minutos)}</option>`)
    .join('');

  form.addEventListener('submit', criar);
  form.addEventListener('input', evento => {
    evento.target.removeAttribute?.('aria-invalid');
    atualizarDestaque();
  });
  form.addEventListener('change', evento => {
    if (evento.target.name === 'formato') ajustarLocal();
  });
  campo('btn-cancelar-nova-reuniao').addEventListener('click', () => dialogo.close());

  // Esc e clique fora fecham, menos no meio do salvamento.
  dialogo.addEventListener('cancel', evento => {
    if (salvando) evento.preventDefault();
  });
  dialogo.addEventListener('click', evento => {
    if (evento.target === dialogo && !salvando) dialogo.close();
  });
  dialogo.addEventListener('close', entregar);
}

// Aberta de dentro de uma categoria de um professor: os dois já vêm
// escolhidos, falta dizer quando e como.
export function abrirNovaReuniao(dados) {
  contexto = dados;
  form.reset();
  esconderErro();
  descricao.textContent = `${dados.categoria.nome} com ${dados.professorNome}.`;

  // Começa na próxima hora cheia: o mais comum é marcar para frente.
  const inicio = new Date();
  inicio.setMinutes(60, 0, 0);
  campo('reuniao-data').value = valorDeData(inicio);
  campo('reuniao-hora').value = valorDeHora(inicio);
  campo('reuniao-duracao').value = String(DURACAO_PADRAO);
  ajustarLocal();
  atualizarDestaque();

  dialogo.showModal();
  campo('reuniao-data').focus();
}

export function fecharNovaReuniao() {
  if (dialogo.open) dialogo.close();
}

function entregar() {
  if (!criada) return;
  const reuniao = criada;
  criada = null;
  aoCriar(reuniao);
}

// ---------- Campos ----------

// O dia sozinho já desenha a folha; o horário completa o início.
function lerInicio() {
  const data = campo('reuniao-data').value;    // "2026-10-08", ou "" se incompleta
  const horario = campo('reuniao-hora').value; // "14:00"
  if (!data) return { dia: null, inicio: null };
  return {
    dia: new Date(`${data}T00:00`),
    inicio: horario ? new Date(`${data}T${horario}`) : null,
  };
}

function lerDuracao() {
  return Number(campo('reuniao-duracao').value) || DURACAO_PADRAO;
}

// O campo de local muda de nome com o formato: sala ou link da chamada.
function ajustarLocal() {
  const formato = LOCAL[form.elements.formato.value] ?? LOCAL.presencial;
  const entrada = campo('reuniao-local');
  campo('reuniao-local-rotulo').textContent = formato.rotulo;
  entrada.placeholder = formato.placeholder;
  entrada.inputMode = formato.inputmode;
}

// O destaque do topo: folha de calendário + dia da semana, data e quando.
function atualizarDestaque() {
  const { dia, inicio } = lerInicio();
  const agora = new Date();
  const texto = {
    mes: campo('dia-reuniao-mes'),
    dia: campo('dia-reuniao-dia'),
    semanaCurta: campo('dia-reuniao-semana-curta'),
    semana: campo('dia-reuniao-semana'),
    data: campo('dia-reuniao-data'),
    quando: campo('dia-reuniao-quando'),
  };

  if (!dia) {
    destaque.dataset.situacao = 'vazia';
    destaque.removeAttribute('data-hoje');
    texto.mes.textContent = '';
    texto.dia.textContent = '–';
    texto.semanaCurta.textContent = '';
    texto.semana.textContent = 'Dia da reunião';
    texto.data.textContent = 'Escolha o dia';
    texto.quando.textContent = 'Pode ser para frente ou uma reunião que já aconteceu.';
    return;
  }

  const folha = folhaDaData(dia);
  texto.mes.textContent = folha.mes;
  texto.dia.textContent = folha.dia;
  texto.semanaCurta.textContent = folha.semana;
  texto.semana.textContent = diaDaSemana(dia);
  texto.data.textContent = diaPorExtenso(dia, { comAno: true });
  destaque.toggleAttribute('data-hoje', diasAte(dia, agora) === 0);

  const reuniao = inicio && { inicio: inicio.toISOString(), duracao_min: lerDuracao() };
  const situacao = reuniao ? situacaoDaReuniao(reuniao, agora) : diasAte(dia, agora) < 0 ? 'passada' : 'proxima';
  destaque.dataset.situacao = situacao;

  const partes = [quandoPorExtenso(dia, agora)];
  if (reuniao) partes.push(`${hora(inicio)} às ${hora(fimDaReuniao(reuniao))}`);
  if (situacao === 'passada') partes.push('já aconteceu');
  if (situacao === 'agora') partes.push('acontecendo agora');
  texto.quando.textContent = partes.join(' · ');
}

// ---------- Salvar ----------

async function criar(evento) {
  evento.preventDefault();
  if (salvando || !contexto) return;
  esconderErro();

  const { dia, inicio } = lerInicio();
  if (!dia) return mostrarErro('Escolha o dia da reunião.', 'reuniao-data');
  const ano = dia.getFullYear();
  if (ano < 2000 || ano > 2100) return mostrarErro(`Confira o ano da reunião: ${ano} parece erro de digitação.`, 'reuniao-data');
  if (!inicio) return mostrarErro('Escolha o horário de início.', 'reuniao-hora');

  const { categoria, professorNome } = contexto;
  const repetida = contexto.reunioes.some(r => new Date(r.inicio).getTime() === inicio.getTime());
  if (repetida) {
    return mostrarErro(`Já existe uma reunião de ${categoria.nome} com ${professorNome} nesse dia e horário.`, 'reuniao-hora');
  }

  const formato = form.elements.formato.value;
  const local = campo('reuniao-local').value.trim().replace(/\s+/g, ' ');
  const pauta = campo('reuniao-pauta').value.trim();

  salvando = true;
  const liberar = ocupado(botaoSalvar, 'Criando…');
  try {
    const { data, error } = await criarReuniao({
      professor_id: contexto.professorId,
      categoria_id: categoria.id,
      inicio: inicio.toISOString(),
      duracao_min: lerDuracao(),
      formato,
      local: local || null,
      pauta: pauta || null,
    });
    if (error) return mostrarErro(problemaAoCriar(error));
    criada = data;
    // Se a janela foi fechada por fora no meio do salvamento (Voltar do
    // navegador), a reunião é entregue do mesmo jeito.
    if (dialogo.open) dialogo.close();
    else entregar();
  } catch (falha) {
    console.error('Erro ao criar reunião:', falha);
    mostrarErro('Sem conexão com o servidor. Verifique a internet e tente de novo.');
  } finally {
    salvando = false;
    liberar();
  }
}

// O que houve e como resolver, a partir do erro do banco.
function problemaAoCriar(falha) {
  if (falha.code === '42501') {
    return 'Só administradores podem criar reuniões, e o banco não reconheceu sua conta como administrador.';
  }
  if (falha.code === '23503') return 'Este professor ou esta categoria não existe mais no banco. Volte e abra de novo.';
  if (falha.code === '23514') return 'O banco recusou algum dos valores. Encurte o local ou a pauta e tente de novo.';
  if (faltaTabelaDeReunioes(falha)) {
    return 'As reuniões ainda não foram configuradas no banco de dados. Rode o arquivo sql/reunioes.sql no Supabase e tente de novo.';
  }
  console.error('Erro ao criar reunião:', falha);
  if (!navigator.onLine || /fetch|network/i.test(falha.message ?? '')) {
    return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  }
  return 'Não foi possível criar a reunião. Tente de novo em instantes.';
}

function mostrarErro(texto, idCampo) {
  erro.textContent = texto;
  erro.hidden = false;
  if (idCampo) {
    const entrada = campo(idCampo);
    entrada.setAttribute('aria-invalid', 'true');
    entrada.focus();
  }
}

function esconderErro() {
  erro.hidden = true;
  for (const entrada of form.querySelectorAll('[aria-invalid]')) entrada.removeAttribute('aria-invalid');
}
