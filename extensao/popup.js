// @ts-check
/** Popup da extensão: estado (capturando / pausada), quanto está guardado, pausar e limpar. */
const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {string} acao */
async function ask(acao) {
  const r = await chrome.runtime.sendMessage({ tipo: 'popup', acao });
  if (!r?.ok) return;
  const d = r.dados;
  $('state').textContent = d.pausado ? '⏸ Pausada — nada está sendo guardado' : '● Capturando o console e a rede das abas';
  $('state').className = `state${d.pausado ? ' off' : ''}`;
  $('counts').textContent = d.abas || d.falhas ? `${d.abas} aba(s) com eventos · ${d.erros} erro(s) · ${d.avisos} aviso(s) · ${d.falhas} requisição(ões) com falha (últimos 30 min)` : 'Nada guardado ainda.';
  $('toggle').textContent = d.pausado ? 'Retomar' : 'Pausar';
  $('toggle').dataset.next = d.pausado ? 'retomar' : 'pausar';
  $('version').textContent = `Versão ${d.versao}`;
  $('jira').textContent = d.jira ? `Jira: ${d.jira} (criar issue e trazer o status pelo TestFlow)` : 'Jira: não configurado (opcional).';
}

$('toggle').addEventListener('click', () => ask($('toggle').dataset.next || 'pausar'));
$('clear').addEventListener('click', () => ask('limpar'));
$('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
ask('estado');
