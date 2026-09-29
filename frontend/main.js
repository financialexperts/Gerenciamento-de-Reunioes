import { state } from './state/store.js';
import { iniciarAutenticacao, sair } from './features/auth/auth.js';
import { atualizarConta, esconderApp, iniciarShell, mostrarApp } from './features/app/shell.js';
import { adicionarProfessor, carregarAlinhamento, iniciarAlinhamento, limparAlinhamento } from './features/alinhamento/alinhamentoView.js';
import { iniciarNovoProfessor, permitirCadastro } from './features/professores/novoProfessor.js';

// Ponto de partida: liga as telas e decide, pela sessão, se abre o login
// ou o aplicativo.

iniciarShell({ aoSair: sair });
iniciarAlinhamento();
iniciarNovoProfessor({ aoCadastrar: adicionarProfessor });

iniciarAutenticacao({
  async aoEntrar(usuario) {
    state.usuario = usuario;
    atualizarConta({ nome: null, email: usuario.email });
    mostrarApp();
    await carregarAlinhamento();

    // O perfil (nome e papel) vem da mesma lista de professores: o RLS
    // sempre devolve ao menos a linha da própria pessoa.
    if (state.usuario?.id !== usuario.id) return; // saiu enquanto carregava
    state.perfil = state.professores.find(p => p.user_id === usuario.id) ?? null;
    atualizarConta({ nome: state.perfil?.nome?.trim() || null, email: usuario.email });
    // Cadastrar professor é coisa de admin, como no Sistema de Presença.
    permitirCadastro(state.perfil?.papel === 'admin');
  },
  aoSair() {
    permitirCadastro(false);
    state.usuario = null;
    state.perfil = null;
    limparAlinhamento();
    esconderApp();
  },
});
