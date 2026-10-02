// Regras das reuniões (tabela `reunioes`, sql/reunioes.sql): em que ponto
// do tempo cada uma está, a ordem das listas e o link de uma reunião online.

export function fimDaReuniao(reuniao) {
  return new Date(new Date(reuniao.inicio).getTime() + reuniao.duracao_min * 60_000);
}

// 'proxima' (ainda não começou), 'agora' (em andamento) ou 'passada' (já
// terminou). Uma reunião criada com data antiga já nasce 'passada'.
export function situacaoDaReuniao(reuniao, agora = new Date()) {
  if (fimDaReuniao(reuniao) <= agora) return 'passada';
  return new Date(reuniao.inicio) <= agora ? 'agora' : 'proxima';
}

// Próximas da mais perto para a mais longe (a em andamento fica no topo);
// as que já aconteceram da mais recente para a mais antiga.
export function separarReunioes(lista, agora = new Date()) {
  const proximas = [];
  const anteriores = [];
  for (const reuniao of lista) {
    (situacaoDaReuniao(reuniao, agora) === 'passada' ? anteriores : proximas).push(reuniao);
  }
  const porInicio = (a, b) => new Date(a.inicio) - new Date(b.inicio);
  proximas.sort(porInicio);
  anteriores.sort((a, b) => porInicio(b, a));
  return { proximas, anteriores };
}

// Endereço clicável de uma reunião online, só http(s). Aceita o link sem
// "https://" ("meet.google.com/abc-defg-hij"), do jeito que costuma ser
// colado. Texto que não é link ("Zoom, link no WhatsApp") devolve null.
export function linkDaChamada(local) {
  const texto = local?.trim();
  if (!texto || /\s/.test(texto)) return null;
  const comEsquema = /^[a-z][a-z\d+.-]*:/i.test(texto) ? texto : `https://${texto}`;
  try {
    const url = new URL(comEsquema);
    const web = url.protocol === 'https:' || url.protocol === 'http:';
    return web && url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}
