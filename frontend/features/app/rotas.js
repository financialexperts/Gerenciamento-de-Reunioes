// Endereço de cada tela. A lista de professores é a página inicial, a
// página de um professor é "?professor=<id>", a de uma reunião dele,
// "?professor=<id>&reuniao=<id>", e as anotações de uma categoria dessa
// reunião, "?professor=<id>&reuniao=<id>&categoria=<id>": o Voltar do
// navegador, recarregar a página e abrir em outra aba funcionam como num
// site comum. É parâmetro de busca, não "#", porque o "#" é do link de
// redefinição de senha do Supabase.

let aoMudar = () => {};

export function iniciarRotas(callback) {
  aoMudar = callback;
  addEventListener('popstate', () => aoMudar(rotaAtual()));
}

// Endereços da estrutura antiga (uma categoria com as reuniões dentro)
// continuam abrindo: o das anotações tem os mesmos três parâmetros, e o da
// categoria sozinha cai na página do professor.
export function rotaAtual() {
  const parametros = new URLSearchParams(location.search);
  const professorId = parametros.get('professor');
  const reuniaoId = parametros.get('reuniao');
  const categoriaId = parametros.get('categoria');
  if (professorId && reuniaoId && categoriaId) return { tela: 'anotacoes', professorId, reuniaoId, categoriaId };
  if (professorId && reuniaoId) return { tela: 'reuniao', professorId, reuniaoId };
  return professorId ? { tela: 'professor', professorId } : { tela: 'alinhamento' };
}

export function enderecoDoProfessor(id) {
  return `?professor=${encodeURIComponent(id)}`;
}

export function enderecoDaReuniao(professorId, reuniaoId) {
  return `${enderecoDoProfessor(professorId)}&reuniao=${encodeURIComponent(reuniaoId)}`;
}

export function enderecoDasAnotacoes(professorId, reuniaoId, categoriaId) {
  return `${enderecoDaReuniao(professorId, reuniaoId)}&categoria=${encodeURIComponent(categoriaId)}`;
}

export function irParaProfessor(id) {
  history.pushState({ daLista: true }, '', enderecoDoProfessor(id));
  aoMudar(rotaAtual());
}

// A reunião guarda o caminho até ela: se o professor veio da lista,
// "Alinhamento" na barra lateral volta duas páginas no histórico.
export function irParaReuniao(professorId, reuniaoId) {
  const professorVeioDaLista = Boolean(history.state?.daLista);
  history.pushState({ daProfessor: true, daLista: professorVeioDaLista }, '', enderecoDaReuniao(professorId, reuniaoId));
  aoMudar(rotaAtual());
}

// As anotações continuam o caminho da reunião de onde vieram.
export function irParaAnotacoes(professorId, reuniaoId, categoriaId) {
  const { daProfessor = false, daLista = false } = history.state ?? {};
  history.pushState(
    { daReuniao: true, daProfessor, daLista },
    '',
    enderecoDasAnotacoes(professorId, reuniaoId, categoriaId),
  );
  aoMudar(rotaAtual());
}

// Quem veio da lista volta pelo histórico, então o Voltar do app e o do
// navegador levam ao mesmo lugar. Quem abriu o link direto vai para a
// lista sem sair do sistema.
export function voltarParaLista() {
  const { daLista, daProfessor, daReuniao } = history.state ?? {};
  if (daLista) {
    history.go(-1 - Number(Boolean(daProfessor)) - Number(Boolean(daReuniao)));
    return;
  }
  history.replaceState(null, '', location.pathname);
  aoMudar(rotaAtual());
}

// Mesma ideia, da reunião para o professor.
export function voltarParaProfessor() {
  if (history.state?.daProfessor) {
    history.back();
    return;
  }
  history.replaceState(null, '', enderecoDoProfessor(rotaAtual().professorId));
  aoMudar(rotaAtual());
}

// E das anotações para a reunião.
export function voltarParaReuniao() {
  if (history.state?.daReuniao) {
    history.back();
    return;
  }
  const { professorId, reuniaoId } = rotaAtual();
  history.replaceState(null, '', enderecoDaReuniao(professorId, reuniaoId));
  aoMudar(rotaAtual());
}

// Ao sair da conta: o próximo login começa pela lista.
export function limparRota() {
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
}
