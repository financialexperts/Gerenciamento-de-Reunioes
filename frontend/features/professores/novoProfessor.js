import { criarContaAuth, criarPerfilProfessor } from '../../../backend/api/professoresRepo.js';
import { ocupado } from '../../shared/dom.js';

// "Novo professor": cria o login (Supabase Auth) e a linha em `professores`
// exatamente como o Sistema de Presença faz, então o professor aparece nos
// dois sistemas e entra nos dois com o mesmo e-mail e senha. Só para admin —
// a mesma regra de quem cadastra professor no Sistema de Presença.

// Senha padrão de professor novo no Sistema de Presença (decisão de produto
// registrada no README de lá); o professor troca em "Esqueci minha senha".
const SENHA_INICIAL = 'Teste1234';
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const botaoAbrir = document.getElementById('btn-novo-professor');
const dialogo = document.getElementById('dialogo-novo-professor');
const form = document.getElementById('form-novo-professor');
const concluido = document.getElementById('novo-professor-concluido');
const erro = document.getElementById('novo-professor-erro');
const botaoSalvar = document.getElementById('btn-salvar-novo-professor');
const campo = id => document.getElementById(id);

let aoCadastrar = () => {};
let cadastrado = null; // entregue à lista quando a janela fecha
let salvando = false;

export function iniciarNovoProfessor(opcoes) {
  aoCadastrar = opcoes.aoCadastrar;
  botaoAbrir.addEventListener('click', abrir);
  form.addEventListener('submit', cadastrar);
  campo('btn-cancelar-novo-professor').addEventListener('click', () => dialogo.close());
  campo('btn-concluir-novo-professor').addEventListener('click', () => dialogo.close());

  // Esc e clique fora fecham, menos no meio do salvamento.
  dialogo.addEventListener('cancel', evento => {
    if (salvando) evento.preventDefault();
  });
  dialogo.addEventListener('click', evento => {
    if (evento.target === dialogo && !salvando) dialogo.close();
  });
  dialogo.addEventListener('close', () => {
    if (!cadastrado) return;
    const professor = cadastrado;
    cadastrado = null;
    aoCadastrar(professor);
  });
  form.addEventListener('input', evento => evento.target.removeAttribute?.('aria-invalid'));
}

export function permitirCadastro(permitido) {
  botaoAbrir.hidden = !permitido;
  if (!permitido && dialogo.open) dialogo.close();
}

function abrir() {
  form.reset();
  campo('novo-senha').value = SENHA_INICIAL;
  esconderErro();
  form.hidden = false;
  concluido.hidden = true;
  dialogo.showModal();
  campo('novo-nome').focus();
}

async function cadastrar(evento) {
  evento.preventDefault();
  esconderErro();
  const nome = campo('novo-nome').value.trim().replace(/\s+/g, ' ');
  const email = campo('novo-email').value.trim();
  const senha = campo('novo-senha').value;
  const papel = form.elements.papel.value;

  if (!nome) return mostrarErro('Digite o nome do professor.', 'novo-nome');
  if (!EMAIL_VALIDO.test(email)) return mostrarErro('Digite o e-mail no formato nome@exemplo.com.', 'novo-email');
  if (senha.length < 6) return mostrarErro('A senha inicial precisa de pelo menos 6 caracteres.', 'novo-senha');

  salvando = true;
  const liberar = ocupado(botaoSalvar, 'Cadastrando…');
  try {
    const conta = await criarContaAuth(email, senha);
    const problema = problemaDaConta(conta);
    if (problema) return mostrarErro(problema.texto, problema.campo);

    const userId = conta.corpo.user?.id ?? conta.corpo.id;
    const { data, error } = await criarPerfilProfessor({ nome, email, papel, user_id: userId });
    if (error) {
      console.error('Conta criada, mas o perfil não foi salvo:', error);
      return mostrarErro('A conta de acesso foi criada, mas o professor não entrou na lista: o banco recusou o cadastro. Peça para incluir este e-mail na tabela de professores no Supabase.');
    }

    cadastrado = data;
    mostrarConcluido(data, senha, !conta.corpo.access_token);
  } catch (falha) {
    console.error('Erro ao cadastrar professor:', falha);
    mostrarErro('Sem conexão com o servidor. Verifique a internet e tente de novo.');
  } finally {
    salvando = false;
    liberar();
  }
}

// O que houve e como resolver, a partir da resposta do cadastro do Supabase.
function problemaDaConta({ status, corpo }) {
  if (status >= 200 && status < 300) {
    const usuario = corpo.user ?? corpo;
    // Com confirmação de e-mail ligada, e-mail repetido volta como "sucesso"
    // com uma conta fictícia sem identidades (proteção do Supabase).
    if (Array.isArray(usuario.identities) && usuario.identities.length === 0) {
      return { texto: 'Já existe uma conta com este e-mail.', campo: 'novo-email' };
    }
    if (!usuario.id) return { texto: 'O Supabase não devolveu a conta criada. Tente de novo.' };
    return null;
  }

  const codigo = corpo.error_code ?? corpo.code;
  const mensagem = String(corpo.msg ?? corpo.message ?? '');
  if (codigo === 'user_already_exists' || codigo === 'email_exists' || /already registered/i.test(mensagem)) {
    return { texto: 'Já existe uma conta com este e-mail.', campo: 'novo-email' };
  }
  if (codigo === 'weak_password') {
    return { texto: 'O Supabase recusou a senha inicial por ser fraca. Use uma senha maior, misturando letras e números.', campo: 'novo-senha' };
  }
  if (codigo === 'email_address_invalid' || codigo === 'validation_failed') {
    return { texto: 'O Supabase não aceitou este e-mail. Confira se está escrito certo.', campo: 'novo-email' };
  }
  if (codigo === 'signup_disabled') {
    return { texto: 'O cadastro de contas novas está desligado no Supabase (Authentication › Sign In / Providers).' };
  }
  if (status === 429) return { texto: 'Muitos cadastros seguidos. Aguarde alguns minutos e tente de novo.' };
  console.error('Erro ao criar a conta de acesso:', status, corpo);
  return { texto: 'Não foi possível criar a conta de acesso. Tente de novo em instantes.' };
}

function mostrarErro(texto, idCampo) {
  erro.textContent = texto;
  erro.hidden = false;
  if (idCampo) {
    const entrada = campo(idCampo);
    entrada.setAttribute('aria-invalid', 'true');
    entrada.focus();
    entrada.select();
  }
}

function esconderErro() {
  erro.hidden = true;
  for (const entrada of form.querySelectorAll('[aria-invalid]')) entrada.removeAttribute('aria-invalid');
}

// Confirmação dentro da própria janela (sem aviso que some sozinho), com os
// dados de acesso para repassar ao professor.
function mostrarConcluido(professor, senha, precisaConfirmarEmail) {
  campo('concluido-nome').textContent = professor.nome;
  campo('concluido-email').textContent = professor.email;
  campo('concluido-senha').textContent = senha;
  campo('concluido-confirmacao').hidden = !precisaConfirmarEmail;
  form.hidden = true;
  concluido.hidden = false;
  campo('btn-concluir-novo-professor').focus();
}
