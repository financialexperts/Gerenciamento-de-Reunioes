import { state } from './state/store.js';
import { iniciarAutenticacao, sair } from './features/auth/auth.js';
import { atualizarConta, esconderApp, iniciarShell, mostrarApp, trocarTela } from './features/app/shell.js';
import { iniciarRotas, irParaProfessor, limparRota, rotaAtual, voltarParaLista } from './features/app/rotas.js';
import { adicionarProfessor, carregarAlinhamento, focarProfessor, iniciarAlinhamento, limparAlinhamento } from './features/alinhamento/alinhamentoView.js';
import { abrirProfessor, adicionarCategoria, iniciarProfessor, limparProfessor, permitirNovaCategoria } from './features/professores/professorView.js';
import { iniciarNovoProfessor, permitirCadastro } from './features/professores/novoProfessor.js';
import { iniciarNovaCategoria } from './features/categorias/novaCategoria.js';

// Ponto de partida: liga as telas, decide pela sessão entre o login e o
// aplicativo e, dentro dele, mostra a tela do endereço (lista de
// professores ou a página de um professor).

let rotaMostrada = null;

iniciarShell({ aoSair: sair, aoAbrirAlinhamento: voltarParaLista });
iniciarAlinhamento({ aoAbrirProfessor: irParaProfessor });
iniciarProfessor({ aoVoltar: voltarParaLista });
iniciarNovoProfessor({ aoCadastrar: adicionarProfessor });
iniciarNovaCategoria({ aoCriar: adicionarCategoria });
iniciarRotas(mostrarRota);

iniciarAutenticacao({
  async aoEntrar(usuario) {
    state.usuario = usuario;
    atualizarConta({ nome: null, email: usuario.email });
    mostrarApp();
    const carga = carregarAlinhamento();
    mostrarRota(rotaAtual());
    await carga;

    // O perfil (nome e papel) vem da mesma lista de professores: o RLS
    // sempre devolve ao menos a linha da própria pessoa.
    if (state.usuario?.id !== usuario.id) return; // saiu enquanto carregava
    state.perfil = state.professores.find(p => p.user_id === usuario.id) ?? null;
    atualizarConta({ nome: state.perfil?.nome?.trim() || null, email: usuario.email });
    // Cadastrar professor e criar categoria é coisa de admin, como no
    // Sistema de Presença.
    const admin = state.perfil?.papel === 'admin';
    permitirCadastro(admin);
    permitirNovaCategoria(admin);
  },
  aoSair() {
    permitirCadastro(false);
    permitirNovaCategoria(false);
    state.usuario = null;
    state.perfil = null;
    limparAlinhamento();
    limparProfessor();
    limparRota();
    rotaMostrada = null;
    document.title = 'Gestão de Reuniões';
    esconderApp();
  },
});

// Mostra a tela do endereço atual. Roda ao entrar, ao clicar num professor
// e no Voltar/Avançar do navegador.
function mostrarRota(rota) {
  if (!state.usuario) return; // na tela de login o endereço espera o login
  const anterior = rotaMostrada;
  rotaMostrada = rota;
  trocarTela(rota.tela);

  if (rota.tela === 'professor') {
    abrirProfessor(rota.professorId);
    return;
  }
  document.title = 'Gestão de Reuniões';
  if (anterior?.tela === 'professor') focarProfessor(anterior.professorId);
}
