// @ts-check
// "Nova execução…": uma porta só. Pergunta de onde vêm os casos e entrega para o fluxo certo.
import { app } from './context.js';
import { newAutoRun, newRun, runCycle } from './cycle.js';
import { showDialog } from '../ui/dialog.js';

/** @param {{ choice?: string }} [opts] pula a pergunta (uso em testes/atalhos) */
export async function startRun(opts = {}) {
  let choice = opts.choice;
  if (!choice) {
    const res = await showDialog({
      title: 'Nova execução', icon: '▶',
      message: 'De onde vêm os casos desta execução?',
      select: {
        label: 'Tipo', value: 'avulsa',
        options: [
          { value: 'avulsa', label: '▶ Avulsa — escolher os casos (por tag, épico, visão…)' },
          { value: 'ciclo', label: '⏯ De um ciclo salvo — nova execução (#N) da regressão' },
          { value: 'auto', label: '🤖 Só automatizada — a partir de um relatório (Playwright, JUnit, Newman)' },
        ],
        hint: 'Retestar as falhas de uma execução e "🔁 Executar de novo" ficam no painel da própria execução.',
      },
      buttons: [{ id: 'cancel', label: 'Cancelar' }, { id: 'go', label: 'Continuar', kind: 'primary' }],
      defaultId: 'go', cancelId: 'cancel',
    });
    if (res?.id !== 'go') return;
    choice = res.choice;
  }
  app.preview?.commit?.();
  if (choice === 'ciclo') await runCycle();
  else if (choice === 'auto') await newAutoRun();
  else await newRun();
}
