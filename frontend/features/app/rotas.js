// Endereço de cada tela. A lista de professores é a página inicial, a
// página de um professor é "?professor=<id>" e a de uma categoria dele,
// "?professor=<id>&categoria=<id>": o Voltar do navegador, recarregar a
// página e abrir em outra aba funcionam como num site comum. É parâmetro de
// busca, não "#", porque o "#" é do link de redefinição de senha do Supabase.

let aoMudar = () => {};

export function iniciarRotas(callback) {
  aoMudar = callback;
  addEventListener('popstate', () => aoMudar(rotaAtual()));
}

export function rotaAtual() {
  const parametros = new URLSearchParams(location.search);
  const professorId = parametros.get('professor');
  const categoriaId = parametros.get('categoria');
  if (professorId && categoriaId) return { tela: 'categoria', professorId, categoriaId };
  return professorId ? { tela: 'professor', professorId } : { tela: 'alinhamento' };
}

export function enderecoDoProfessor(id) {
  return `?professor=${encodeURIComponent(id)}`;
}

export function enderecoDaCategoria(professorId, categoriaId) {
  return `${enderecoDoProfessor(professorId)}&categoria=${encodeURIComponent(categoriaId)}`;
}

export function irParaProfessor(id) {
  history.pushState({ daLista: true }, '', enderecoDoProfessor(id));
  aoMudar(rotaAtual());
}

// A categoria guarda o caminho até ela: se o professor veio da lista,
// "Alinhamento" na barra lateral volta duas páginas no histórico.
export function irParaCategoria(professorId, categoriaId) {
  const professorVeioDaLista = Boolean(history.state?.daLista);
  history.pushState({ daProfessor: true, daLista: professorVeioDaLista }, '', enderecoDaCategoria(professorId, categoriaId));
  aoMudar(rotaAtual());
}

// Quem veio da lista volta pelo histórico, então o Voltar do app e o do
// navegador levam ao mesmo lugar. Quem abriu o link direto vai para a
// lista sem sair do sistema.
export function voltarParaLista() {
  const { daLista, daProfessor } = history.state ?? {};
  if (daLista) {
    history.go(daProfessor ? -2 : -1);
    return;
  }
  history.replaceState(null, '', location.pathname);
  aoMudar(rotaAtual());
}

// Mesma ideia, da categoria para o professor.
export function voltarParaProfessor() {
  if (history.state?.daProfessor) {
    history.back();
    return;
  }
  history.replaceState(null, '', enderecoDoProfessor(rotaAtual().professorId));
  aoMudar(rotaAtual());
}

// Ao sair da conta: o próximo login começa pela lista.
export function limparRota() {
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
}
