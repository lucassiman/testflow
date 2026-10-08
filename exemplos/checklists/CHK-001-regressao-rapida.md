---
tipo: checklist
id: CHK-001
titulo: Regressão rápida — antes de cada deploy
status: PENDING
ambiente: HML
responsavel: Ana
data: 2026-09-26
tags: [checklist, regressao]
---

# CHK-001 — Regressão rápida — antes de cada deploy

> [!TIP]
> Cada título mostra quantos itens da seção estão marcados (`3/5`). Clique nas caixinhas para marcar. Passe o mouse num título e clique no **▾** para **recolher** a seção — útil em checklists longos (`Alt+clique` recolhe todas do mesmo nível). O botão **☑** na barra *Execução* mostra só o que falta.

## Login

- [x] Entrar com usuário válido
- [x] Senha errada mostra mensagem
- [x] "Lembrar de mim" mantém a sessão
- [ ] Usuário bloqueado vê mensagem (ver [[BUG-001]])
- [ ] Sair encerra a sessão

## Catálogo

- [x] Busca por nome
- [x] Filtro por categoria
- [x] Página do produto com fotos
- [x] Produto sem estoque aparece como "Indisponível"

## Carrinho

- [x] Adicionar produto
- [x] Alterar quantidade
- [ ] Aplicar cupom
- [ ] Carrinho mantido depois de sair e entrar

## Checkout

- [ ] Endereço com CEP com hífen
- [ ] Frete calculado
- [ ] Pagamento com Pix
- [ ] Pagamento com cartão ([[TC-004]])
- [ ] E-mail de confirmação
