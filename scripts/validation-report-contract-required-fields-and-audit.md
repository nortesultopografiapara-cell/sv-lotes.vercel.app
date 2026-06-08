# Relatório de Validação — Campos Obrigatórios do Comprador + Auditoria de Clientes

**Data:** 2026-06-08  
**Prioridade:** P1  
**Commit:** não realizado (conforme solicitado)

---

## Resumo

Implementado bloqueio de geração/regeneração/PDF/assinatura de contrato quando faltam dados obrigatórios do comprador, com modal de alerta e atalho para edição do cliente. Criada tabela `customer_audit_logs` e registro automático de alterações cadastrais em venda, edição de venda e formulário de clientes. Tela de histórico adicionada em Clientes.

---

## P1-A — Validação obrigatória

| Fluxo | Arquivo | Comportamento |
|-------|---------|---------------|
| Venda GIS (geração inicial) | `components/map/GISMap.tsx` | `validateCustomerForContract` antes de `generateContractHTML`; venda/financeiro seguem; contrato bloqueado + modal |
| Venda assistida / edição | `components/map/CustomerLotFormModal.tsx` | Validação no submit (Vendido / edit) |
| Regeneração API | `lib/contractRegeneration.ts`, `app/api/contracts/[id]/regenerate/route.ts` | Validação + HTTP 400 com `missingFields` |
| Preview contrato | `lib/buildContractViewHtml.ts`, `app/contracts/page.tsx` | `assertCustomerValidForContract` + modal no catch |
| PDF / Impressão | `app/contracts/page.tsx` | `ensureCustomerValidForContractAction` |
| Assinatura (ativar) | `app/contracts/page.tsx` | Mesma validação antes de marcar assinado |
| Regenerar (UI) | `app/contracts/page.tsx`, `GISMap.tsx` | Pré-validação + tratamento de `missingFields` da API |

**Modal:** `components/contracts/CustomerContractValidationModal.tsx`  
**Botão:** Abrir Cadastro do Cliente → `/customers?edit={customerId}`

---

## P1-B — Helper `validateCustomerForContract()`

**Arquivo:** `lib/validateCustomerForContract.ts`

```ts
{
  valid: boolean,
  missingFields: string[],      // obrigatórios + recomendados
  missingRequired: string[],
  missingRecommended: string[],
  customerId?: string
}
```

Campos obrigatórios: Nome, CPF, RG, Estado Civil, Profissão, Endereço, Cidade, UF.  
Recomendados: CEP, Telefone, E-mail.  
Valores "Não Informado" / vazios tratados via `isEmptyCustomerField`.

---

## P1-C — Tabela `customer_audit_logs`

**Migration:** `supabase/migrations/20260703120000_customer_audit_logs.sql`

| Campo | Tipo |
|-------|------|
| id | uuid |
| customer_id | uuid FK |
| old_data | jsonb |
| new_data | jsonb |
| changed_by | uuid |
| changed_at | timestamptz |
| source | text |

Sources: `customer_form`, `sale_edit`, `sale_create`, `contract_regeneration`, `import`, `system`

---

## P1-D — Registro automático

| Origem | Arquivo | Source |
|--------|---------|--------|
| Venda / reserva | `lib/customerIdentity.ts` → `resolveOrCreateCustomer` | `sale_create` |
| Edição de venda | `lib/saleEdit.ts` → `updateSaleFromEdit` | `sale_edit` |
| Cadastro clientes | `app/customers/page.tsx` → `handleSaveCustomer` | `customer_form` |

Campos rastreados: RG, Estado Civil, Profissão, Endereço, Bairro, Cidade, UF, CEP, Telefone, E-mail.

---

## P1-E — Histórico em Clientes

- Botão **Histórico** em cada linha (`CustomerRow`)
- Modal: `components/customers/CustomerAuditHistoryModal.tsx`
- Colunas: Data/Hora, Usuário, Campo, Valor anterior, Valor novo, Origem
- Ordenação: mais recente primeiro

---

## P1-F — Proteção contra perda de dados

`mergePreservingCustomerFields()` mantido em todos os fluxos de update (hotfix anterior + esta entrega).  
Formulários vazios não apagam RG, profissão, estado civil, endereço, etc.

---

## Testes executados

| Script | Resultado |
|--------|-----------|
| `npx tsx scripts/mandatory-contract-validation-tests.ts` | **9/9 PASSOU** |
| `npx tsx scripts/mandatory-customer-data-preservation-tests.ts` | **7/7 PASSOU** |
| `npx tsx scripts/mandatory-contract-identity-tests.ts` | **11/11 PASSOU** |
| `npx next build` | **SUCESSO** (warnings pré-existentes em `app/plans/page.tsx` — ShieldCore) |

### Cenários obrigatórios (P1)

1. Cliente completo → contrato gera normalmente — **OK**
2. Cliente sem RG → bloqueado — **OK**
3. Cliente sem profissão → bloqueado — **OK**
4. Cliente sem estado civil → bloqueado — **OK**
5. Editar cliente → auditoria detecta alteração — **OK** (lib; persistência requer migration aplicada no Supabase)
6. Editar venda → auditoria detecta alteração — **OK** (lib)
7. Regenerar contrato → dados preservados no merge — **OK**
8. Campo preenchido → não apagado por form vazio — **OK**

---

## Arquivos alterados / criados

### Novos
- `lib/validateCustomerForContract.ts`
- `lib/customerAudit.ts`
- `supabase/migrations/20260703120000_customer_audit_logs.sql`
- `components/contracts/CustomerContractValidationModal.tsx`
- `components/customers/CustomerAuditHistoryModal.tsx`
- `scripts/mandatory-contract-validation-tests.ts`
- `scripts/validation-report-contract-required-fields-and-audit.md`

### Modificados
- `lib/contractRegeneration.ts`
- `lib/buildContractViewHtml.ts`
- `lib/customerIdentity.ts`
- `lib/saleEdit.ts`
- `app/api/contracts/[id]/regenerate/route.ts`
- `app/contracts/page.tsx`
- `app/customers/page.tsx`
- `components/map/GISMap.tsx`
- `components/map/CustomerLotFormModal.tsx`
- `package.json`

---

## Riscos e pendências

1. **Migration:** executar `20260703120000_customer_audit_logs.sql` no Supabase de produção/homologação antes de usar histórico em produção.
2. **Contratos legados** com HTML já gerado e dados incompletos: preview/PDF/assinatura passam a bloquear até completar cadastro (comportamento desejado).
3. **RLS:** garantir políticas de leitura/insert em `customer_audit_logs` para usuários autenticados do tenant (se RLS estiver ativo na tabela).

---

## Diff resumido

- **Validação:** helper central + modal + integração em GIS, contratos, API regenerate, buildContractViewHtml.
- **Auditoria:** tabela + `logCustomerAudit` em venda, edição venda e cadastro; UI de histórico.
- **Preservação:** mantida via `mergePreservingCustomerFields` (sem regressão nos testes de preservação).
- **Testes:** novo script `mandatory-contract-validation-tests.ts` + scripts npm `test:contract-validation` e `test:customer-preservation`.
