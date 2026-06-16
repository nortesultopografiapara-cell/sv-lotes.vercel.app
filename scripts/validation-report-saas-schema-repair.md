# Relatório — Schema SaaS `company_contracts` (produção)

**Data:** 2026-06-08  
**Projeto Supabase:** `aezktedncttwpqeunjej`  
**Erro em produção:** `Could not find the 'regenerated_at' column of 'company_contracts' in the schema cache`

---

## 1. Estrutura atual em produção (`company_contracts`)

Colunas confirmadas via PostgREST:

| Coluna | Status |
|--------|--------|
| `id` | existe |
| `company_id` | existe |
| `subscription_id` | existe |
| `contract_url` | existe |
| `contract_number` | existe |
| `version` | existe |
| `generated_at` | existe |
| `status` | existe |
| `created_at` | existe |
| `updated_at` | existe |
| `pdf_signed_url` | existe |
| `contract_pdf_url` | existe (legado) |
| `superseded_by` | ausente |
| `regenerated_from` | ausente |
| `regenerated_at` | ausente (causa do erro) |
| `regenerated_by` | ausente |

### `company_contract_signatures`

| Item | Status |
|------|--------|
| Tabela | existe |
| Fase 2 | existe |
| `provider_signer_name` | ausente |
| `provider_signed_at` | ausente |
| `CLIENT_SIGNED` | constraint antiga |

---

## 2. Migrations pendentes

| Migration | Produção |
|-----------|----------|
| `20260601120000_company_contracts.sql` | Parcial |
| `20260608120000_company_contract_number_seq.sql` | Pendente |
| `20260616090000_company_contract_signatures.sql` | Aplicada |
| `20260617090000_company_contract_bilateral_signatures.sql` | Pendente |
| `20260618120000_company_contracts_saas_schema_repair.sql` | Pendente |

---

## 3. Como aplicar

Executar no SQL Editor do Supabase:

`supabase/migrations/20260618120000_company_contracts_saas_schema_repair.sql`

Inclui `NOTIFY pgrst, 'reload schema';`

---

## 4. Validação local

- `npm run test:contract-signature` — OK
- `npx next build` — OK

---

## 5. Pós-reparo

1. Push/deploy do commit `464224d` (bilateral)
2. `npx tsx tmp/validate-prod-saas-bilateral-e2e.ts`
