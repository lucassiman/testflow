---
tipo: status
titulo: Status personalizados
qa-md: 1
---

# Status personalizados

Status a mais para os passos e casos, além de PASS, FAIL, BLOCKED, SKIP e PENDING. **Conta como** diz como cada um entra nas contagens, no status geral, na rodada e nos relatórios. Valem para a pasta de trabalho toda (no app e no Claude).

| Palavra | Conta como | Cor | Descrição |
| --- | --- | --- | --- |
| RETESTE | PENDING | #8250df | Executar de novo depois da correção |
| FALHA CONHECIDA | FAIL | #bc4c00 | Falha já reportada, com bug aberto |
| NÃO TESTÁVEL | BLOCKED | #9a6700 | Sem ambiente ou massa para testar |

> [!TIP]
> **Onde ver na Loja Demo:** na execução #3 da *Regressão do Pix*, o passo 4 do [[TC-006]] está como `FALHA CONHECIDA` (o [[BUG-002]] continua aberto — não se abre outro bug) e o passo 5 do [[TC-008]] como `RETESTE` (a correção do [[BUG-003]] ainda não chegou no HML; conta como pendente). Ao salvar este documento, as palavras viram etiquetas coloridas e entram no seletor de status com as teclas **6–8**.
