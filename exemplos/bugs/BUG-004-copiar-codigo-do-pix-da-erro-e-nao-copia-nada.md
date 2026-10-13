---
tipo: bug
id: BUG-004
titulo: Copiar código do Pix dá erro e não copia nada
app:
status: FAIL
severidade: Alta
prioridade: Alta
ambiente: HML
browser: Chrome 141
dispositivo: WEB
versao: 2.15.0
responsavel: Lucas
data: 2026-10-10
jira: QA-433
tags: [pix, checkout, regressao, web]
qa-md: 1
epico: [QA-400]
sprint: Sprint 43
jira_status: Reaberto (em andamento)
---

# BUG-004 — Copiar código do Pix dá erro e não copia nada

## Resumo

No checkout, o botão **Copiar código** do Pix mostra "Não foi possível copiar o código" e não copia nada: a API do copia e cola responde **500**.

Encontrado em [[TC-010]] — Pagar com Pix pelo copia e cola (passo 3).

## Ambiente

| Item | Valor |
| --- | --- |
| Ambiente | HML |
| Browser / dispositivo | Chrome 141 |
| Versão | 2.15.0 |
| Usuário / perfil | Cliente (`cliente` do [[COMP-001]]) |
| URL | https://hml.lojademo.test/checkout/pix?pedido=10611 |
| Sistema | Windows 11 |
| Tela | 1920×1080 (janela 1536×730, escala 1.25) |

## Passos para reproduzir

1. ↪ Fazer login (cliente)
2. Adicionar a "Caneca Loja Demo" ao carrinho, ir ao checkout, escolher **Pix** e clicar em **Gerar QR Code**
3. Clicar em **Copiar código**

## Resultado esperado

Aviso "Código copiado" e o código na área de transferência

## Resultado obtido

> [!CAUTION]
> Aviso **Não foi possível copiar o código**; nada na área de transferência (2 tentativas)

## Evidências

![2026-10-10_14-06-31_TC-010-passo-3-clicar-em-copiar-codigo](evidencias/2026-10-10_14-06-31_TC-010-passo-3-clicar-em-copiar-codigo.png)

[🎬 2026-10-10_14-10-05_TC-010-replay](evidencias/2026-10-10_14-10-05_TC-010-replay.webm)

### Console e rede

Capturado pela extensão do TestFlow em 10/10/2026 14:10 — *Loja Demo — Pagamento com Pix* (`https://hml.lojademo.test/checkout/pix?pedido=10611`).

> [!CAUTION]
> **Console:** 5 erros · 1 aviso
> - `Falha ao carregar https://hml.lojademo.test/static/icones/pix-copiar.svg (404)`
> - `Erro ao montar o copia e cola: Request failed with status code 500` (2×)
> - `Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'emv')` (2×)
>
> **Rede:** 3 requisições com falha
> - `GET https://hml.lojademo.test/static/icones/pix-copiar.svg` → 404 Not Found · 38 ms
> - `GET https://hml.lojademo.test/api/pix/cobrancas/10611/copia-e-cola?token=••••••••` → 500 Internal Server Error · 412 ms (2×)

[📎 Console completo (7 eventos)](evidencias/2026-10-10_14-10-05_TC-010-console.log) · [📎 Requisições com falha (3, HAR)](evidencias/2026-10-10_14-10-05_TC-010-rede.har)

## Impacto

Quem paga pelo celular (no mesmo aparelho, sem ler o QR Code) não consegue pagar com Pix. O critério 1 da [[QA-410]] não é atendido.

## Observações

> [!NOTE]
> **Como este bug nasceu:** no passo 3 do [[TC-010]], 🐞 *Novo bug* com o **replay instantâneo** e a **captura pela extensão** ligados. Vieram sozinhos: o vídeo, as linhas *URL*, *Sistema* e *Tela* da tabela Ambiente, o resumo *Console e rede* e os arquivos `.log` e `.har` — com o token, o CPF e o e-mail **mascarados**. A chave `jira:` e o `jira_status:` vieram do Jira pela API (extensão). **Compartilhar ▾ → Copiar para o Jira** leva o print, o vídeo, o log e o HAR como anexos.

## Andamento

- 10/10 — Ticket **QA-433** criado pela extensão do navegador (Jira pela API): a chave e o status do Jira ficam no cabeçalho (`jira:`, `jira_status:`).
- 11/10 — Corrigido no build **2.15.0-rc3** (PR #827). Reteste do [[TC-010]] passou no Chrome 141 — bug fechado (`PASS`).

## Reincidências

> O defeito voltou a acontecer depois de registrado. Mais recente por último.

### 12/10/2026 10:12 — [[TC-010]] passo 3

- Passo: Clicar em **Copiar código**
- Obtido: Com o cupom DEMO10 no pedido, o aviso **Não foi possível copiar o código** voltou (Edge 141)
- Versão 2.15.0 · Ambiente HML
- Página: `https://hml.lojademo.test/checkout/pix?pedido=10688&cupom=DEMO10` · Edge 141 · Windows 11
- Console: 2 erros — `Erro ao montar o copia e cola: Request failed with status code 500` ([📎 log](evidencias/2026-10-12_10-12-40_TC-010-console.log))
- Rede: 1 requisição com falha — `GET https://hml.lojademo.test/api/pix/cobrancas/10688/copia-e-cola?token=••••••••` → 500 Internal Server Error · 412 ms ([📎 HAR](evidencias/2026-10-12_10-12-40_TC-010-rede.har))
- Bug reaberto (estava `PASS`).
