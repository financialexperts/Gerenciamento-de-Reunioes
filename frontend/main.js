import { state } from './state/store.js';
import { esperar } from './shared/dom.js';
import { iniciarAutenticacao, sair } from './features/auth/auth.js';
import { atualizarConta, esconderApp, iniciarShell, mostrarApp, trocarTela } from './features/app/shell.js';
import {
  iniciarRotas, irParaCategoria, irParaProfessor, irParaReuniao, limparRota, rotaAtual, voltarParaCategoria, voltarParaLista,
  voltarParaProfessor,
} from './features/app/rotas.js';
import { adicionarProfessor, carregarAlinhamento, focarProfessor, iniciarAlinhamento, limparAlinhamento } from './features/alinhamento/alinhamentoView.js';
import { abrirProfessor, adicionarCategoria, iniciarProfessor, limparProfessor, permitirNovaCategoria } from './features/professores/professorView.js';
import { iniciarNovoProfessor, permitirCadastro } from './features/professores/novoProfessor.js';
import { iniciarNovaCategoria } from './features/categorias/novaCategoria.js';
import {
  abrirReunioes, adicionarReuniao, iniciarReunioes, limparReunioes, permitirAnotacoes, permitirNovaReuniao,
} from './features/reunioes/reunioesView.js';
import { fecharNovaReuniao, iniciarNovaReuniao } from './features/reunioes/novaReuniao.js';
import {
  abrirAnotacoes, iniciarAnotacoes, limparAnotacoes, sairDasAnotacoes, salvarAnotacoesPendentes,
} from './features/anotacoes/anotacoesView.js';

// Ponto de partida: liga as telas, decide pela sessão entre o login e o
// aplicativo e, dentro dele, mostra a tela do endereço (lista de
// professores, a página de um professor, a de uma categoria dele ou as
// anotações de uma reunião).

let rotaMostrada = null;

// Antes de sair da conta, as anotações que faltam são salvas (sem prender
// a saída por mais de alguns segundos se a internet caiu: o rascunho fica
// no aparelho).
iniciarShell({
  async aoSair() {
    await Promise.race([salvarAnotacoesPendentes(), esperar(4000)]);
    sair();
  },
  aoAbrirAlinhamento: voltarParaLista,
});
iniciarAlinhamento({ aoAbrirProfessor: irParaProfessor });
iniciarProfessor({ aoVoltar: voltarParaLista, aoAbrirCategoria: irParaCategoria });
iniciarReunioes({ aoVoltar: voltarParaProfessor, aoVoltarParaLista: voltarParaLista, aoAbrirReuniao: irParaReuniao });
iniciarAnotacoes({ aoVoltar: voltarParaCategoria });
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
    // Cadastrar professor, criar categoria ou reunião e fazer anotações é
    // coisa de admin, como no Sistema de Presença.
    const admin = state.perfil?.papel === 'admin';
    permitirCadastro(admin);
    permitirNovaCategoria(admin);
    permitirNovaReuniao(admin);
    permitirAnotacoes(admin);
  },
  aoSair() {
    permitirCadastro(false);
    permitirNovaCategoria(false);
    permitirNovaReuniao(false);
    permitirAnotacoes(false);
    state.usuario = null;
    state.perfil = null;
    limparAlinhamento();
    limparProfessor();
    limparReunioes();
    limparAnotacoes();
    limparRota();
    rotaMostrada = null;
    document.title = 'Gestão de Reuniões';
    esconderApp();
  },
});

// Mostra a tela do endereço atual. Roda ao entrar, ao clicar num
// professor, numa categoria ou numa reunião e no Voltar/Avançar do
// navegador.
function mostrarRota(rota) {
  if (!state.usuario) return; // na tela de login o endereço espera o login
  const anterior = rotaMostrada;
  rotaMostrada = rota;
  // Voltar do navegador com a janela aberta: ela não fica sobre outra tela.
  fecharNovaReuniao();
  // Saindo das anotações, o que falta é salvo na hora.
  const salvando = anterior?.tela === 'anotacoes' ? sairDasAnotacoes() : null;
  trocarTela(rota.tela);

  if (rota.tela === 'anotacoes') {
    abrirAnotacoes(rota);
    return;
  }
  if (rota.tela === 'categoria') {
    const voltandoDaReuniao = anterior?.tela === 'anotacoes'
      && anterior.professorId === rota.professorId && anterior.categoriaId === rota.categoriaId;
    abrirReunioes(rota.professorId, rota.categoriaId, { deReuniao: voltandoDaReuniao ? anterior.reuniaoId : null, salvando });
    return;
  }
  if (rota.tela === 'professor') {
    const voltandoDaCategoria = anterior?.tela === 'categoria' && anterior.professorId === rota.professorId;
    abrirProfessor(rota.professorId, { deCategoria: voltandoDaCategoria ? anterior.categoriaId : null });
    return;
  }
  document.title = 'Gestão de Reuniões';
  if (anterior?.tela && anterior.tela !== 'alinhamento') focarProfessor(anterior.professorId);
}
