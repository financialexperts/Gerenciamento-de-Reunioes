import { state } from '../../state/store.js';
import { criarCategoria, faltaTabelaDeCategorias } from '../../../backend/api/categoriasRepo.js';
import { escapeHtml, normalizar, ocupado } from '../../shared/dom.js';
import { ICONES_CATEGORIA, ICONE_PADRAO } from './icones.js';

// "Nova categoria": a categoria entra na lista única de categorias de
// reunião e passa a aparecer para todos os professores. O botão só aparece
// para admin; quem garante a regra de verdade é o RLS
// (sql/categorias_reuniao.sql).

const dialogo = document.getElementById('dialogo-nova-categoria');
const form = document.getElementById('form-nova-categoria');
const campoNome = document.getElementById('categoria-nome');
const descricao = document.getElementById('nova-categoria-descricao');
const erro = document.getElementById('nova-categoria-erro');
const botaoSalvar = document.getElementById('btn-salvar-nova-categoria');

let aoCriar = () => {};
let criada = null; // entregue à página quando a janela fecha
let salvando = false;

export function iniciarNovaCategoria(opcoes) {
  aoCriar = opcoes.aoCriar;
  document.getElementById('escolha-icone').innerHTML = ICONES_CATEGORIA.map(opcaoIconeHtml).join('');

  form.addEventListener('submit', criar);
  document.getElementById('btn-cancelar-nova-categoria').addEventListener('click', () => dialogo.close());

  // Esc e clique fora fecham, menos no meio do salvamento.
  dialogo.addEventListener('cancel', evento => {
    if (salvando) evento.preventDefault();
  });
  dialogo.addEventListener('click', evento => {
    if (evento.target === dialogo && !salvando) dialogo.close();
  });
  dialogo.addEventListener('close', () => {
    if (!criada) return;
    const categoria = criada;
    criada = null;
    aoCriar(categoria);
  });
  campoNome.addEventListener('input', () => campoNome.removeAttribute('aria-invalid'));
}

// Aberta de dentro da página de um professor: a descrição deixa claro que a
// categoria não é só dele.
export function abrirNovaCategoria(nomeProfessor) {
  form.reset();
  esconderErro();
  descricao.textContent = nomeProfessor
    ? `Ela aparece para todos os professores, não só para ${nomeProfessor}.`
    : 'Ela aparece para todos os professores.';
  dialogo.showModal();
  campoNome.focus();
}

export function fecharNovaCategoria() {
  if (dialogo.open) dialogo.close();
}

function opcaoIconeHtml({ chave, nome }) {
  return `
    <label class="escolha-icone__opcao" title="${escapeHtml(nome)}">
      <input type="radio" name="icone" value="${chave}"${chave === ICONE_PADRAO ? ' checked' : ''}>
      <span class="escolha-icone__desenho" aria-hidden="true"><svg class="icone"><use href="#c-${chave}"/></svg></span>
      <span class="vh">${escapeHtml(nome)}</span>
    </label>`;
}

async function criar(evento) {
  evento.preventDefault();
  if (salvando) return;
  esconderErro();
  const nome = campoNome.value.trim().replace(/\s+/g, ' ');
  const icone = form.elements.icone.value || ICONE_PADRAO;

  if (!nome) return mostrarErro('Digite o nome da categoria.', true);
  // Mesma regra do banco, mas ignorando acentos: "Reunioes" e "Reuniões"
  // seriam duas categorias iguais na tela.
  const repetida = (state.categorias ?? []).find(categoria => normalizar(categoria.nome) === normalizar(nome));
  if (repetida) return mostrarErro(`Já existe a categoria “${repetida.nome}”.`, true);

  salvando = true;
  const liberar = ocupado(botaoSalvar, 'Criando…');
  try {
    const { data, error } = await criarCategoria({ nome, icone });
    if (error) {
      const problema = problemaAoCriar(error);
      return mostrarErro(problema.texto, problema.noNome);
    }
    criada = data;
    dialogo.close();
  } catch (falha) {
    console.error('Erro ao criar categoria:', falha);
    mostrarErro('Sem conexão com o servidor. Verifique a internet e tente de novo.');
  } finally {
    salvando = false;
    liberar();
  }
}

// O que houve e como resolver, a partir do erro do banco.
function problemaAoCriar(falha) {
  if (falha.code === '23505') return { texto: 'Já existe uma categoria com esse nome.', noNome: true };
  if (falha.code === '23514') return { texto: 'Use um nome de até 60 caracteres.', noNome: true };
  if (falha.code === '42501') {
    return { texto: 'Só administradores podem criar categorias, e o banco não reconheceu sua conta como administrador.' };
  }
  if (faltaTabelaDeCategorias(falha)) {
    return { texto: 'As categorias ainda não foram configuradas no banco de dados. Rode o arquivo sql/categorias_reuniao.sql no Supabase e tente de novo.' };
  }
  console.error('Erro ao criar categoria:', falha);
  if (!navigator.onLine || /fetch|network/i.test(falha.message ?? '')) {
    return { texto: 'Sem conexão com o servidor. Verifique a internet e tente de novo.' };
  }
  return { texto: 'Não foi possível criar a categoria. Tente de novo em instantes.' };
}

function mostrarErro(texto, noNome = false) {
  erro.textContent = texto;
  erro.hidden = false;
  if (noNome) {
    campoNome.setAttribute('aria-invalid', 'true');
    campoNome.focus();
    campoNome.select();
  }
}

function esconderErro() {
  erro.hidden = true;
  campoNome.removeAttribute('aria-invalid');
}
