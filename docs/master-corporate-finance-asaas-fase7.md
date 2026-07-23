# Financeiro Corporativo — Asaas Fase 7 (Preview)

Homologação e configuração **somente Preview**. Não aplicar em produção sem autorização explícita.

## 1. Migration (Supabase Preview)

Aplicar manualmente no projeto Supabase ligado ao Preview:

`supabase/migrations/20260723100000_master_corporate_asaas_foundation.sql`

Tabelas:

- `master_corporate_asaas_customers`
- `master_corporate_asaas_charges`
- `master_corporate_asaas_webhook_events`

Colunas leves em `master_corporate_receivables`:

- `asaas_integration_status`
- `asaas_active_charge_id`
- `asaas_last_sync_at`
- `asaas_last_error`

RLS: `is_super_admin()` em todas as tabelas Asaas corporativas.

## 2. Variáveis Vercel (Preview)

Já usadas pela conta Asaas SV Topografia (não duplicar no banco):

| Variável | Obrigatória | Notas |
|---|---|---|
| `ASAAS_API_KEY` | Sim | Mesma conta SaaS / SV Topografia. Server-side only. |
| `ASAAS_ENV` | Sim | `sandbox` (Preview) ou `production`. |
| `ASAAS_CORPORATE_WEBHOOK_TOKEN` | Sim | Token **dedicado** do webhook corporativo. Sem fallback. |

Não criar `NEXT_PUBLIC_*` com chave ou token.

Se `ASAAS_CORPORATE_WEBHOOK_TOKEN` estiver ausente, o webhook responde **503** e não processa eventos.

## 3. Painel Asaas

1. Conta: mesma conta corporativa SV Topografia que recebe assinaturas SaaS.
2. Criar webhook (ou endpoint adicional) apontando para:

`https://<PREVIEW_HOST>/api/master/corporate-finance/asaas/webhook`

Exemplo (substituir pelo host do Preview após o deploy):

`https://sv-lotes-vercel-XXXX.vercel.app/api/master/corporate-finance/asaas/webhook`

3. Header de autenticação (Access Token / asaas-access-token): valor de `ASAAS_CORPORATE_WEBHOOK_TOKEN`.
4. Eventos sugeridos: `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED`.

**Não alterar** webhooks existentes:

- `/api/payments/webhook` (SaaS)
- `/api/finance/asaas/company-webhook` (imobiliárias)

## 4. Isolamento

Cobranças corporativas usam:

- `externalReference = ASAAS_CORP_AR:{receivable_id}[:charge_id]`
- `domain = MASTER_CORPORATE_FINANCE`
- tabelas `master_corporate_asaas_*` apenas

**Criar cobrança nunca liquida a Conta a Receber nem gera caixa.** Liquidação só com pagamento confirmado (webhook/sync/reconcile com evidência) ou botão Receber manual.

Eventos SaaS/tenant são rejeitados pelo liquidator corporativo.

## Preview — variáveis obrigatórias

Além de `ASAAS_CORPORATE_WEBHOOK_TOKEN`, o Preview **precisa** das mesmas variáveis da conta SV Topografia usadas no Caixa SaaS:

- `ASAAS_API_KEY` (Production já tem; **copiar para Preview**)
- `ASAAS_ENV` (recomendado `sandbox` no Preview)

Sem `ASAAS_API_KEY` no Preview, a criação de cobrança falha.

## Reabrir AR liquidada indevidamente

`POST /api/master/corporate-finance/receivables/reopen-code`

Body: `{ "userId": "<SUPER_ADMIN>", "code": "REC-2026-0002", "reason": "..." }`

Estorna recebimentos ativos + movimentos de caixa vinculados e recoloca a AR em aberto, sem apagar o título.


## 5. Roteiro de homologação

1. Aplicar migration no Supabase Preview.
2. Cadastrar `ASAAS_CORPORATE_WEBHOOK_TOKEN` no Preview Vercel.
3. Cadastrar URL do webhook no Asaas (sandbox).
4. Criar Conta a Receber de teste (valor baixo).
5. Gerar cobrança **PIX** no detalhe da AR (`Cobrança Asaas`).
6. Gerar cobrança **boleto** em outra AR (ou após cancelar a anterior se mesma AR).
7. Validar QR Code, copia e cola e link do boleto/fatura.
8. **Pagamento real somente após autorização explícita.**
9. Validar webhook → status pago.
10. Validar AR liquidada (recebimento `origin=ASAAS`).
11. Validar movimento no Fluxo de Caixa Corporativo.
12. Validar saldo da conta financeira.
13. Validar projeto / Hub / Dashboard / gráfico (bridge Fase 6.4).
14. Sync/reprocessar de novo → sem duplicidade.
15. Reenviar mesmo evento webhook → `DUPLICATE` / sem segundo pagamento.
16. Cancelar cobrança ativa → AR permanece aberta.
17. Simular paga sem webhook: botão **Conciliar pagas** ou Sync/Reprocessar.

## 6. Regras financeiras

- Criar cobrança ≠ receber.
- Pendente não entra no caixa.
- Somente pago confirmado gera recebimento + movimento.
- Valor do cliente = `value` Asaas (não `netValue`/taxas).
- Cancelar Asaas não cancela a AR.
- Status pago não é rebaixado por evento posterior (exceto refund auditável).

## 7. Escopo fora desta entrega

- Cartão / link de cartão
- Importação bancária genérica / extratos
- Produção / `main` / `--prod`
