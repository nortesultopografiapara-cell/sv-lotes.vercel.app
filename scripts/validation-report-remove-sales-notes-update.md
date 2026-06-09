# Relatório — Remoção de `notes` do UPDATE em `sales`

**Data:** 2026-06-08  
**Erro em produção:** `Could not find the 'notes' column of 'sales' in the schema cache`  
**Commit:** Não realizado (aguardando aprovação)

---

## Resumo

O commit `5f60a30` restringiu o UPDATE de `sales` a 10 colunas oficiais, incluindo `notes`. A migration `20260608120000_sale_edit_contract_needs_regenerate.sql` define `ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS notes text`, mas **não foi aplicada em produção**.

**Correção:** remover `notes` do payload de `sales.update`. O campo permanece no formulário de edição (UI), sem persistência em `sales`.

---

## Alterações

| Arquivo | Alteração |
|---------|-----------|
| `lib/salesWriteSchema.ts` | `notes` removido de `SALES_OFFICIAL_UPDATE_FIELDS` e de `buildOfficialSalesUpdatePatch()`; adicionado `SALES_UPDATE_FORBIDDEN_FIELDS` e `salePatchHasForbiddenFields()` |
| `lib/saleEdit.ts` | Removido `notes` da chamada a `buildOfficialSalesUpdatePatch()` |
| `scripts/mandatory-sales-schema-validation-tests.ts` | Novos testes `testNotesNotInUpdatePatch` e `testForbiddenDetectorIncludesNotes` |

---

## Campos no UPDATE após correção (9 colunas)

| Campo | Status |
|-------|--------|
| `customer_id` | ✅ mantido |
| `agreed_price` | ✅ mantido |
| `lot_price` | ✅ mantido |
| `discount` | ✅ mantido |
| `total_value` | ✅ mantido |
| `payment_type` | ✅ mantido |
| `down_payment` | ✅ mantido |
| `installments_count` | ✅ mantido |
| `broker_id` | ✅ mantido |
| `notes` | ❌ **removido** |

---

## Comportamento de `notes`

| Aspecto | Comportamento |
|---------|---------------|
| Formulário GIS | Campo `notes` permanece visível/editável |
| Leitura (`loadSaleEditContext`) | `String(sale.notes \|\| '')` — retorna vazio se coluna ausente |
| UPDATE `sales` | **Não envia** `notes` |
| Migration futura | Quando `20260608120000` for aplicada em produção, `notes` pode ser reativado no patch |

---

## Testes executados

| Comando | Resultado |
|---------|-----------|
| `npx tsx scripts/mandatory-sales-schema-validation-tests.ts` | **PASS** (6/6) |
| `npx tsx scripts/mandatory-contract-validation-tests.ts` | **PASS** |
| `npx tsx scripts/mandatory-contract-identity-tests.ts` | **PASS** (11/11) |
| `npx next build` | **PASS** |

---

## Risco residual

| Item | Risco | Mitigação |
|------|-------|-----------|
| Observações não persistem | Médio | Usuário pode perder notes ao reabrir edição; reativar após migration |
| Audit log `saleAfter` sem notes | Baixo | `old_data`/`new_data` refletem apenas campos persistidos |

---

## Validação manual sugerida

1. Editar venda no GIS com observação preenchida → salvar (sem erro de schema)
2. Reabrir edição → demais campos corretos; notes pode aparecer vazio (esperado até migration)
3. Alterar desconto/entrada/parcelas → salvar sem erro
