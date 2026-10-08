// @ts-check
/**
 * Prévia de [[TC-042]] ao passar o mouse: título, tipo, status, progresso, última rodada, publicação e Jira —
 * sem abrir a aba. Só desenha; quem sabe achar o documento é o `resolve` (índice da pasta, abas abertas).
 */

/** @typedef {import('../markdown/linkInfo.ts').LinkCard} LinkCard */

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const SHOW_DELAY = 350;
const HIDE_DELAY = 250;

/**
 * @param {{ root: HTMLElement, resolve: (target: string) => LinkCard | null, openLink?: (url: string) => void }} deps
 */
export function createLinkPreview({ root, resolve, openLink }) {
  const card = document.createElement('div');
  card.className = 'link-preview';
  card.hidden = true;
  card.setAttribute('role', 'tooltip');
  document.body.appendChild(card);

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let showTimer;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let hideTimer;
  /** @type {HTMLElement | null} */
  let anchor = null;

  /** @param {HTMLElement} a */
  function draw(a) {
    const target = a.dataset.wikilink || '';
    const info = resolve(target);
    if (!info) {
      card.innerHTML = `<div class="lp-head"><span class="lp-type">Link</span><span class="lp-id">${esc(target)}</span></div>
        <div class="lp-missing">Não encontrado na pasta de trabalho. Crie o documento (ex.: no Preview, <kbd>/</kbd> → modelo) ou corrija o link.</div>`;
    } else {
      const rows = [
        info.progress ? `<div class="lp-row">📊 ${esc(info.progress)}</div>` : '',
        info.last ? `<div class="lp-row">🔁 Última rodada: ${info.last.round}${info.last.date ? ` — ${esc(info.last.date)}` : ''}${info.last.overall ? ` — <code class="badge badge-${esc(info.last.overall.toLowerCase())}">${esc(info.last.overall)}</code>` : ''}</div>` : '',
        info.published ? `<div class="lp-row">${esc(info.published)}</div>` : '',
        info.jira.length ? `<div class="lp-row">🎫 ${info.jira.map((j) => `<a href="${esc(j.url)}" data-lp-url="${esc(j.url)}" title="Abrir no Jira">${esc(j.key)} ↗</a>`).join(' ')}</div>` : '',
      ].join('');
      card.innerHTML = `<div class="lp-head"><span class="lp-type">${esc(info.typeLabel)}</span>${info.id ? `<span class="lp-id">${esc(info.id)}</span>` : ''}${info.status ? (info.statusKind ? `<code class="badge badge-${info.statusKind}">${esc(info.status)}</code>` : `<span class="lp-chip">${esc(info.status)}</span>`) : ''}</div>
        ${info.title ? `<div class="lp-title">${esc(info.title)}</div>` : ''}
        ${info.app || info.path ? `<div class="lp-path">${info.app ? `🧩 ${esc(info.app)} · ` : ''}${esc(info.path)}</div>` : ''}
        ${rows}
        <div class="lp-foot">clique abre numa aba · <kbd>Ctrl</kbd>+clique mostra ao lado</div>`;
    }
    card.hidden = false;
    const r = a.getBoundingClientRect();
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const below = r.bottom + 8 + h < window.innerHeight;
    card.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - 6 - h)}px`;
    card.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left))}px`;
  }

  function hide() { clearTimeout(showTimer); card.hidden = true; anchor = null; }

  root.addEventListener('mouseover', (event) => {
    const a = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('a.wikilink'));
    if (!a) return;
    clearTimeout(hideTimer);
    if (a === anchor) return;
    clearTimeout(showTimer);
    anchor = a;
    showTimer = setTimeout(() => { if (anchor === a && a.isConnected) draw(a); }, SHOW_DELAY);
  });
  root.addEventListener('mouseout', (event) => {
    const a = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('a.wikilink'));
    if (!a || a.contains(/** @type {Node | null} */ (event.relatedTarget))) return;
    clearTimeout(showTimer);
    hideTimer = setTimeout(hide, HIDE_DELAY);
  });
  // o mouse pode ir para o cartão (ex.: clicar no ticket do Jira)
  card.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  card.addEventListener('mouseleave', () => { hideTimer = setTimeout(hide, HIDE_DELAY); });
  card.addEventListener('click', (event) => {
    const u = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('[data-lp-url]'));
    if (u) { event.preventDefault(); openLink?.(u.dataset.lpUrl || ''); hide(); }
  });
  root.addEventListener('click', () => hide(), true);
  window.addEventListener('scroll', () => { if (!card.hidden) hide(); }, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !card.hidden) hide(); }, true);

  return { hide };
}
