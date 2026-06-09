# Relatório — Auditoria completa de campos `sales` (schema cache)

**Data:** 2026-06-08  
**Erro em produção:** `Could not find the 'down_payment_due_date' column of 'sales' in the schema cache`  
**Commit:** Não realizado (aguardando aprovação)

---

## Resumo executivo

O `saleEdit.ts` enviava no **UPDATE** colunas definidas apenas em migrations **órfãs** (`sales_finance_fields.sql`), não presentes nas migrations numeradas aplicadas em produção.

**Correção:** `buildOfficialSalesUpdatePatch()` em `lib/salesWriteSchema.ts` — UPDATE usa somente 10 colunas oficiais.

---

## 1. Migrations — campos `public.sales`

### EXISTE NO BANCO (migrations numeradas + schema base)

| Campo | Migration / origem |
|-------|-------------------|
| `id`, `tenant_id`, `lot_id`, `client_id`, `user_id` | `schema.sql` base |
| `agreed_price`, `down_payment`, `installments_count`, `status` | `schema.sql` base |
| `contract_url`, `created_at` | `schema.sql` base |
| `project_id`, `block_id`, `customer_id`, `broker_id` | `20260519100000_post_sale_structure.sql` |
| `lot_price`, `discount`, `total_value`, `sale_date`, `payment_type` | `20260519100000_post_sale_structure.sql` |
| `notes` | `20260608120000_sale_edit_contract_needs_regenerate.sql` |
| `deleted_at`, `deleted_by` | `enterprise.sql` (órfã, mas comum em prod) |

### NÃO EXISTE NO BANCO (migrations órfãs `sales_finance_fields*.sql`)

| Campo | Migration órfã |
|-------|----------------|
| `discount_value` | `sales_finance_fields.sql` |
| `final_value` | `sales_finance_fields.sql` |
| `down_payment_due_date` | `sales_finance_fields.sql` |
| `first_installment_due_date` | `sales_finance_fields.sql` |
| `installment_value` | `sales_finance_fields.sql` |

> `payment_type` também está na órfã, mas **já existe** na numerada `20260519100000`.

---

## 2. Auditoria INSERT / UPDATE

### `lib/saleEdit.ts` — UPDATE (corrigido)

| Campo | Antes | Depois | Migration |
|-------|-------|--------|-----------|
| `customer_id` | ✅ enviado | ✅ mantido | numerada |
| `agreed_price` | ✅ | ✅ | base |
| `lot_price` | ✅ | ✅ | numerada |
| `discount` | ✅ | ✅ | numerada |
| `total_value` | ✅ | ✅ | numerada |
| `payment_type` | ✅ | ✅ | numerada |
| `down_payment` | ✅ | ✅ | base |
| `installments_count` | ✅ | ✅ | base |
| `broker_id` | ✅ | ✅ | numerada |
| `notes` | ✅ | ✅ | numerada |
| `final_value` | ❌ enviado | **removido** | órfã |
| `installment_value` | ❌ enviado | **removido** | órfã |
| `down_payment_due_date` | ❌ enviado | **removido** | órfã |
| `first_installment_due_date` | ❌ enviado | **removido** | órfã |
| `discount_value` | já removido | — | órfã |

**Datas de vencimento:** permanecem em `finance_receipts` via `buildFinancePayloads` (inalterado).  
**Leitura no formulário:** `loadSaleEditContext` já usa fallback `sale.*_due_date` → `finance_receipts.due_date`.

### `components/map/GISMap.tsx` — INSERT (não alterado)

| Campo INSERT | Migration | Risco |
|--------------|-----------|-------|
| `tenant_id`, `project_id`, `block_id`, `customer_id`, `lot_id` | numerada/base | Baixo |
| `agreed_price`, `lot_price`, `discount`, `total_value` | numerada/base | Baixo |
| `payment_type`, `down_payment`, `installments_count`, `status` | numerada/base | Baixo |
| `broker_id`, `user_id`, `client_id` | base/numerada | Baixo |
| `company_id` | **sem migration ADD em sales** | Médio* |
| `block_number`, `lot_number` | **sem migration** | Médio* |

\* Se INSERT funciona em produção, essas colunas existem manualmente ou via script externo. Não alterado nesta correção.

### Outros UPDATE em `sales`

| Arquivo | Campos | Status |
|---------|--------|--------|
| `app/customers/page.tsx` | `customer_id: null` | ✅ oficial |
| `app/contracts/page.tsx` | `status` | ✅ base |

---

## 3. Formulários (somente UI — não persistem órfãos)

| Arquivo | Campos UI | Persistência |
|---------|-----------|--------------|
| `CustomerLotFormModal.tsx` | `discount_value`, datas, `final_value` (calculado) | Via `saleEdit` → patch oficial |
| `ContractGenerator.tsx` | lê `sale.discount`, `sale.final_value`, datas | Somente leitura; fallback `discount` já aplicado |

---

## 4. Arquivos alterados nesta correção

| Arquivo | Alteração |
|---------|-----------|
| `lib/salesWriteSchema.ts` | **Novo** — lista oficial + `buildOfficialSalesUpdatePatch` |
| `lib/saleEdit.ts` | UPDATE usa patch oficial |
| `scripts/mandatory-sales-schema-validation-tests.ts` | **Novo** — 4 casos |

**Não alterados:** GISMap, memorial, contratos (lógica), financeiro/parcelas, pranchas, banco, migrations.

---

## 5. Testes executados

| Comando | Resultado |
|---------|-----------|
| `npx tsx scripts/mandatory-sales-schema-validation-tests.ts` | **PASS** |
| `npx tsx scripts/mandatory-contract-validation-tests.ts` | **PASS** |
| `npx tsx scripts/mandatory-contract-identity-tests.ts` | **PASS** (11/11) |
| `npx next build` | **PASS** |

---

## 6. Risco residual

| Item | Risco | Mitigação |
|------|-------|-----------|
| Datas não gravadas em `sales` | Baixo | `finance_receipts` + fallback na leitura |
| `ContractGenerator` exibe datas de `sale.*_due_date` | Baixo | Mostra `___/___/____` se null; dados reais nos recibos |
| GISMap INSERT com `company_id` / `block_number` | Médio | Monitorar; migration futura se necessário |
| `final_value` / `installment_value` só na UI | Baixo | `agreed_price` / `total_value` cobrem valor final |

---

## 7. Validação manual sugerida

1. Editar venda no GIS → salvar (sem erro de schema)
2. Alterar desconto, entrada, parcelas e datas → salvar
3. Reabrir edição → valores e datas corretos (datas via recibos)
4. Regenerar contrato → desconto e valores corretos

---

## 8. Aprovação

Aguardando aprovação antes de commit/push.
