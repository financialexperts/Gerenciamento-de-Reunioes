// Regras de turma/curso trazidas do Sistema de Presença
// (backend/domain/status.js de lá), para as duas telas concordarem sobre o
// que é uma turma ativa, a cor de cada curso e a ordem das turmas.

// Turma com `ativa === false` está encerrada e nunca aparece em filtro nem
// em cartão. O teste é `!== false` porque turmas criadas antes da coluna
// existir vêm com null e continuam valendo.
export function turmaAtiva(turma) {
  return turma?.ativa !== false;
}

// Chave de cor por palavra no nome do curso — as mesmas palavras e a mesma
// família de cor dos selos do Sistema de Presença. Qualquer outro curso cai
// no cinza neutro.
const CORES_CURSO = [
  ['Elas', 'elas'],
  ['Master', 'master'],
  ['Evolution', 'evolution'],
  ['Clube', 'clube'],
];

export function chaveCorCurso(nomeCurso) {
  return CORES_CURSO.find(([palavra]) => nomeCurso?.includes(palavra))?.[1] ?? 'outro';
}

// O dia da semana só existe escrito no nome da turma ("Segunda 14:00",
// "Terça Sta Dorotéia 19:00"), então a ordem sai de lá.
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function ordemDia(nomeTurma) {
  const i = DIAS.findIndex(dia => (nomeTurma ?? '').includes(dia));
  return i === -1 ? DIAS.length : i;
}

export function compararTurmas(a, b) {
  return ordemDia(a.turma) - ordemDia(b.turma)
    || (a.turma ?? '').localeCompare(b.turma ?? '', 'pt-BR', { numeric: true });
}
