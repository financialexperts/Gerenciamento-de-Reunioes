// Dias e horários das reuniões por extenso, em português e no fuso de quem
// está vendo (o banco guarda o instante; cada um vê na própria hora local).

const formato = opcoes => new Intl.DateTimeFormat('pt-BR', opcoes);
const MES_CURTO = formato({ month: 'short' });                  // "out."
const SEMANA_CURTA = formato({ weekday: 'short' });             // "qui."
const SEMANA = formato({ weekday: 'long' });                    // "quinta-feira"
const DIA_MES = formato({ day: 'numeric', month: 'long' });     // "8 de outubro"
const DIA_MES_ANO = formato({ day: 'numeric', month: 'long', year: 'numeric' });
const HORA = formato({ hour: '2-digit', minute: '2-digit' });   // "14:00"
const RELATIVO = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

const DIA_MS = 86_400_000;
const semPonto = texto => texto.replace(/\.$/, '');
const maiuscula = texto => texto.charAt(0).toUpperCase() + texto.slice(1);
const doisDigitos = n => String(n).padStart(2, '0');

// O que vai na folha de calendário: "out", "8", "qui".
export function folhaDaData(data) {
  return {
    mes: semPonto(MES_CURTO.format(data)),
    dia: String(data.getDate()),
    semana: semPonto(SEMANA_CURTA.format(data)),
  };
}

// "Quinta-feira"
export function diaDaSemana(data) {
  return maiuscula(SEMANA.format(data));
}

// "8 de outubro"; com o ano quando pedido ou quando não é o ano corrente.
export function diaPorExtenso(data, { comAno = false, agora = new Date() } = {}) {
  const anoDiferente = data.getFullYear() !== agora.getFullYear();
  return (comAno || anoDiferente ? DIA_MES_ANO : DIA_MES).format(data);
}

export function hora(data) {
  return HORA.format(data);
}

// 30 → "30 min" · 60 → "1 h" · 90 → "1 h 30"
export function duracaoPorExtenso(minutos) {
  const h = Math.floor(minutos / 60);
  const min = minutos % 60;
  if (!h) return `${min} min`;
  return min ? `${h} h ${doisDigitos(min)}` : `${h} h`;
}

// Dias de calendário entre hoje e a data (não períodos de 24 h): uma
// reunião amanhã às 8:00 é "amanhã" mesmo vista hoje às 23:00.
export function diasAte(data, agora = new Date()) {
  const meiaNoite = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((meiaNoite(data) - meiaNoite(agora)) / DIA_MS);
}

// "Hoje", "Amanhã", "Em 6 dias", "Há 3 dias", "Em 2 semanas", "Há 3 meses"…
export function quandoPorExtenso(data, agora = new Date()) {
  const dias = diasAte(data, agora);
  const distancia = Math.abs(dias);
  let texto;
  if (distancia < 14) texto = RELATIVO.format(dias, 'day');
  else if (distancia < 60) texto = RELATIVO.format(Math.round(dias / 7), 'week');
  else if (distancia < 365) texto = RELATIVO.format(Math.round(dias / 30), 'month');
  else texto = RELATIVO.format(Math.round(dias / 365), 'year');
  return maiuscula(texto);
}

// Valores no formato dos campos <input type="date"> e <input type="time">,
// na hora local ("2026-10-08" e "14:00").
export function valorDeData(data) {
  return `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
}

export function valorDeHora(data) {
  return `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`;
}
