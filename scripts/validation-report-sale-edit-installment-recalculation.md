# Relatório — Edição de venda não recalcula parcelas em aberto

**Data:** 2026-06-08  
**Commit:** Não realizado (aguardando aprovação)

---

## Resumo executivo

A edição de venda **chamava** o recálculo parcial (`delete` pendentes + `insert` novas), mas falhas no `delete` eram **ignoradas silenciosamente**. O código marcava `financeChanged = true` mesmo quando as parcelas antigas não eram removidas, dando a impressão de sucesso sem alterar o financeiro.

Correção: extrair lógica testável em `lib/saleEditFinanceRecalc.ts`, corrigir comparação de `installment_number`, excluir `cancelado` do conjunto pendente e **propagar erros** de `delete`/`update`/`insert`.

---

## Causa exata

### 1. DELETE sem verificação de erro (causa principal)

```typescript
// ANTES — lib/saleEdit.ts
await supabase.from('finance_receipts').delete().in('id', pendingIds);
financeChanged = true; // sempre, mesmo se delete falhou
```

Se o `delete` falhasse (RLS, FK, rede, permissão), as parcelas pendentes **permaneciam** com valores antigos. O `insert` podia:
- não executar (`toInsert` vazio em alguns cenários), ou
- falhar com erro visível, ou
- criar duplicatas (menos comum).

O usuário via o alerta de confirmação (lógica de confirmação OK), a venda salvava, mas o financeiro parecia inalterado.

### 2. Comparação frágil de `installment_number`

```typescript
// ANTES
const paidNumbers = new Set(paid.map((r) => r.installment_number));
!paidNumbers.has(p.installment_number as number)
```

Se o banco retornasse `"1"` (string) e o payload tivesse `1` (number), `Set.has(1)` falhava → risco de duplicar ou pular recálculo incorreto.

### 3. Pendentes incluíam `cancelado`

Receipts com `status = 'cancelado'` eram tratados como pendentes (`!isPaidReceipt`). Podiam poluir `toDeleteIds` sem representar parcelas ativas.

### 4. O que NÃO era o problema

| Hipótese | Resultado |
|----------|-----------|
| Confirmação não chega ao backend | ❌ `window.confirm` roda antes do delete; usuário clicou OK |
| Função de recálculo não é chamada | ❌ `updateSaleFromEdit` sempre chama `buildFinancePayloads` + delete/insert |
| Status `PENDENTE` vs `pendente` | ❌ Filtro usa `!isPaidReceipt`; ambos são pendentes |
| `buildFinancePayloads` não gera parcelas | ❌ Formulário exige `first_installment_due_date` |
| Tela financeiro não recarrega | ⚠️ Risco residual — aba `/finance` aberta antes não atualiza sozinha |

---

## Fluxo corrigido

```
updateSaleFromEdit
  → buildSaleEditFinancePayloads()     # novos valores/datas
  → planPartialFinanceRecalc()         # paid / pending / toDelete / toInsert
  → confirm se needsConfirm
  → DELETE toDeleteIds  (com erro propagado)
  → INSERT toInsert     (com erro propagado)
```

### Regras preservadas

| Regra | Implementação |
|-------|---------------|
| Parcelas pagas preservadas | `paidInstallmentNumbers` exclui do `toInsert` |
| Parcelas pendentes recalculadas | `toDeleteIds` + `toInsert` |
| Entrada paga preservada | `installment_number === 0` em `paid` |
| Entrada pendente recalculada | entra em `pending` → delete + insert |
| Desconto / valor final | `final_value` no payload e `totalRestante` |
| Vencimentos | `down_payment_due_date`, `first_installment_due_date` + meses |

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `lib/saleEditFinanceRecalc.ts` | **Novo** — lógica pura de payloads, partição paid/pending, plano de recálculo |
| `lib/saleEdit.ts` | Usa módulo novo; verifica erros em delete/update/insert; logs com contadores |
| `scripts/mandatory-sale-edit-installment-recalculation-tests.ts` | **Novo** — 8 cenários |
| `scripts/validation-report-sale-edit-installment-recalculation.md` | Este relatório |

**Não alterados:** banco, migrations, GIS UI, financeiro page, contratos.

---

## Testes executados

| Comando | Resultado |
|---------|-----------|
| `mandatory-sale-edit-installment-recalculation-tests.ts` | **PASS** (8/8) |
| `mandatory-sales-schema-validation-tests.ts` | **PASS** (6/6) |
| `mandatory-contract-validation-tests.ts` | **PASS** |
| `mandatory-contract-identity-tests.ts` | **PASS** (11/11) |
| `npx next build` | **PASS** |

### Cenários cobertos

1. Sem parcelas pagas → recalcula todas  
2. Entrada paga + parcelas pendentes → preserva entrada, recalcula pendentes  
3. Parcela 1 paga + 2+ pendentes → preserva 1, recalcula abertas  
4. Alterar quantidade de parcelas → remove pendentes antigas, cria novas  
5. Alterar vencimento da 1ª parcela → atualiza datas pendentes  
6. Status `PAGO` / `paid` / `pago` + `paid_at`  
7. Coerção `installment_number` string ↔ number  
8. Entrada pendente → recalculada com novo valor  

---

## Risco residual

| Item | Risco | Mitigação |
|------|-------|-----------|
| Aba `/finance` já aberta | Médio | Recarregar página ou F5 após editar |
| Entrada **paga** com valor alterado | Baixo | Por design — entrada paga não é alterada |
| Erro de delete agora visível | Positivo | Usuário verá mensagem em vez de falso sucesso |
| `company_id`/`broker_id` no insert | Baixo | Mesmo comportamento da criação de venda |

---

## Validação manual sugerida

1. Venda parcelada com parcela 1 **paga** e 2–N **pendentes**  
2. Editar desconto / quantidade / vencimentos no GIS → confirmar alerta  
3. Abrir `/finance` (recarregar) → parcelas 2–N com novos valores/datas  
4. Parcela 1 paga deve manter valor e status  
5. Repetir com entrada paga vs entrada pendente  

---

## Aprovação

Aguardando aprovação antes de commit/push.
