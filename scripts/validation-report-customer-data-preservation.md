# Relatório de Validação — Preservação de dados do cliente (contrato/venda)

**Data:** 2026-06-08  
**Escopo:** Clientes, vendas, contratos — sem alterar GIS, confrontações ou financeiro  
**Commit:** não realizado (conforme solicitado)

---

## Problema reportado

Contrato `000000003/2026` (Meneses Imobiliária) gerado com campos vazios:
- Profissão / Estado civil / Bairro / CEP / Cidade → "Não Informado"

Dados de clientes já cadastrados sumiram na **edição da venda** e na **geração/regeneração do contrato**.

---

## Causa raiz

### 1. Sobrescrita com `null` no cadastro do cliente

`buildCustomerPayload` e `updateSaleFromEdit` gravavam `campo: form.campo || null`.  
Formulário de venda com campos vazios (ou não exibidos no fluxo) **apagava** RG, profissão, endereço etc. na tabela `customers`.

### 2. Merge invertido na venda (GIS)

```typescript
// ANTES (bug)
fullCustomer = { ...custDb, ...customerData };
```

`customerData` do formulário sobrescrevia o registro completo do banco, mesmo com strings vazias.

### 3. Regeneração sem camadas de backup

`loadFreshRegenerationEntities` lia apenas `customers`. Se a linha estava incompleta, o HTML saía com placeholders.

---

## Correções aplicadas

### `lib/customerIdentity.ts` (núcleo)

| Função | Papel |
|--------|--------|
| `isEmptyCustomerField` | Detecta vazio e placeholders ("Não informado") |
| `mergeCustomerData` | Une camadas com prioridade: customers → sale → contract |
| `mergePreservingCustomerFields` | Update sem apagar campos preenchidos |
| `customerPatchFromForm` | Patch só com campos não vazios |
| `buildCustomerPayload` | Aceita `existing` e preserva dados |

### Fluxos corrigidos

| Fluxo | Arquivo | Correção |
|-------|---------|----------|
| Venda / reserva | `customerIdentity.ts` | `resolveOrCreateCustomer` carrega existente antes do update |
| Geração contrato na venda | `GISMap.tsx` | `mergeCustomerData(custDb, customerData)` |
| Editar venda | `saleEdit.ts` | Patch preservando + merge com `clients` no load |
| Regenerar contrato | `contractRegeneration.ts` | Merge customer + sale + clients backup |
| Ver/PDF contrato | `buildContractViewHtml.ts` | `mergeCustomerData` nas camadas |
| Cadastro clientes | `app/customers/page.tsx` | Update preserva campos existentes |
| Template HTML | `contractTemplate.ts` | Fallback `marital_status`, `cep`, `state` |

---

## Testes criados / executados

| Comando | Resultado |
|---------|-----------|
| `npx tsx scripts/mandatory-customer-data-preservation-tests.ts` | **PASS** (7 testes) |
| `npx tsx scripts/mandatory-contract-identity-tests.ts` | **PASS** (11 testes) |
| `npx tsx scripts/mandatory-contract-lot-clause-tests.ts` | **PASS** (7 testes) |
| `npx next build` | **PASS** |

### Cenários cobertos

1. Cliente completo → contrato sem "Não informado"
2. Formulário vazio na venda → não apaga RG/profissão/endereço do banco
3. Editar venda sem alterar campos → dados preservados
4. Regeneração com `customers` incompleto → recupera de `clients`

---

## Arquivos alterados

| Arquivo |
|---------|
| `lib/customerIdentity.ts` |
| `lib/saleEdit.ts` |
| `components/map/GISMap.tsx` (somente merge na geração de contrato) |
| `lib/contractRegeneration.ts` |
| `lib/buildContractViewHtml.ts` |
| `lib/contractTemplate.ts` |
| `app/customers/page.tsx` |
| `scripts/mandatory-customer-data-preservation-tests.ts` |

**Não alterados:** GIS confrontações, financeiro, memorial, parcelas.

---

## Recuperação em produção (contratos já afetados)

1. **Verificar** tabela `clients` — pode ter backup dos campos por CPF.
2. **Completar** cadastro em Clientes se ambas as tabelas estiverem vazias.
3. **Regenerar contrato** após deploy — passará a usar `mergeCustomerData` + backup `clients`.

Dados apagados antes desta correção **não são restaurados automaticamente** se não existirem em `customers`, `clients` ou `audit_logs.old_data`.

---

## Riscos residuais

- Cliente nunca teve RG/endereço cadastrado → contrato continuará com placeholder até preenchimento manual.
- `clients` e `customers` ambos vazios → depende de reentrada de dados.
