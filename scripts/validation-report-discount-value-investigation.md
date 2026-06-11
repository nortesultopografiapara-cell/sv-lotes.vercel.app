# Relatório — Investigação do campo `discount_value`

**Data:** 2026-06-08  
**Escopo:** Rastrear origem, migrations e uso de `discount_value` em vendas/contratos/financeiro  
**Alterações no código:** Nenhuma (somente investigação)

---

## 1. Commit que introduziu `discount_value`

| Commit | Data | Mensagem | Arquivos |
|--------|------|----------|----------|
| **`2a8d74d`** | 2026-05-18 15:26 | `feat(sales): Add financial fields and validations` | `GISMap.tsx`, `sales_finance_fields.sql`, `sales_finance_fields_v2.sql` |

**Commits subsequentes relevantes:**

| Commit | Impacto |
|--------|---------|
| `1248a67` | `ContractGenerator.tsx` — exibe `sale.discount_value` |
| `efb941b` | `GISMap.tsx` — **remove** `discount_value` do INSERT; passa a gravar só `discount` |
| `dcd6dc6` | `CustomerLotFormModal.tsx` — formulário com `discount_value` |
| `b1c2c39` | `saleEdit.ts` — **UPDATE** grava `discount` **e** `discount_value` |

---

## 2. Migrations correspondentes

### Coluna `discount` (oficial, numerada)

```sql
-- 20260519100000_post_sale_structure.sql
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount decimal;
```

Também define: `lot_price`, `total_value`, `payment_type`, etc.

### Coluna `discount_value` (migrations órfãs, sem timestamp)

```sql
-- sales_finance_fields.sql
-- sales_finance_fields_v2.sql (duplicata)
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_value decimal default 0;
```

**Mesmos arquivos órfãos também adicionam** (ausentes em migrations `2026*.sql`):

- `final_value`
- `down_payment_due_date`
- `first_installment_due_date`
- `installment_value`

### Conclusão sobre migrations

| Campo | Migration numerada (`2026*.sql`) | Migration órfã |
|-------|----------------------------------|----------------|
| `discount` | ✅ `20260519100000_post_sale_structure.sql` | — |
| `discount_value` | ❌ **Não existe** | ✅ `sales_finance_fields.sql` |

**Risco:** ambientes que aplicaram apenas migrations com prefixo `20260…` podem **não ter** `discount_value` (nem `final_value`, etc.), mesmo com o código referenciando esses campos.

---

## 3. Migration aplicada no Supabase?

**Não foi possível verificar remotamente** neste ambiente:

- Sem `.env.local` / projeto linkado (`supabase link` não configurado)
- `npx supabase migration list` → `Cannot find project ref`

### SQL recomendado no Supabase SQL Editor

**Colunas em `sales`:**

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sales'
  AND column_name IN (
    'discount', 'discount_value', 'final_value',
    'total_value', 'agreed_price', 'lot_price',
    'installment_value', 'down_payment_due_date',
    'first_installment_due_date'
  )
ORDER BY column_name;
```

**Histórico de migrations aplicadas:**

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version LIKE '%sales%' OR version LIKE '%finance%'
ORDER BY version;
```

Procurar versões `sales_finance_fields` ou `sales_finance_fields_v2`.

---

## 4. A tabela `sales` possui `discount_value`?

| Evidência | Resultado |
|-----------|-----------|
| Schema no repositório (numerado) | **Provavelmente NÃO** — só `discount` |
| Schema no repositório (órfão) | **SIM** — se `sales_finance_fields.sql` foi aplicado manualmente ou via `db push` completo |
| Verificação remota | **Pendente** — executar SQL acima |

---

## 5. O código deveria usar outro campo?

**Sim — campo canônico existente: `discount`.**

| Camada | Campo usado hoje | Campo canônico recomendado |
|--------|------------------|----------------------------|
| Formulário UI | `discount_value` (string) | OK como nome de formulário |
| INSERT venda (`GISMap`) | `discount` ← mapeia de `customerData.discount_value` | ✅ Correto desde `efb941b` |
| UPDATE venda (`saleEdit`) | `discount` **e** `discount_value` | ⚠️ Duplicado — `discount_value` pode falhar se coluna ausente |
| Leitura venda (`saleEdit`) | `sale.discount_value ?? sale.discount` | ✅ Fallback já existe |
| Contrato DOCX (`ContractGenerator`) | `sale.discount_value` apenas | ⚠️ Deveria usar `sale.discount_value ?? sale.discount` |
| Parcelas (`buildFinancePayloads`) | `data.final_value` (não usa `discount_value` diretamente) | ✅ Desconto já embutido no valor final |

**Resumo:** o desconto numérico deveria persistir em **`sales.discount`**. `discount_value` é redundante e foi introduzido em migrations não numeradas.

---

## 6. Arquivos encontrados

| Arquivo | Uso de `discount_value` |
|---------|-------------------------|
| `components/map/GISMap.tsx` | Formulário legado; INSERT usa `discount` (não `discount_value`) |
| `components/map/CustomerLotFormModal.tsx` | Campo de formulário + cálculo `final_value` |
| `lib/saleEdit.ts` | Tipo form, leitura com fallback, **UPDATE grava ambos** |
| `components/contracts/ContractGenerator.tsx` | Exibição em DOCX/HTML de contrato |
| `supabase/migrations/sales_finance_fields.sql` | `ADD COLUMN discount_value` |
| `supabase/migrations/sales_finance_fields_v2.sql` | Duplicata |
| `app/map/page.tsx` | **Nenhuma referência** — delega a `GISMap` |
| `lib/contractTemplate.ts` | **Nenhuma** referência a discount |
| `lib/contractRegeneration.ts` | **Nenhuma** — usa `total_value` / `agreed_price` |
| `app/contracts/page.tsx` | Usa `final_value`, não `discount_value` |

---

## 7. Consultas Supabase afetadas

| Operação | Arquivo | Campos envolvidos | Risco se coluna ausente |
|----------|---------|-------------------|-------------------------|
| `sales.select('*')` | `saleEdit.ts` | Leitura — fallback OK | Baixo |
| `sales.update({ discount_value, final_value, … })` | `saleEdit.ts` | Escrita | **Alto** — erro de coluna inexistente |
| `sales.insert({ discount, … })` | `GISMap.tsx` | Escrita | Baixo — usa `discount` |
| `finance_receipts.insert` | `GISMap.tsx`, `saleEdit.ts` | Parcelas por `final_value` | Médio — não usa `discount_value` |
| Contrato (leitura sale join) | `ContractGenerator.tsx` | Exibição | Baixo — mostra 0 se null |

---

## 8. Migration necessária (se faltar)

Se o SQL de verificação confirmar ausência de `discount_value`, há **duas opções**:

### Opção A — Alinhar banco ao código (migration numerada)

Criar migration oficial, ex.:

`20260801120000_sales_finance_discount_fields.sql`

```sql
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_value decimal DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS final_value decimal DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS down_payment_due_date date;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS first_installment_due_date date;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS installment_value decimal DEFAULT 0;

-- Sincronizar dados legados
UPDATE public.sales
SET discount_value = COALESCE(discount_value, discount, 0)
WHERE discount_value IS NULL OR discount_value = 0;
```

### Opção B — Alinhar código ao banco (recomendada)

- Remover `discount_value` de `saleEdit` UPDATE
- Persistir apenas em `discount`
- Manter `discount_value` só no formulário UI
- Ajustar `ContractGenerator` para `sale.discount ?? sale.discount_value`
- **Não exige** nova coluna se `discount` já existe

---

## 9. Correção recomendada

**Recomendação: Opção B** (menor risco, campo `discount` já está na migration numerada `20260519100000`).

1. **`lib/saleEdit.ts`** — no `salePatch`, remover `discount_value`; manter só `discount`.
2. **`components/contracts/ContractGenerator.tsx`** — ler `sale.discount ?? sale.discount_value ?? 0`.
3. **Formulários** — manter `discount_value` como nome interno do form; mapear para `discount` ao salvar.
4. **Migrations órfãs** — arquivar ou consolidar `sales_finance_fields*.sql` em migration numerada **somente se** `final_value` e datas de vencimento forem necessários no banco (hoje `saleEdit` também grava `final_value`, `down_payment_due_date`, etc.).
5. **Verificar produção** com os SQLs da seção 3 antes de qualquer deploy.

---

## 10. Linha do tempo resumida

```
20260519100000  →  sales.discount (oficial)
2a8d74d         →  sales.discount_value (migration órfã + UI + GISMap insert com discount_value)
efb941b         →  GISMap insert corrigido para sales.discount
b1c2c39         →  saleEdit reintroduz gravação em discount_value no UPDATE
```

**Inconsistência atual:** criação de venda grava `discount`; edição de venda grava `discount` + `discount_value`; contrato lê só `discount_value`.
