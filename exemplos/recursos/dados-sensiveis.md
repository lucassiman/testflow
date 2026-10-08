# Dados sensíveis — área de teste

> [!WARNING]
> Todos os dados abaixo são **fictícios** (CPF/CNPJ com dígito válido, cartão de sandbox). Servem para ver a proteção funcionando.

**Experimente:**

1. **Copiar ▾ → Dados sensíveis…** — lista o que o editor encontrou. Desmarque algum item e clique em **🛡 Mascarar no documento** (`Ctrl+Z` desfaz).
2. **Copiar ▾ → Copiar para o Jira** (ou `Ctrl+Alt+C`, ou exportar PDF/HTML) — o editor pergunta antes de o texto sair: **Mascarar e continuar** troca os valores só na cópia; o documento fica igual.
3. **Revisar com o Claude** (`Alt+R`) — os dados vão como `{{EMAIL_1}}`, `{{CPF_1}}`… e voltam ao aplicar a resposta.
4. No mesmo diálogo, escolha o comportamento: **Perguntar** (padrão), **Mascarar sempre** ou **Não verificar**.

## Cliente de teste

| Campo | Valor |
| --- | --- |
| Nome | João da Silva Teste |
| CPF | 529.982.247-25 |
| CPF (só números) | 11144477735 |
| CNPJ | 11.222.333/0001-81 |
| E-mail | joao.teste@lojademo.test |
| Telefone | (11) 91234-5678 |
| Cartão | 4111 1111 1111 1111 |
| Senha | Teste@123 |

## Credenciais em configuração

```bash
curl -H "Authorization: Bearer abcDEF1234567890ghiJKL" https://hml.lojademo.test/api/pedidos
export API_KEY=AKIAIOSFODNN7EXAMPLE
```

```json
{ "usuario": "qa_admin", "password": "S3nh@Forte!", "token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJxYSJ9.c2lnbmF0dXJlLWZha2U" }
```

Banco: `postgres://qa_app:SenhaDoBanco1@db.hml.lojademo.test:5432/loja`

## O que NÃO é mascarado

Datas (2026-09-24), IDs de caso (TC-042), versões (2.14.0), números de pedido (12345678901 — não é CPF válido) e mensagens como "senha: inválida".
