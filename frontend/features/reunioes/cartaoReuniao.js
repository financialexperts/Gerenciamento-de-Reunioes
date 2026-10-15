import { fimDaReuniao, linkDaChamada, situacaoDaReuniao } from '../../../backend/domain/reunioes.js';
import { escapeHtml } from '../../shared/dom.js';
import { simboloDoIcone } from '../categorias/icones.js';
import { diaDaSemana, diaPorExtenso, diasAte, duracaoPorExtenso, folhaDaData, hora, quandoPorExtenso } from './datas.js';

// O cartão de uma reunião, o mesmo na página do professor e no topo da
// página da reunião: o dia em destaque numa folha de calendário, o
// horário, presencial (sala) ou online (link clicável) e a pauta. Na
// página do professor, para admin, o cartão inteiro abre a reunião e
// mostra embaixo o começo das anotações de cada categoria.

// "Quinta-feira, 8 de outubro" (com o ano, se não for o ano corrente).
export function diaDaReuniao(reuniao, agora = new Date()) {
  const inicio = new Date(reuniao.inicio);
  return `${diaDaSemana(inicio)}, ${diaPorExtenso(inicio, { agora })}`;
}

// idElemento: o id do cartão, para voltar o foco a ele (só na lista).
// titulo: a tag do dia ('h3' na lista, abaixo de "Próximas"; 'p' quando o
// título da página já diz qual é a reunião). href: o dia vira o link da
// reunião e cobre o cartão inteiro. previas: o HTML de previasHtml().
export function reuniaoHtml(reuniao, { agora = new Date(), tag = 'li', idElemento = null, titulo = 'h3', href = null, previas = '' } = {}) {
  const inicio = new Date(reuniao.inicio);
  const situacao = situacaoDaReuniao(reuniao, agora);
  const hoje = diasAte(inicio, agora) === 0;
  const quando = situacao === 'agora' ? 'Agora' : quandoPorExtenso(inicio, agora);
  const dia = diaDaReuniao(reuniao, agora);
  const horario = `${hora(inicio)} às ${hora(fimDaReuniao(reuniao))} · ${duracaoPorExtenso(reuniao.duracao_min)}`;
  const online = reuniao.formato === 'online';
  const nome = href
    ? `<a class="reuniao__abrir" href="${escapeHtml(href)}" data-id="${escapeHtml(reuniao.id)}">${escapeHtml(dia)}</a>`
    : escapeHtml(dia);
  const classes = ['reuniao', href && 'reuniao--abre', previas && 'reuniao--com-previas'].filter(Boolean).join(' ');

  return `
    <${tag} class="${classes}"${idElemento ? ` id="${escapeHtml(idElemento)}"` : ''} data-situacao="${situacao}"${hoje ? ' data-hoje' : ''}>
      ${folhaHtml(inicio)}
      <div class="reuniao__info">
        <div class="reuniao__topo">
          <${titulo} class="reuniao__dia">${nome}</${titulo}>
          <span class="reuniao__quando">${escapeHtml(quando)}</span>
        </div>
        <p class="reuniao__linha reuniao__linha--hora">
          <svg class="icone" aria-hidden="true"><use href="#c-relogio"/></svg>
          <span>${escapeHtml(horario)}</span>
        </p>
        <p class="reuniao__linha">
          <svg class="icone" aria-hidden="true"><use href="#${online ? 'i-video' : 'i-pino'}"/></svg>
          <span>${online ? 'Online' : 'Presencial'}${localHtml(reuniao.local, online)}</span>
        </p>
        ${reuniao.pauta ? `<p class="reuniao__pauta">${escapeHtml(reuniao.pauta)}</p>` : ''}
      </div>
      ${previas}
    </${tag}>`;
}

// O começo das anotações de cada categoria, na ordem das categorias (uma
// linha por parágrafo, até duas). A categoria ainda sem nada escrito ocupa
// uma linha só, apagada.
export function previasHtml(categorias, resumosDaReuniao) {
  if (!categorias?.length) return '';
  const itens = categorias.map(categoria => {
    const resumo = resumosDaReuniao?.get(String(categoria.id))?.trim();
    return `
        <li class="previa${resumo ? '' : ' previa--vazia'}">
          <span class="previa__icone" aria-hidden="true"><svg class="icone"><use href="#${simboloDoIcone(categoria.icone)}"/></svg></span>
          <div class="previa__corpo">
            <p class="previa__nome">${escapeHtml(categoria.nome)}</p>
            <p class="previa__texto">${resumo ? escapeHtml(resumo) : 'Sem anotações'}</p>
          </div>
        </li>`;
  }).join('');
  return `
      <ul class="reuniao__previas" role="list" aria-label="Anotações por categoria">${itens}
      </ul>`;
}

// O esqueleto de um cartão, enquanto as reuniões não chegam.
export function reuniaoEsqueletoHtml(tag = 'li') {
  return `
    <${tag} class="reuniao reuniao--esqueleto" aria-hidden="true">
      <span class="folha-data"></span>
      <div class="reuniao__info">
        <span class="linha-esqueleto l1"></span>
        <span class="linha-esqueleto l2"></span>
      </div>
    </${tag}>`;
}

// A folha de calendário: mês em vermelho, o dia grande e o dia da semana.
// O leitor de tela lê o dia por extenso no título da reunião.
function folhaHtml(data) {
  const folha = folhaDaData(data);
  return `
      <span class="folha-data" aria-hidden="true">
        <span class="folha-data__mes">${escapeHtml(folha.mes)}</span>
        <span class="folha-data__dia">${escapeHtml(folha.dia)}</span>
        <span class="folha-data__semana">${escapeHtml(folha.semana)}</span>
      </span>`;
}

// Sala, ou o link da chamada (só http/https vira link clicável).
function localHtml(local, online) {
  if (!local) return '';
  const link = online ? linkDaChamada(local) : null;
  if (!link) return ` · ${escapeHtml(local)}`;
  return ` · <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(local)}</a>`;
}
