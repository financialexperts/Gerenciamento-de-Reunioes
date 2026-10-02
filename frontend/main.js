import { state } from './state/store.js';
import { iniciarAutenticacao, sair } from './features/auth/auth.js';
import { atualizarConta, esconderApp, iniciarShell, mostrarApp, trocarTela } from './features/app/shell.js';
import {
  iniciarRotas, irParaCategoria, irParaProfessor, limparRota, rotaAtual, voltarParaLista, voltarParaProfessor,
} from './features/app/rotas.js';
import { adicionarProfessor, carregarAlinhamento, focarProfessor, iniciarAlinhamento, limparAlinhamento } from './features/alinhamento/alinhamentoView.js';
import { abrirProfessor, adicionarCategoria, iniciarProfessor, limparProfessor, permitirNovaCategoria } from './features/professores/professorView.js';
import { iniciarNovoProfessor, permitirCadastro } from './features/professores/novoProfessor.js';
import { iniciarNovaCategoria } from './features/categorias/novaCategoria.js';
import { abrirReunioes, adicionarReuniao, iniciarReunioes, limparReunioes, permitirNovaReuniao } from './features/reunioes/reunioesView.js';
import { fecharNovaReuniao, iniciarNovaReuniao } from './features/reunioes/novaReuniao.js';

// Ponto de partida: liga as telas, decide pela sessão entre o login e o
// aplicativo e, dentro dele, mostra a tela do endereço (lista de
// professores, a página de um professor ou a de uma categoria dele).

let rotaMostrada = null;

iniciarShell({ aoSair: sair, aoAbrirAlinhamento: voltarParaLista });
iniciarAlinhamento({ aoAbrirProfessor: irParaProfessor });
iniciarProfessor({ aoVoltar: voltarParaLista, aoAbrirCategoria: irParaCategoria });
iniciarReunioes({ aoVoltar: voltarParaProfessor, aoVoltarParaLista: voltarParaLista });
iniciarNovoProfessor({ aoCadastrar: adicionarProfessor });
iniciarNovaCategoria({ aoCriar: adicionarCategoria });
iniciarNovaReuniao({ aoCriar: adicionarReuniao });
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
    // Cadastrar professor e criar categoria ou reunião é coisa de admin,
    // como no Sistema de Presença.
    const admin = state.perfil?.papel === 'admin';
    permitirCadastro(admin);
    permitirNovaCategoria(admin);
    permitirNovaReuniao(admin);
  },
  aoSair() {
    permitirCadastro(false);
    permitirNovaCategoria(false);
    permitirNovaReuniao(false);
    state.usuario = null;
    state.perfil = null;
    limparAlinhamento();
    limparProfessor();
    limparReunioes();
    limparRota();
    rotaMostrada = null;
    document.title = 'Gestão de Reuniões';
    esconderApp();
  },
});

// Mostra a tela do endereço atual. Roda ao entrar, ao clicar num professor
// ou numa categoria e no Voltar/Avançar do navegador.
function mostrarRota(rota) {
  if (!state.usuario) return; // na tela de login o endereço espera o login
  const anterior = rotaMostrada;
  rotaMostrada = rota;
  // Voltar do navegador com a janela aberta: ela não fica sobre outra tela.
  fecharNovaReuniao();
  trocarTela(rota.tela);

  if (rota.tela === 'categoria') {
    abrirReunioes(rota.professorId, rota.categoriaId);
    return;
  }
  if (rota.tela === 'professor') {
    const voltandoDaCategoria = anterior?.tela === 'categoria' && anterior.professorId === rota.professorId;
    abrirProfessor(rota.professorId, { deCategoria: voltandoDaCategoria ? anterior.categoriaId : null });
    return;
  }
  document.title = 'Gestão de Reuniões';
  if (anterior?.tela === 'professor' || anterior?.tela === 'categoria') focarProfessor(anterior.professorId);
}
