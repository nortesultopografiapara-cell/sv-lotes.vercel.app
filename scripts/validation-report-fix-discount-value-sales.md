# Relatório — Correção urgente `discount_value` em vendas

**Data:** 2026-06-08  
**Problema:** `Could not find the 'discount_value' column of 'sales' in the schema cache` ao editar venda  
**Commit:** Não realizado (conforme solicitado)

---

## Causa

`lib/saleEdit.ts` enviava `discount_value` no `UPDATE` de `public.sales`, mas a coluna oficial em produção é **`discount`** (`20260519100000_post_sale_structure.sql`).

---

## Correções aplicadas

### 1. `lib/saleEdit.ts`

| Antes | Depois |
|-------|--------|
| `salePatch` com `discount` + `discount_value` | Apenas `discount` |
| Leitura: `sale.discount_value ?? sale.discount` | `sale.discount ?? sale.discount_value ?? 0` |

O campo `discount_value` permanece no **tipo do formulário** (`SaleEditLoadedContext.form`) — nome interno UI, não persistido em `sales`.

### 2. `components/contracts/ContractGenerator.tsx`

- Função `saleDiscountAmount(sale)` com fallback: `sale.discount ?? sale.discount_value ?? 0`
- DOCX e preview HTML usam o helper

---

## Onde `discount_value` permanece (permitido)

| Arquivo | Uso | Envia para `sales`? |
|---------|-----|---------------------|
| `CustomerLotFormModal.tsx` | Campo do formulário | ❌ Não |
| `GISMap.tsx` | Mapeia form → `discount` no INSERT | ❌ Não (`discount` apenas) |
| `saleEdit.ts` | Form + leitura com fallback | ❌ Não (UPDATE só `discount`) |
| `ContractGenerator.tsx` | Fallback de leitura | ❌ Não |

## Onde `discount_value` foi removido de escrita em `sales`

| Operação | Arquivo | Status |
|----------|---------|--------|
| `sales.update` | `saleEdit.ts` | ✅ Removido `discount_value` |
| `sales.insert` | `GISMap.tsx` | ✅ Já usava só `discount` |

---

## Busca final no código (`*.ts` / `*.tsx`)

```
lib/saleEdit.ts          → form + leitura fallback + discount no UPDATE
CustomerLotFormModal.tsx → formulário UI
GISMap.tsx               → discount: customerData.discount_value
ContractGenerator.tsx    → saleDiscountAmount() fallback leitura
```

**Nenhum INSERT/UPDATE em `sales` envia `discount_value`.**

---

## Testes executados

| Comando | Resultado |
|---------|-----------|
| `npx next build` | **PASS** |
| `npx tsx scripts/mandatory-contract-validation-tests.ts` | **PASS** |
| `npx tsx scripts/mandatory-contract-identity-tests.ts` | **PASS** (11/11) |

Não há testes mandatory específicos de `saleEdit`; validação manual recomendada: editar venda no mapa GIS e confirmar ausência do erro de schema.

---

## Escopo respeitado

- ❌ Sem migration
- ❌ Sem alteração de banco
- ❌ Sem alteração de financeiro/parcelas
- ✅ Contrato: apenas fallback seguro de leitura
- ✅ Campo oficial: `sales.discount`

---

## Validação manual sugerida

1. Abrir lote vendido no mapa → Editar venda
2. Alterar desconto e salvar → deve concluir sem erro
3. Reabrir edição → desconto deve aparecer corretamente
4. Gerar contrato → linha "Desconto Concedido" com valor correto
