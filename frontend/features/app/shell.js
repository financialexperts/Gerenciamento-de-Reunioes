import { iniciais } from '../../shared/dom.js';

// Estrutura do aplicativo: barra lateral (mostrar/ocultar), efeito de borda
// de rolagem no cabeçalho e o menu da conta no canto superior direito.

const app = document.getElementById('app');
const barra = document.getElementById('barra-lateral');
const btnBarra = document.getElementById('btn-barra-lateral');
const veu = document.getElementById('veu');
const principal = document.getElementById('alinhamento');
const cabecalho = document.getElementById('cabecalho');
const btnConta = document.getElementById('btn-conta');
const menuConta = document.getElementById('menu-conta');

// Mesmo corte do app.css: abaixo dele a barra vira painel sobreposto.
const janelaEstreita = matchMedia('(max-width: 899px)');
const CHAVE_BARRA_OCULTA = 'gestao-reunioes:barra-lateral-oculta';

export function iniciarShell({ aoSair }) {
  app.toggleAttribute('data-barra-oculta', lerPreferenciaBarra());

  btnBarra.addEventListener('click', alternarBarra);
  veu.addEventListener('click', () => fecharBarraSobreposta(true));
  barra.addEventListener('click', evento => {
    if (janelaEstreita.matches && evento.target.closest('a')) fecharBarraSobreposta(false);
  });
  document.addEventListener('keydown', evento => {
    if (evento.key === 'Escape' && janelaEstreita.matches && app.hasAttribute('data-barra-aberta')) {
      fecharBarraSobreposta(true);
    }
  });
  janelaEstreita.addEventListener('change', () => {
    app.removeAttribute('data-barra-aberta');
    sincronizarBarra();
  });

  // O efeito só aparece quando há conteúdo passando por baixo do cabeçalho.
  principal.addEventListener('scroll', () => {
    cabecalho.classList.toggle('rolado', principal.scrollTop > 4);
  }, { passive: true });
  // Ao navegar pelo teclado, o cartão focado não fica escondido sob o cabeçalho fixo.
  new ResizeObserver(() => {
    principal.style.setProperty('--altura-cabecalho', `${cabecalho.offsetHeight}px`);
  }).observe(cabecalho);

  menuConta.addEventListener('beforetoggle', evento => {
    if (evento.newState === 'open') posicionarMenuConta();
  });
  addEventListener('resize', () => {
    if (menuConta.matches(':popover-open')) posicionarMenuConta();
  });
  document.getElementById('btn-sair').addEventListener('click', () => {
    menuConta.hidePopover();
    aoSair();
  });

  sincronizarBarra();
}

export function mostrarApp() {
  app.hidden = false;
  app.classList.add('entrando');
  app.addEventListener('animationend', () => app.classList.remove('entrando'), { once: true });
  principal.scrollTop = 0;
}

export function esconderApp() {
  if (menuConta.matches(':popover-open')) menuConta.hidePopover();
  app.hidden = true;
  app.removeAttribute('data-barra-aberta');
  sincronizarBarra();
}

export function atualizarConta({ nome, email }) {
  const titulo = nome || email || '';
  const monograma = iniciais(titulo);
  document.getElementById('conta-avatar').textContent = monograma;
  document.getElementById('menu-conta-avatar').textContent = monograma;
  document.getElementById('menu-conta-nome').textContent = titulo;
  const linhaEmail = document.getElementById('menu-conta-email');
  linhaEmail.textContent = nome ? email : '';
  linhaEmail.hidden = !nome;
  btnConta.setAttribute('aria-label', `Conta de ${titulo}`);
  btnConta.title = titulo;
}

// ---------- Barra lateral ----------

function alternarBarra() {
  if (janelaEstreita.matches) {
    const abrir = !app.hasAttribute('data-barra-aberta');
    app.toggleAttribute('data-barra-aberta', abrir);
    sincronizarBarra();
    if (abrir) barra.querySelector('a')?.focus();
    return;
  }
  const ocultar = !app.hasAttribute('data-barra-oculta');
  app.toggleAttribute('data-barra-oculta', ocultar);
  salvarPreferenciaBarra(ocultar);
  sincronizarBarra();
}

function fecharBarraSobreposta(devolverFoco) {
  app.removeAttribute('data-barra-aberta');
  sincronizarBarra();
  if (devolverFoco) btnBarra.focus();
}

// Uma fonte da verdade para o estado visível: botão, leitor de tela e
// ordem de foco concordam (barra escondida fica inerte).
function sincronizarBarra() {
  const sobreposta = janelaEstreita.matches && app.hasAttribute('data-barra-aberta');
  const visivel = janelaEstreita.matches ? sobreposta : !app.hasAttribute('data-barra-oculta');
  btnBarra.setAttribute('aria-expanded', String(visivel));
  btnBarra.title = visivel ? 'Ocultar barra lateral' : 'Mostrar barra lateral';
  barra.inert = !visivel;
  principal.inert = sobreposta; // com o painel aberto, o foco fica nele
}

function lerPreferenciaBarra() {
  try { return localStorage.getItem(CHAVE_BARRA_OCULTA) === '1'; } catch { return false; }
}

function salvarPreferenciaBarra(oculta) {
  try {
    if (oculta) localStorage.setItem(CHAVE_BARRA_OCULTA, '1');
    else localStorage.removeItem(CHAVE_BARRA_OCULTA);
  } catch { /* armazenamento bloqueado: a preferência vale só nesta visita */ }
}

// ---------- Menu da conta ----------

function posicionarMenuConta() {
  const r = btnConta.getBoundingClientRect();
  menuConta.style.top = `${Math.round(r.bottom + 8)}px`;
  menuConta.style.right = `${Math.max(8, Math.round(document.documentElement.clientWidth - r.right))}px`;
}
