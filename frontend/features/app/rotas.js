// Endereço de cada tela. A lista de professores é a página inicial e a
// página de um professor é "?professor=<id>": o Voltar do navegador,
// recarregar a página e abrir um professor em outra aba funcionam como num
// site comum. É parâmetro de busca, não "#", porque o "#" é do link de
// redefinição de senha do Supabase.

let aoMudar = () => {};

export function iniciarRotas(callback) {
  aoMudar = callback;
  addEventListener('popstate', () => aoMudar(rotaAtual()));
}

export function rotaAtual() {
  const professorId = new URLSearchParams(location.search).get('professor');
  return professorId ? { tela: 'professor', professorId } : { tela: 'alinhamento' };
}

export function enderecoDoProfessor(id) {
  return `?professor=${encodeURIComponent(id)}`;
}

export function irParaProfessor(id) {
  history.pushState({ daLista: true }, '', enderecoDoProfessor(id));
  aoMudar(rotaAtual());
}

// Quem veio da lista volta pelo histórico, então o Voltar do app e o do
// navegador levam ao mesmo lugar. Quem abriu o link direto vai para a
// lista sem sair do sistema.
export function voltarParaLista() {
  if (history.state?.daLista) {
    history.back();
    return;
  }
  history.replaceState(null, '', location.pathname);
  aoMudar(rotaAtual());
}

// Ao sair da conta: o próximo login começa pela lista.
export function limparRota() {
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);
}
