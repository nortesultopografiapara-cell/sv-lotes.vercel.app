# Relatório de Validação — Histórico Operacional do Lote (ETAPA 1)

**Data:** 2026-06-08  
**Commit:** não realizado (conforme solicitado)

---

## Resumo

Implementado rastreamento operacional por lote via tabela `lot_audit_logs`, helper central `lib/lotAudit.ts`, registro automático nos fluxos GIS/venda/contrato/financeiro e nova aba **Histórico** no popup do mapa.

---

## 1. Migration `lot_audit_logs`

**Arquivo:** `supabase/migrations/20260704120000_lot_audit_logs.sql`

| Campo | Tipo |
|-------|------|
| id | uuid PK |
| company_id | uuid |
| project_id | uuid |
| block_id | uuid |
| lot_id | uuid |
| sale_id | uuid nullable |
| contract_id | uuid nullable |
| user_id | uuid nullable |
| action | text NOT NULL |
| title | text NOT NULL |
| description | text |
| old_data / new_data | jsonb |
| created_at | timestamptz |
| source | text NOT NULL |

Índices: `project_id`, `block_id`, `lot_id`, `sale_id`, `contract_id`, `created_at DESC`  
RLS: `authenticated` SELECT + INSERT

---

## 2. Helper `lib/lotAudit.ts`

| Função | Uso |
|--------|-----|
| `logLotAuditEvent()` | Insert com try/catch silencioso (`console.warn`) |
| `getLotAuditHistory()` | Lista por `block_id`, ordem desc |
| `formatLotAuditEvent()` | UI: badge, labels, origem |
| `buildLotAuditPayload()` | Montagem de payload (testável) |
| `lotAuditContextFromBlock()` | Contexto a partir do lote |
| `sortLotAuditHistory()` | Ordenação `created_at` desc |

**Actions suportadas:** `front_identified`, `front_corrected`, `confrontation_auto`, `confrontation_manual`, `status_changed`, `reserved`, `sold`, `sale_edited`, `value_changed`, `contract_generated`, `contract_regenerated`, `contract_viewed`, `finance_created`, `payment_received`, `payment_reversed`, `customer_changed`, `note_added`, etc.

---

## 3. Eventos registrados

| Origem | Eventos |
|--------|---------|
| **Mapa GIS** (`GISMap.tsx`, `map/page.tsx`) | `front_identified`, `front_corrected`, `confrontation_manual`, `confrontation_auto`, `value_changed`, `status_changed`, `reserved`, `sold`, `contract_generated`, `contract_viewed`, bloqueio contrato (`note_added`) |
| **Vendas** (`saleEdit.ts`) | `sale_edited`, `customer_changed`, `finance_created` |
| **Contratos** (`contractRegeneration.ts`) | `contract_regenerated` |
| **Financeiro** (`finance/page.tsx`) | `payment_received`, `payment_reversed` |

Nenhuma lógica de negócio alterada — apenas `void logLotAuditEvent(...)` após operações existentes.

---

## 4. UI — Popup do lote

Nova aba: **Resumo | Confrontações | Comercial | Histórico**

- Linha do tempo compacta (scroll max 52)
- Data/hora, título, descrição, usuário, origem
- Badge colorido por tipo de evento
- Estado vazio: *"Sem histórico registrado para este lote."*

---

## 5. Testes executados

| Script | Resultado |
|--------|-----------|
| `npm run test:lot-audit` | **6/6 PASSOU** |
| `mandatory-contract-validation-tests` | **9/9 PASSOU** |
| `mandatory-customer-data-preservation-tests` | **7/7 PASSOU** |
| `mandatory-assisted-confrontation-tests` | **PASSOU** |
| `npx next build` | **SUCESSO** |

### Cenários lot-audit (10)

1. Payload correto — **OK**
2. Falha no log não quebra fluxo — **OK**
3. Venda → `sold` — **OK** (payload)
4. Reserva → `reserved` — **OK**
5. Contrato gerado → `contract_generated` — **OK**
6. Regenerado → `contract_regenerated` — **OK**
7. Frente corrigida → `front_corrected` — **OK**
8. Confrontação auto → `confrontation_auto` — **OK**
9. Ordenação desc — **OK**
10. Histórico vazio — **OK**

---

## 6. Arquivos alterados / criados

### Novos
- `supabase/migrations/20260704120000_lot_audit_logs.sql`
- `lib/lotAudit.ts`
- `scripts/mandatory-lot-audit-tests.ts`
- `scripts/validation-report-lot-audit-history.md`

### Modificados
- `components/map/GISMap.tsx` — logs + aba Histórico
- `app/map/page.tsx` — `front_identified`, confrontação auto userId
- `lib/automaticConfrontation.ts` — `confrontation_auto` por lote
- `lib/saleEdit.ts` — `sale_edited`, `customer_changed`, `finance_created`
- `lib/contractRegeneration.ts` — `contract_regenerated`
- `app/finance/page.tsx` — `payment_received`, `payment_reversed`
- `package.json` — `test:lot-audit`, `test:assisted-confrontation`

---

## 7. Riscos remanescentes

1. **Migration pendente no Supabase** — executar `20260704120000_lot_audit_logs.sql` antes de usar em produção.
2. **Histórico retroativo** — eventos anteriores à implantação não aparecem (apenas novos registros).
3. **Regeneração via API** — log em `contractRegeneration.ts` (server); popup carrega via client Supabase (RLS authenticated).
4. **Identificar Frentes em lote** — um log por lote atualizado (pode gerar volume alto em projetos grandes).
5. **Confrontação automática** — um log por lote processado no batch (idem).
6. **Pagamento/estorno** — log só quando `block_id` / `blockId` disponível no recibo/fluxo.

---

## 8. O que NÃO foi alterado

- Cálculo GIS (frente, medidas, confrontações)
- Memorial descritivo
- Templates/regras de contrato
- Regras financeiras e de parcelamento
- Fluxos de venda (apenas observabilidade adicionada)
