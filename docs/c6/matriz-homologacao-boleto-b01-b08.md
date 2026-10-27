# Matriz de rastreabilidade — C6 Boleto B_01 a B_08

Fonte oficial do roteiro: `docs/c6/Roteiro de Testes - C6 Developers v3.0 (3).docx` (C6 Developers v3.0).  
Arquivo solicitado e **não encontrado**: `Roteiro de Testes - C6 Developers v3.0(4).docx`.  
Contrato OpenAPI: `docs/c6/boleto-bancario.json` (OpenAPI 3.1.1, versão 1.7.2).

Colunas **Status retornado** e **Body retornado** permanecem vazias: nenhum teste oficial foi executado contra o C6 nesta etapa. O Word não foi alterado.

| Caso | Título oficial | Método | Endpoint | Campos obrigatórios | Status roteiro | Status OpenAPI | Evidência | Status retornado | Body retornado |
|---|---|---|---|---|---|---|---|---|---|
| B_01 | Emissão de boleto simples | POST | `/v1/bank_slips/` | `external_reference_id`, `amount`, `due_date`, `payer` (nome, CPF/CNPJ, endereço) | 201 | 201 | HTTP + body sanitizado | — | — |
| B_02 | Emissão de boleto com juros e multa variáveis | POST | `/v1/bank_slips/` | obrigatórios de B_01 + `interest` + `fine` | 201 | 201 | HTTP + body sanitizado (juros/multa) | — | — |
| B_03 | Emissão de boleto com desconto | POST | `/v1/bank_slips/` | obrigatórios de B_01 + `discount` | 201 | 201 | HTTP + body sanitizado (desconto) | — | — |
| B_04 | Alteração de dados do boleto | PUT | `/v1/bank_slips/{id}` | `id` + ao menos um campo alterável | 200 | 200 | HTTP + body sanitizado | — | — |
| B_05 | Consulta de boleto | GET | `/v1/bank_slips/{id}` | `id` | 200 | 200 | HTTP + body sanitizado | — | — |
| B_06 | Geração do PDF do boleto | GET | `/v1/bank_slips/{id}/pdf` | `id` | 200 | 200 | HTTP + content-type + tamanho do PDF | — | — |
| B_07 | Cadastro do webhook de boleto | POST | `/webhooks/` (API de notificações; **não** está no OpenAPI de boleto) | roteiro: `url`, `service="BANK_SLIP"` | 200 | *(ausente no OpenAPI 1.7.2 de boleto)* | HTTP + body sanitizado | — | — |
| B_08 | Baixa/cancelamento de boleto emitido | PUT | `/v1/bank_slips/{id}/cancel` | `id` | 200 | 204 | HTTP **efetivo** do C6 + body se houver | — | — |

## Divergências registradas (não resolvidas por suposição)

1. **B_08:** roteiro 200 vs OpenAPI 204. Na execução autorizada, gravar o status real.
2. **B_04:** roteiro menciona alteração de pagador; OpenAPI `bank_slip_alter_request` permite só `amount`, `due_date`, `discount`, `interest`, `fine`. Preparado boleto exclusivo `B04S261027` e PUT só de `due_date` para `2026-12-10`. Não altera B_01/B_02/B_03.
3. **B_06:** primeira tentativa `B06S261027` retornou HTTP 406 com `Accept: application/pdf`. OpenAPI 1.7.2 não declara `application/pdf` no 200; o schema `base64_pdf_file` e o GET B_05 comprovam envelope JSON. Correção: `Accept: application/json`, sem `Content-Type` em GET sem body. Referência seguinte: `B06R261027`. `B06S261027` permanece UNKNOWN e não é sobrescrito.
4. **B_07:** falta o OpenAPI oficial da API de notificações. Não implementar `/webhooks/` sem esse contrato.
5. **AT_01 (contexto do token):** roteiro exemplifica `expires_in: 300`. O cache usa o valor **retornado** pelo C6; fallback de cache (não exibido no AT_01) é 600 s.

## Testes internos (não oficiais)

`INT_VALIDATION`, `INT_AUTH_HTTP_401`, `INT_ISOLATION`, `INT_TIMEOUT`, `INT_UNEXPECTED_BODY`, `INT_DUPLICATE_REFERENCE`.
