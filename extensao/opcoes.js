// @ts-check
/** Opções da extensão: Jira (endereço, e-mail e token da API — guardados só na extensão). */
const $ = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ (document.getElementById(id));

/** @param {string} text @param {'ok' | 'err' | ''} [kind] */
function show(text, kind = '') {
  $('state').textContent = text;
  $('state').className = kind;
}

/** @param {string} acao @param {any} [dados] */
const ask = (acao, dados) => chrome.runtime.sendMessage({ tipo: 'popup', acao, dados });

async function load() {
  const r = await ask('jira-estado');
  if (r?.ok && r.dados.configurado) {
    $('site').value = r.dados.site;
    $('email').value = r.dados.email;
    show(`Configurado: ${r.dados.site} (${r.dados.email}). O token está guardado — deixe o campo em branco para mantê-lo.`, 'ok');
  } else {
    show('Jira não configurado. Preencha os três campos e clique em Salvar e testar.');
  }
}

$('save').addEventListener('click', async () => {
  show('Testando a conexão com o Jira…');
  const r = await ask('jira-salvar', { site: $('site').value, email: $('email').value, token: $('token').value });
  $('token').value = '';
  if (r?.ok) show(`✓ Conectado como ${r.dados.nome} em ${r.dados.site}. No TestFlow: Ctrl+Shift+P → Jira: criar a issue deste bug.`, 'ok');
  else show(`✗ ${r?.erro || 'não foi possível salvar'}`, 'err');
});

$('forget').addEventListener('click', async () => {
  await ask('jira-esquecer');
  $('token').value = '';
  show('Token apagado desta extensão. O Jira não está mais configurado.');
});

load();
