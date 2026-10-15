import { state } from '../../state/store.js';
import { buscarCategorias } from '../../../backend/api/categoriasRepo.js';

// As categorias de reunião (Feedback, Atualização de aulas…): uma lista
// só, a mesma dentro de todas as reuniões, guardada em state.categorias.
// As páginas do professor, da reunião e das anotações usam; quem abre
// primeiro carrega, e as outras aproveitam a mesma carga.

let carga = null;   // carga em andamento (evita duas em paralelo)
let geracao = 0;    // muda ao sair: descarta a resposta de uma carga antiga

// Devolve { ok, mudou } ou { ok: false, erro }.
export function carregarCategorias() {
  if (!carga) {
    const minhaGeracao = geracao;
    const promessa = buscarCategorias()
      .then(lista => {
        if (minhaGeracao !== geracao) return { ok: false, erro: null };
        const mudou = JSON.stringify(lista) !== JSON.stringify(state.categorias);
        state.categorias = lista;
        return { ok: true, mudou };
      }, erro => {
        console.error('Erro ao carregar as categorias:', erro);
        return { ok: false, erro };
      })
      .finally(() => {
        if (carga === promessa) carga = null;
      });
    carga = promessa;
  }
  return carga;
}

export function categoriaPorId(id) {
  return state.categorias?.find(categoria => String(categoria.id) === String(id)) ?? null;
}

// Categoria recém-criada: entra no fim da lista.
export function incluirCategoria(categoria) {
  state.categorias = [...(state.categorias ?? []), categoria];
}

// Ao sair da conta: esquece a lista da sessão anterior.
export function esquecerCategorias() {
  geracao++;
  carga = null;
  state.categorias = null;
}
