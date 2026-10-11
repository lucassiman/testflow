// 11.4 (1.49.0): replay instantâneo — dois gravadores defasados guardam os últimos N s; e o link do vídeo no bug.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReplayBuffer, replayMime, slotToRestart, slotToSave } from '../../src/io/replay.js';
import { addRecurrence, buildLinkedDoc, evidenceLink } from '../../src/markdown/linkedDoc.ts';

const N = 60_000;

test('quando recomeçar: o primeiro na hora, o segundo depois de N, cada um ao passar de 2N (se o outro cobre a janela)', () => {
  assert.equal(slotToRestart([-1, -1], N), 0);
  assert.equal(slotToRestart([30_000, -1], N), -1);
  assert.equal(slotToRestart([N, -1], N), 1);
  assert.equal(slotToRestart([2 * N - 1, N - 1], N), -1);
  assert.equal(slotToRestart([2 * N, N], N), 0);
  // timers atrasados (editor em segundo plano): os dois venceram, mas só um recomeça
  assert.equal(slotToRestart([3 * N, 3 * N - 5_000], N), 0);
  assert.equal(slotToRestart([0, 3 * N - 5_000], N), -1);
});

test('qual salvar: o que grava há mais tempo; nenhum gravando → -1', () => {
  assert.equal(slotToSave([-1, -1]), -1);
  assert.equal(slotToSave([10, -1]), 0);
  assert.equal(slotToSave([10, 70]), 1);
});

/** Gravador falso: guarda o estado e entrega um pedaço a cada requestData. */
function fakeRecorder() {
  const made = [];
  class FakeMR {
    static isTypeSupported(t) { return t === 'video/webm;codecs=vp8' || t === 'video/webm'; }
    constructor(stream, opts) { this.opts = opts; this.state = 'inactive'; this.listeners = {}; made.push(this); }
    addEventListener(type, fn, o) { (this.listeners[type] ||= []).push({ fn, once: !!o?.once }); }
    emit(type, ev) {
      const ls = this.listeners[type] || [];
      this.listeners[type] = ls.filter((l) => !l.once);
      for (const l of ls) l.fn(ev);
    }
    start() { this.state = 'recording'; this.emit('dataavailable', { data: new Blob(['cabecalho']) }); }
    stop() { this.state = 'inactive'; }
    requestData() { queueMicrotask(() => this.emit('dataavailable', { data: new Blob(['x']) })); }
  }
  return { FakeMR, made };
}

test('buffer: sempre há entre N e 2N guardados depois do aquecimento (com tique a cada segundo ou atrasado)', () => {
  for (const every of [1_000, 70_000]) {
    let t = 0;
    const { FakeMR, made } = fakeRecorder();
    const r = createReplayBuffer({ stream: /** @type {any} */ ({}), windowMs: N, MR: /** @type {any} */ (FakeMR), now: () => t, tickMs: 1e9 });
    assert.equal(r.start(), true);
    assert.equal(made.length, 1);
    assert.equal(made[0].opts.mimeType, 'video/webm;codecs=vp8');
    for (t = 0; t <= 15 * N; t += 1_000) {
      if (t % every === 0) r.tick();
      if (t >= N + every) {
        assert.ok(r.coveredMs >= N, `t=${t} (tique a cada ${every}): só ${r.coveredMs} guardados`);
        assert.ok(r.coveredMs <= 2 * N + every, `t=${t}: ${r.coveredMs} guardados (passou do ciclo)`);
      }
    }
    // os gravadores trocados foram parados (só 2 ficam gravando)
    assert.equal(made.filter((m) => m.state === 'recording').length, 2);
    r.stop();
    assert.equal(made.filter((m) => m.state === 'recording').length, 0);
    assert.equal(r.running, false);
  }
});

test('salvar copia o gravador mais antigo (com o último pedaço) e ele continua gravando', async () => {
  let t = 0;
  const { FakeMR, made } = fakeRecorder();
  const r = createReplayBuffer({ stream: /** @type {any} */ ({}), windowMs: N, MR: /** @type {any} */ (FakeMR), now: () => t, tickMs: 1e9 });
  r.start();
  t = N; r.tick();
  t = N + 30_000;
  const clip = await r.save();
  assert.ok(clip);
  assert.equal(clip.ms, N + 30_000);
  assert.equal(clip.file.type, 'video/webm');
  assert.equal(await clip.file.text(), 'cabecalhox');
  assert.equal(made[0].state, 'recording');
  r.stop();
  assert.equal(await r.save(), null);
});

test('sem suporte a gravação de vídeo: não liga', () => {
  const r = createReplayBuffer({ stream: /** @type {any} */ ({}), windowMs: N, MR: /** @type {any} */ ({ isTypeSupported: () => false }) });
  assert.equal(r.supported, false);
  assert.equal(r.start(), false);
  assert.equal(replayMime(undefined), '');
});

test('link da evidência: vídeo 🎬, imagem ![], outros 📎 — no bug novo e na reincidência', () => {
  assert.equal(evidenceLink('evidencias/a-replay.webm', 'a-replay'), '[🎬 a-replay](evidencias/a-replay.webm)');
  assert.equal(evidenceLink('evidencias/p.PNG', 'p'), '![p](evidencias/p.PNG)');
  assert.equal(evidenceLink('evidencias/rede.har', 'rede'), '[📎 rede](evidencias/rede.har)');
  const tpl = '---\ntipo: bug\nid: BUG-000\ntitulo: x\ntags: []\n---\n\n# BUG-000 — x\n\n## Resumo\n\n## Evidências\n\nCole prints.\n';
  const source = { id: 'TC-1', titulo: 'Login', app: '', ambiente: '', browser: '', dispositivo: '', versao: '', tags: [] };
  const bug = buildLinkedDoc(tpl, { id: 'BUG-1', title: 'Falha', sourceTarget: 'TC-1', source: /** @type {any} */ (source), prints: ['evidencias/p.png', 'evidencias/2026-10-11_10-00-00_TC-1-replay.webm'] });
  assert.match(bug, /## Evidências\n\n!\[p\]\(evidencias\/p\.png\)\n\n\[🎬 2026-10-11_10-00-00_TC-1-replay\]\(evidencias\/2026-10-11_10-00-00_TC-1-replay\.webm\)/);
  const rec = addRecurrence('---\ntipo: bug\nid: BUG-1\nstatus: FAIL\n---\n\n# BUG-1\n', { when: new Date(2026, 9, 11, 10, 5), sourceTarget: 'TC-1', prints: ['evidencias/r-replay.webm'] });
  assert.match(rec.text, /\[🎬 Reincidência 11\/10\/2026 10:05\]\(evidencias\/r-replay\.webm\)/);
});
