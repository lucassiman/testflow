# language: pt
# Gerado pelo TestFlow a partir de CEN-001 (bdd/CEN-001-carrinho-de-compras.md) em 09/10/2026.
# Edite o cenário no TestFlow e exporte de novo (este arquivo é substituído).
@CEN-001 @carrinho @bdd
Funcionalidade: Carrinho de compras

  Contexto:
    Dado que estou logado como "cliente.ativo@lojademo.test"
    E o carrinho está vazio

  Cenário: Adicionar um produto
    Quando adiciono "Caneca QA" ao carrinho
    Então o carrinho mostra 1 item
    E o total é "R$ 39,90"

  Cenário: Alterar a quantidade
    Dado que tenho "Caneca QA" no carrinho
    Quando altero a quantidade para 3
    Então o total é "R$ 119,70"

  Esquema do Cenário: Cupom de desconto
    Dado que tenho "Caneca QA" no carrinho
    Quando aplico o cupom "<cupom>"
    Então vejo a mensagem "<mensagem>"

    Exemplos:
      | cupom    | mensagem                  |
      | QA10     | Cupom aplicado: 10% off   |
      | VENCIDO  | Cupom expirado            |
      | XYZ      | Cupom inválido            |
