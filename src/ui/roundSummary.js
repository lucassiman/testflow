// @ts-check
/**
 * "Como foi essa rodada?": janela com os números da rodada (totais, % de sucesso, duração),
 * as falhas/bloqueios com os passos que falharam, bugs ligados e os casos pulados (SKIP).
 * Só desenha o que recebe — os dados vêm de `cycleSummary` (cycle.ts) e dos textos dos casos.
 */

/** @typedef {import('../markdown/cycle.ts').CycleSummary} CycleSummary */
/** @typedef {{ n: string, acao: string, obtido: string }} FailedStep */
/** @typedef {Record<string, { titulo?: string, steps: FailedStep[], prints: number, comentarios?: string[] }>} CaseDetails */
/** Bug ligado à rodada (pela tabela ou por citar um caso dela). @typedef {{ key: string, titulo?: string, status?: string, open: boolean, jira?: string }} RoundBug */

import { buildJiraCopy } from '../markdown/jira.ts';

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
const when = (/** @type {Date | null} */ d) => (d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '—');

/** @param {number | null} ms */
export function fmtSpan(ms) {
  if (ms == null) return '—';
  const min = Math.round(ms / 60000);
  if (min < 1) return 'menos de 1 min';
  const h = Math.floor(min / 60);
  const d = Math.floor(h / 24);
  if (d) return `${d} d ${h % 24} h`;
  return h ? `${h} h ${pad(min % 60)} min` : `${min} min`;
}

/**
 * Resumo em Markdown (para colar no Jira, e-mail ou chat).
 * @param {CycleSummary} s @param {CaseDetails} details
 */
export function summaryMarkdown(s, details = {}, linksText = '', bugs = /** @type {RoundBug[]} */ ([])) {
  const out = [
    `## ${s.titulo}`,
    '',
    `- Período: ${when(s.inicio)} → ${s.fim ? when(s.fim) : 'em andamento'} (${fmtSpan(s.duracaoMs)})`,
    `- Casos: ${s.total} — ${s.pass} PASS · ${s.fail} FAIL · ${s.blocked} BLOCKED · ${s.skip} SKIP${s.pendente ? ` · ${s.pendente} sem resultado` : ''}`,
    `- Sucesso: ${s.sucessoPct == null ? '—' : `${s.sucessoPct}%`} dos casos executados`,
    ...(linksText ? [`- Vínculos: ${linksText}`] : []),
  ];
  if (s.problemas.length) {
    out.push('', '### Falhas e bloqueios');
    for (const p of s.problemas) {
      const d = details[p.key];
      out.push(`- **${p.key}**${d?.titulo ? ` — ${d.titulo}` : ''} \`${p.status}\`${p.bugs.length ? ` — ${p.bugs.join(', ')}` : ''}`);
      for (const st of d?.steps || []) out.push(`  - Passo ${st.n}: ${st.acao}${st.obtido ? ` → ${st.obtido}` : ''}`);
    }
  }
  if (s.auto) {
    const a = s.auto;
    out.push('', `### Testes automatizados (${a.tool})`, `- ${a.total} teste(s): ${a.pass} PASS · ${a.fail} FAIL${a.blocked ? ` · ${a.blocked} BLOCKED` : ''}${a.skip ? ` · ${a.skip} SKIP` : ''}${a.flaky ? ` · ${a.flaky} flaky` : ''}${a.sucessoPct == null ? '' : ` — ${a.sucessoPct}% de sucesso`}${a.fonte ? ` (${a.fonte})` : ''}`);
    for (const f of a.falhas) out.push(`  - ${f.titulo}${f.obs ? ` → ${f.obs}` : ''}`);
  }
  const others = s.casos.filter((c) => c.status === 'PASS' || c.status === 'SKIP');
  const withNotes = others.filter((c) => details[c.key]?.prints || details[c.key]?.comentarios?.length);
  if (withNotes.length) {
    out.push('', '### Comentários e evidências dos demais casos');
    for (const c of withNotes) {
      const d = details[c.key];
      out.push(`- **${c.key}**${d?.titulo ? ` — ${d.titulo}` : ''} \`${c.status}\`${d?.prints ? ` · ${d.prints} print(s)` : ''}`);
      for (const n of d?.comentarios || []) out.push(`  - ${n}`);
    }
  }
  if (s.skipped.length) out.push('', `### Não executados (SKIP)`, s.skipped.map((k) => `- ${k}`).join('\n'));
  const open = bugs.filter((b) => b.open);
  if (open.length) {
    out.push('', `### Bugs abertos (${open.length})`);
    for (const b of open) out.push(`- **${b.key}**${b.titulo ? ` — ${b.titulo}` : ''}${b.jira ? ` · ${b.jira}` : ''}${b.status ? ` \`${b.status}\`` : ''}`);
  }
  return `${out.join('\n')}\n`;
}

const STATUS_ICON = /** @type {Record<string, string>} */ ({ PASS: '✅', FAIL: '❌', BLOCKED: '⛔', SKIP: '⏭' });
/** Uma linha com os números: "✅ 8 PASS · ❌ 2 FAIL · ⛔ 1 BLOCKED · ⏭ 1 SKIP". @param {CycleSummary} s */
const countsLine = (s) => [['PASS', s.pass], ['FAIL', s.fail], ['BLOCKED', s.blocked], ['SKIP', s.skip]]
  .filter(([, n]) => n).map(([k, n]) => `${STATUS_ICON[k]} ${n} ${k}`).join(' · ') + (s.pendente ? ` · ${s.pendente} sem resultado` : '');

/**
 * Resumo para o Slack (mrkdwn: *negrito*, • listas). Curto: números, falhas, bugs abertos e automação.
 * @param {CycleSummary} s @param {CaseDetails} details @param {string} [linksText] @param {RoundBug[]} [bugs]
 */
export function summarySlack(s, details = {}, linksText = '', bugs = []) {
  const out = [
    `*📊 ${s.titulo}* — ${s.fim ? `encerrada em ${when(s.fim)}` : 'em andamento'} (${fmtSpan(s.duracaoMs)})`,
  ];
  if (s.total) out.push(`${countsLine(s)} — *${s.sucessoPct == null ? '—' : `${s.sucessoPct}%`}* de sucesso (${s.total} caso${s.total === 1 ? '' : 's'})`);
  if (linksText) out.push(`🔗 ${linksText}`);
  if (s.problemas.length) {
    out.push('', '*Falhas e bloqueios*');
    for (const p of s.problemas) {
      const d = details[p.key];
      out.push(`• ${STATUS_ICON[p.status] || ''} *${p.key}*${d?.titulo ? ` — ${d.titulo}` : ''}${p.bugs.length ? ` (🐞 ${p.bugs.join(', ')})` : ''}`);
      for (const st of (d?.steps || []).slice(0, 3)) out.push(`    ◦ Passo ${st.n}: ${st.acao}${st.obtido ? ` → _${st.obtido}_` : ''}`);
    }
  } else if (s.total) out.push('', 'Nenhuma falha ou bloqueio ✅');
  const open = bugs.filter((b) => b.open);
  if (open.length) {
    out.push('', `*🐞 Bugs abertos (${open.length})*`);
    for (const b of open) out.push(`• *${b.key}*${b.titulo ? ` — ${b.titulo}` : ''}${b.jira ? ` (${b.jira})` : ''}`);
  }
  if (s.auto) {
    const a = s.auto;
    out.push('', `🤖 *Automatizados (${a.tool})*: ${a.total} teste(s) · ✅ ${a.pass} · ❌ ${a.fail}${a.skip ? ` · ⏭ ${a.skip}` : ''}${a.flaky ? ` · ${a.flaky} flaky` : ''}${a.sucessoPct == null ? '' : ` — *${a.sucessoPct}%*`}`);
  }
  if (s.skipped.length) out.push('', `⏭ Não executados: ${s.skipped.join(', ')}`);
  return `${out.join('\n')}\n`;
}

/**
 * Resumo para e-mail: HTML simples (cola formatado no Outlook/Gmail) + texto puro.
 * @param {CycleSummary} s @param {CaseDetails} details @param {string} [linksText] @param {RoundBug[]} [bugs]
 * @returns {{ subject: string, html: string, text: string }}
 */
export function summaryEmail(s, details = {}, linksText = '', bugs = []) {
  const color = /** @type {Record<string, string>} */ ({ PASS: '#1a7f37', FAIL: '#cf222e', BLOCKED: '#9a6700', SKIP: '#57606a' });
  const cell = 'padding:6px 12px;border:1px solid #d0d7de;text-align:center';
  const rate = s.sucessoPct == null ? '—' : `${s.sucessoPct}%`;
  const subject = `[QA] ${s.titulo} — ${s.total ? `${rate} de sucesso, ${s.fail} FAIL, ${s.blocked} BLOCKED` : 'testes automatizados'}${s.fim ? '' : ' (em andamento)'}`;
  const open = bugs.filter((b) => b.open);
  const h = [
    `<h2 style="margin:0 0 4px">${esc(s.titulo)}</h2>`,
    `<p style="margin:0 0 12px;color:#57606a">${esc(when(s.inicio))} → ${s.fim ? esc(when(s.fim)) : 'em andamento'} · ${esc(fmtSpan(s.duracaoMs))}${linksText ? ` · ${esc(linksText)}` : ''}</p>`,
  ];
  if (s.total) {
    h.push(`<table style="border-collapse:collapse;margin:0 0 12px"><tr><th style="${cell}">Casos</th>${['PASS', 'FAIL', 'BLOCKED', 'SKIP'].map((k) => `<th style="${cell};color:${color[k]}">${k}</th>`).join('')}<th style="${cell}">Sucesso</th></tr>`
      + `<tr><td style="${cell}">${s.total}</td><td style="${cell}">${s.pass}</td><td style="${cell}">${s.fail}</td><td style="${cell}">${s.blocked}</td><td style="${cell}">${s.skip}</td><td style="${cell}"><b>${rate}</b></td></tr></table>`);
  }
  if (s.problemas.length) {
    h.push('<h3 style="margin:12px 0 4px">Falhas e bloqueios</h3><ul style="margin:0">');
    for (const p of s.problemas) {
      const d = details[p.key];
      const steps = (d?.steps || []).map((st) => `<li>Passo ${esc(st.n)}: ${esc(st.acao)}${st.obtido ? ` → <i>${esc(st.obtido)}</i>` : ''}</li>`).join('');
      h.push(`<li><b>${esc(p.key)}</b>${d?.titulo ? ` — ${esc(d.titulo)}` : ''} <span style="color:${color[p.status] || '#000'};font-weight:600">${esc(p.status)}</span>${p.bugs.length ? ` — ${p.bugs.map(esc).join(', ')}` : ''}${steps ? `<ul>${steps}</ul>` : ''}</li>`);
    }
    h.push('</ul>');
  } else if (s.total) h.push('<p>Nenhuma falha ou bloqueio nesta rodada. ✅</p>');
  if (open.length) {
    h.push(`<h3 style="margin:12px 0 4px">Bugs abertos (${open.length})</h3><ul style="margin:0">`
      + open.map((b) => `<li><b>${esc(b.key)}</b>${b.titulo ? ` — ${esc(b.titulo)}` : ''}${b.jira ? ` (${esc(b.jira)})` : ''}</li>`).join('') + '</ul>');
  }
  if (s.auto) {
    const a = s.auto;
    h.push(`<h3 style="margin:12px 0 4px">Testes automatizados (${esc(a.tool)})</h3><p style="margin:0">${a.total} teste(s): ${a.pass} PASS · ${a.fail} FAIL${a.skip ? ` · ${a.skip} SKIP` : ''}${a.flaky ? ` · ${a.flaky} flaky` : ''}${a.sucessoPct == null ? '' : ` — <b>${a.sucessoPct}%</b> de sucesso`}</p>`);
  }
  if (s.skipped.length) h.push(`<p style="color:#57606a">Não executados (SKIP): ${s.skipped.map(esc).join(', ')}</p>`);
  const text = summaryMarkdown(s, details, linksText, bugs).replace(/\*\*/g, '').replace(/`/g, '').replace(/^#+ /gm, '');
  return { subject, html: `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px">${h.join('')}</div>`, text };
}

/**
 * Área de transferência (vem de quem abre a janela; sem ela, usa a do navegador).
 * @typedef {{ rich: (html: string, plain: string) => Promise<boolean>, plain: (text: string) => Promise<boolean> }} Clip
 */
/** @type {Clip} */
const browserClip = {
  rich: async (html, plain) => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]); return true; } catch { return browserClip.plain(plain); }
  },
  plain: async (text) => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } },
};

/**
 * @param {{ summary: CycleSummary, details?: CaseDetails, title?: string, onOpenCycle?: () => void, links?: import('../markdown/linkTypes.ts').LinkChip[], linksText?: string, bugs?: RoundBug[], clip?: Clip, toast?: (m: string) => void }} o
 * @returns {Promise<void>} resolve ao fechar
 */
export function openRoundSummary({ summary: s, details = {}, title = 'Como foi essa rodada?', onOpenCycle, links = [], linksText = '', bugs = /** @type {RoundBug[]} */ ([]), clip = browserClip, toast = /** @type {((m: string) => void) | undefined} */ (undefined) }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'review-overlay rs-overlay';
    const seg = (/** @type {number} */ n, /** @type {string} */ cls, /** @type {string} */ label) => (n ? `<span class="rs-seg ${cls}" style="flex:${n}" title="${n} ${label}"></span>` : '');
    const tile = (/** @type {string|number} */ v, /** @type {string} */ label, cls = '') => `<div class="rs-tile ${cls}"><b>${esc(v)}</b><span>${esc(label)}</span></div>`;
    const noManual = s.total === 0 && !!s.auto;
    const problems = s.problemas.map((p) => {
      const d = details[p.key];
      const steps = (d?.steps || []).map((st) => `<li><span class="rs-n">Passo ${esc(st.n)}</span> ${esc(st.acao)}${st.obtido ? ` <em>→ ${esc(st.obtido)}</em>` : ''}</li>`).join('');
      return `<li class="rs-problem"><div><b>${esc(p.key)}</b>${d?.titulo ? ` — ${esc(d.titulo)}` : ''} <span class="rs-badge rs-b-${p.status.toLowerCase()}">${esc(p.status)}</span>`
        + `${p.bugs.length ? ` <span class="rs-bugs">🐞 ${p.bugs.map(esc).join(', ')}</span>` : ''}${d?.prints ? ` <span class="rs-prints">📎 ${d.prints} print${d.prints > 1 ? 's' : ''}</span>` : ''}</div>${steps ? `<ul class="rs-steps">${steps}</ul>` : ''}</li>`;
    }).join('');
    /** @param {NonNullable<CycleSummary['auto']>} a */
    const autoBlock = (a) => `<div class="rs-auto"><h4>🤖 Testes automatizados — ${esc(a.tool)}${a.fonte ? ` <small>${esc(a.fonte)}</small>` : ''}</h4>
        <div class="rs-tiles">${tile(a.total, 'testes')}${tile(a.pass, 'PASS', 'rs-pass')}${tile(a.fail, 'FAIL', 'rs-fail')}${a.blocked ? tile(a.blocked, 'BLOCKED', 'rs-fail') : ''}${a.skip ? tile(a.skip, 'SKIP', 'rs-skip') : ''}${a.flaky ? tile(a.flaky, 'flaky', 'rs-skip') : ''}${tile(a.sucessoPct == null ? '—' : `${a.sucessoPct}%`, 'de sucesso', 'rs-rate')}</div>
        ${a.falhas.length ? `<ul class="rs-list">${a.falhas.map((f) => `<li class="rs-problem"><div>${esc(f.titulo)} <span class="rs-badge rs-b-fail">FAIL</span></div>${f.obs ? `<ul class="rs-steps"><li>${esc(f.obs)}</li></ul>` : ''}</li>`).join('')}</ul>` : ''}
        <p class="rs-note">Resultado do relatório anexado — separado dos casos manuais (não entra na % de sucesso deles).</p></div>`;
    const withNotes = s.casos.filter((c) => (c.status === 'PASS' || c.status === 'SKIP') && (details[c.key]?.prints || details[c.key]?.comentarios?.length));
    const notes = withNotes.length
      ? `<h4>Comentários e evidências dos demais casos (${withNotes.length})</h4><ul class="rs-list">${withNotes.map((c) => {
        const d = details[c.key];
        return `<li class="rs-problem"><div><b>${esc(c.key)}</b>${d?.titulo ? ` — ${esc(d.titulo)}` : ''} <span class="rs-badge rs-b-${String(c.status).toLowerCase()}">${esc(c.status)}</span>${d?.prints ? ` <span class="rs-prints">📎 ${d.prints} print${d.prints > 1 ? 's' : ''}</span>` : ''}</div>`
          + `${d?.comentarios?.length ? `<ul class="rs-steps">${d.comentarios.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</li>`;
      }).join('')}</ul>`
      : '';
    overlay.innerHTML = `
      <div class="review-dialog rs-dialog" role="dialog" aria-label="${esc(title)}">
        <div class="review-head"><strong>📊 ${esc(title)}</strong><span class="review-steps">${esc(s.titulo)}</span>
          <button type="button" class="review-x" data-act="close" title="Fechar (Esc)">×</button></div>
        <div class="rs-body">
          ${links.length ? `<div class="rs-links">${links.map((l) => (l.url ? `<a class="cp-chip" href="${esc(l.url)}" target="_blank" rel="noopener">${l.icon} ${esc(l.label)}</a>` : `<span class="cp-chip" title="${esc(l.typeLabel)}">${l.icon} ${esc(l.label)}</span>`)).join('')}</div>` : ''}
          <div class="rs-when">${esc(when(s.inicio))} → ${s.fim ? esc(when(s.fim)) : '<i>em andamento</i>'} · <b>${esc(fmtSpan(s.duracaoMs))}</b></div>
          ${noManual ? '' : `          <div class="rs-tiles">
            ${tile(s.total, 'casos')}
            ${tile(s.pass, 'PASS', 'rs-pass')}${tile(s.fail, 'FAIL', 'rs-fail')}${tile(s.blocked, 'BLOCKED', 'rs-fail')}${tile(s.skip, 'SKIP', 'rs-skip')}
            ${s.pendente ? tile(s.pendente, 'sem resultado', 'rs-skip') : ''}
            ${tile(s.sucessoPct == null ? '—' : `${s.sucessoPct}%`, 'de sucesso', 'rs-rate')}
          </div>
          <div class="rs-bar" role="img" aria-label="Distribuição dos resultados">${seg(s.pass, 'rs-pass', 'PASS')}${seg(s.fail, 'rs-fail', 'FAIL')}${seg(s.blocked, 'rs-blocked', 'BLOCKED')}${seg(s.skip, 'rs-skip', 'SKIP')}${seg(s.pendente, 'rs-none', 'sem resultado')}</div>
          <p class="rs-note">Sucesso = PASS ÷ (PASS + FAIL + BLOCKED): só conta o que foi de fato executado; SKIP fica de fora.</p>`}
          ${s.auto ? autoBlock(s.auto) : ''}
          ${problems ? `<h4>Falhas e bloqueios (${s.problemas.length})</h4><ul class="rs-list">${problems}</ul>` : noManual ? '' : '<p class="rs-ok">Nenhuma falha ou bloqueio nesta rodada. ✅</p>'}
          ${notes}
          ${s.skipped.length ? `<h4>Não executados — SKIP (${s.skipped.length})</h4><p class="rs-skipped">${s.skipped.map(esc).join(' · ')}</p>` : ''}
          ${bugs.length
            ? `<h4>Bugs ligados (${bugs.length}${bugs.some((b) => b.open) ? ` · ${bugs.filter((b) => b.open).length} aberto${bugs.filter((b) => b.open).length > 1 ? 's' : ''}` : ''})</h4><ul class="rs-list">${bugs.map((b) => `<li class="rs-problem"><div><b>${esc(b.key)}</b>${b.titulo ? ` — ${esc(b.titulo)}` : ''} <span class="rs-badge ${b.open ? 'rs-b-fail' : 'rs-b-pass'}">${b.open ? 'aberto' : 'fechado'}</span>${b.jira ? ` <span class="rs-prints">${esc(b.jira)}</span>` : ''}</div></li>`).join('')}</ul>`
            : s.bugs.length ? `<h4>Bugs ligados (${s.bugs.length})</h4><p>${s.bugs.map(esc).join(' · ')}</p>` : ''}
        </div>
        <div class="review-foot">
          <span class="rs-copy-label">📋 Copiar resumo para:</span>
          <button type="button" data-act="copy" data-fmt="jira" title="Formatado para a descrição ou um comentário do Jira (rich text + wiki markup)">Jira</button>
          <button type="button" data-act="copy" data-fmt="slack" title="Texto curto com *negrito* e listas, para colar numa mensagem do Slack/Teams">Slack</button>
          <button type="button" data-act="copy" data-fmt="email" title="Formatado (tabela com os números) para colar no corpo do e-mail; o assunto vai junto no texto puro">E-mail</button>
          <button type="button" data-act="copy" data-fmt="md" title="Markdown (para o Claude, Notion ou um .md)">Markdown</button>
          <span class="review-grow"></span>
          ${onOpenCycle ? '<button type="button" data-act="cycle">Abrir o ciclo</button>' : ''}
          <button type="button" data-act="close" class="primary">Fechar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    /** @param {KeyboardEvent} event */
    const onKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); done(); } };
    function done() { document.removeEventListener('keydown', onKey, true); overlay.remove(); resolve(); }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (event) => {
      const t = /** @type {HTMLElement} */ (event.target);
      if (t === overlay) { done(); return; }
      const b = /** @type {HTMLElement | null} */ (t.closest('[data-act]'));
      if (!b) return;
      if (b.dataset.act === 'close') done();
      else if (b.dataset.act === 'cycle') { done(); onOpenCycle?.(); }
      else if (b.dataset.act === 'copy') copyAs(b, b.dataset.fmt || 'md');
    });
    /** @param {HTMLElement} b @param {string} fmt */
    async function copyAs(b, fmt) {
      const md = summaryMarkdown(s, details, linksText, bugs);
      let ok = false;
      let msg = '';
      if (fmt === 'jira') {
        const j = buildJiraCopy(md, { withMeta: false });
        ok = await clip.rich(j.html, j.wiki);
        msg = 'Resumo copiado para o Jira — cole na descrição ou num comentário.';
      } else if (fmt === 'slack') {
        ok = await clip.plain(summarySlack(s, details, linksText, bugs));
        msg = 'Resumo copiado para o Slack — cole na mensagem.';
      } else if (fmt === 'email') {
        const e = summaryEmail(s, details, linksText, bugs);
        ok = await clip.rich(e.html, `Assunto: ${e.subject}\n\n${e.text}`);
        msg = `Resumo copiado para e-mail — cole no corpo. Assunto sugerido: ${e.subject}`;
      } else {
        ok = await clip.plain(md);
        msg = 'Resumo copiado em Markdown.';
      }
      overlay.querySelectorAll('[data-fmt]').forEach((x) => x.classList.remove('rs-copied'));
      if (ok) { b.classList.add('rs-copied'); toast?.(msg); } else toast?.('Não consegui acessar a área de transferência.');
    }
    /** @type {HTMLElement | null} */ (overlay.querySelector('.primary'))?.focus();
  });
}
