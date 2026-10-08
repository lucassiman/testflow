// @ts-check
/**
 * Galeria de evidências: os prints da pasta de trabalho (mais recentes primeiro), com miniatura, pasta,
 * data e em quais documentos aparecem. Serve para reaproveitar o print de um passo (ex.: execução) num bug,
 * e para consertar um print que não aparece (procura pelo nome do arquivo).
 */

/** @typedef {import('../io/workspace.js').WorkspaceImage} WorkspaceImage */

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** @param {unknown} s */
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** @param {number} ts */
function when(ts) {
  const d = new Date(ts);
  const today = new Date();
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === today.toDateString() ? `hoje ${hm}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hm}`;
}

/**
 * @param {{
 *   images: WorkspaceImage[],
 *   title?: string,
 *   query?: string,
 *   usedBy?: (path: string) => string[],
 *   multi?: boolean,
 *   canLink?: boolean,
 *   action?: string,
 *   hint?: string,
 *   preselect?: boolean,
 *   danger?: boolean,
 * }} opts
 * @returns {Promise<{ picked: WorkspaceImage[], copy: boolean } | null>}
 */
export function openEvidencePicker({ images, title = 'Evidências da pasta de trabalho', query = '', usedBy, multi = true, canLink = true, action = 'Inserir', hint = '', preselect = false, danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'review-overlay evp-overlay';
    overlay.innerHTML = `
      <div class="review-dialog evp-dialog" role="dialog" aria-label="${esc(title)}">
        <div class="review-head"><strong>🖼 ${esc(title)}</strong><span class="review-steps" data-evp="count"></span>
          <button type="button" class="review-x" data-act="close" title="Fechar (Esc)">×</button></div>
        <div class="evp-bar">
          <input type="search" class="review-extra evp-search" placeholder="Filtrar por nome, pasta ou documento (ex.: TC-042, login, 2026-09-28)…" value="${esc(query)}" spellcheck="false">
        </div>
        ${hint ? `<p class="review-help evp-hint">${esc(hint)}</p>` : ''}
        <div class="evp-grid" data-evp="grid"></div>
        <div class="review-foot">
          ${canLink ? `<label class="evp-copy" title="Copiar deixa o documento independente (o print vai junto se ele for movido, publicado ou exportado). Sem copiar, o link aponta para o print do outro documento."><input type="checkbox" data-evp="copy" checked> Copiar para as evidências deste documento</label>` : ''}
          <span class="review-grow"></span>
          <button type="button" data-act="close">Cancelar</button>
          <button type="button" data-act="ok" class="${danger ? 'danger' : 'primary'}" disabled>${esc(action)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const q = (/** @type {string} */ s) => /** @type {HTMLElement} */ (overlay.querySelector(s));
    const grid = q('[data-evp="grid"]');
    const search = /** @type {HTMLInputElement} */ (q('.evp-search'));
    /** @type {Set<string>} */
    const chosen = new Set(preselect ? images.map((im) => im.path) : []);
    /** @type {Map<string, string>} */
    const urls = new Map();
    const used = new Map(images.map((im) => [im.path, usedBy?.(im.path) || []]));

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const img = /** @type {HTMLImageElement} */ (e.target);
        io.unobserve(img);
        const im = images.find((x) => x.path === img.dataset.path);
        if (!im) continue;
        im.handle.getFile().then((f) => {
          const url = URL.createObjectURL(f);
          urls.set(im.path, url);
          img.src = url;
        }).catch(() => { img.alt = 'sem acesso'; });
      }
    }, { root: grid, rootMargin: '200px' });

    function draw() {
      const t = norm(search.value.trim());
      const list = images.filter((im) => !t || norm(`${im.path} ${(used.get(im.path) || []).join(' ')}`).includes(t)).slice(0, 400);
      q('[data-evp="count"]').textContent = `${list.length}${list.length === 400 ? '+' : ''} de ${images.length} imagem(ns)`;
      grid.innerHTML = list.length ? list.map((im) => {
        const docs = used.get(im.path) || [];
        const folder = im.path.split('/').slice(0, -1).join('/') || '/';
        return `<button type="button" class="evp-card${chosen.has(im.path) ? ' on' : ''}" data-path="${esc(im.path)}" title="${esc(im.path)}">
          <span class="evp-thumb">${urls.has(im.path) ? `<img src="${esc(urls.get(im.path))}" alt="">` : `<img data-path="${esc(im.path)}" alt="">`}</span>
          <span class="evp-name">${esc(im.name)}</span>
          <span class="evp-meta">${esc(when(im.lastModified))} · ${esc(folder)}</span>
          ${docs.length ? `<span class="evp-docs">📄 ${esc(docs.slice(0, 3).join(', '))}${docs.length > 3 ? '…' : ''}</span>` : ''}
        </button>`;
      }).join('') : `<p class="review-help evp-empty">${images.length ? 'Nenhuma imagem com esse filtro.' : 'Nenhum print na pasta de trabalho ainda. Cole um print (Ctrl+V) ou use 📸 Capturar num documento salvo: ele vai para evidencias/ ao lado do documento e passa a aparecer aqui.'}</p>`;
      grid.querySelectorAll('img[data-path]').forEach((img) => io.observe(img));
      update();
    }
    function update() {
      const ok = /** @type {HTMLButtonElement} */ (q('[data-act="ok"]'));
      ok.disabled = !chosen.size;
      ok.textContent = multi && chosen.size > 1 ? `${action} (${chosen.size})` : action;
    }
    function done(/** @type {boolean} */ accept) {
      io.disconnect();
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      urls.forEach((u) => URL.revokeObjectURL(u));
      if (!accept) { resolve(null); return; }
      const picked = images.filter((im) => chosen.has(im.path));
      const copy = !canLink || !!/** @type {HTMLInputElement | null} */ (overlay.querySelector('[data-evp="copy"]'))?.checked;
      resolve({ picked, copy });
    }
    /** @param {KeyboardEvent} e */
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      else if (e.key === 'Enter' && chosen.size && document.activeElement !== search && !danger) { e.preventDefault(); e.stopPropagation(); done(true); }
      else if (e.ctrlKey || e.metaKey || e.altKey) e.stopPropagation();
    }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (event) => {
      const t = /** @type {HTMLElement} */ (event.target);
      if (t === overlay) { done(false); return; }
      const card = /** @type {HTMLElement | null} */ (t.closest('.evp-card'));
      if (card) {
        const p = card.dataset.path || '';
        if (!multi) chosen.clear();
        if (chosen.has(p)) chosen.delete(p); else chosen.add(p);
        grid.querySelectorAll('.evp-card').forEach((c) => c.classList.toggle('on', chosen.has(/** @type {HTMLElement} */ (c).dataset.path || '')));
        update();
        return;
      }
      const act = /** @type {HTMLElement | null} */ (t.closest('[data-act]'))?.dataset.act;
      if (act === 'close') done(false);
      else if (act === 'ok') done(true);
    });
    overlay.addEventListener('dblclick', (event) => {
      if (danger) return; // ação que apaga: só pelo botão
      const card = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest('.evp-card'));
      if (!card) return;
      chosen.clear();
      chosen.add(card.dataset.path || '');
      done(true);
    });
    search.addEventListener('input', draw);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = /** @type {HTMLElement | null} */ (grid.querySelector('.evp-card'));
        if (danger) return; // ação que apaga: só pelo botão
        if (first && !chosen.size) first.click(); else if (chosen.size) done(true);
      }
    });
    draw();
    requestAnimationFrame(() => search.focus());
  });
}
