# Módulo Bancário — SV LOTES 2.0

Documento técnico de planejamento e implementação.  
**Branch:** `develop` · **Status:** Fase 1 implementada (estrutura base + MOCK)  
**Referência:** [ROADMAP_SVLOTES_2.md](./ROADMAP_SVLOTES_2.md)

---

## 1. Objetivo do módulo

Permitir que **cada empresa (tenant)** cadastre sua conta bancária e emita **boletos registrados** e **cobranças Pix** diretamente pelo SV LOTES, vinculados às **parcelas** geradas por vendas/contratos.

Ao confirmar pagamento via retorno bancário (webhook ou arquivo CNAB):

- Baixar automaticamente a parcela em `finance_receipts`
- Registrar entrada em `cash_movements` (fluxo de caixa existente)
- Gerar/atualizar recibo PDF quando aplicável
- Registrar tarifas, transferências e demais movimentações bancárias

O módulo é **independente** da cobrança Asaas do **Master Console** (assinatura SaaS). Empresas clientes usam **seus próprios bancos**; o SV LOTES atua como orquestrador.

### Premissas de negócio (preservadas)

1. Toda venda parte de um lote.
2. Toda venda gera contrato.
3. Todo contrato gera parcelas (`finance_receipts`).
4. Toda parcela paga gera movimentação financeira (`cash_movements`).

### Escopo inicial

- Emissão manual e semi-automática de cobrança por parcela
- Retorno automático de pagamento
- Primeiros conectores: **Sicoob** → **Sicredi**

---

## 2. Bancos prioritários

| Ordem | Banco | Código COMPE | Prioridade | Observação |
|-------|-------|--------------|------------|------------|
| 1 | **Sicoob** | 756 | Alta | Primeiro conector; API cooperativa amplamente usada em loteadoras |
| 2 | **Sicredi** | 748 | Alta | Segundo conector; perfil similar ao Sicoob |
| 3 | Bradesco | 237 | Média | Fase posterior |
| 4 | Banco do Brasil | 001 | Média | Fase posterior |
| 5 | Caixa Econômica Federal | 104 | Média | Fase posterior |

Cada banco terá um **adapter** (`BankProvider`) com interface comum; credenciais e certificados variam por instituição.

---

## 3. Funcionalidades

### 3.1 Cadastro e configuração

| Funcionalidade | Descrição |
|----------------|-----------|
| Cadastro de conta bancária por empresa | Agência, conta, convênio, carteira, espécie de documento |
| Credenciais por banco | Client ID/secret, certificado A1/A3, chave Pix, webhook secret |
| Ambiente sandbox / produção | Toggle por integração; homologação obrigatória antes de produção |
| Teste de conexão | Validar credenciais sem emitir cobrança real |

### 3.2 Emissão de cobrança

| Funcionalidade | Descrição |
|----------------|-----------|
| Boleto registrado | Linha digitável, código de barras, PDF, nosso número |
| QR Code Pix | Estático ou dinâmico (preferir dinâmico com `txid` único por parcela) |
| Link de pagamento | URL hospedada pelo banco ou página SV LOTES com Pix + boleto |
| Reemissão / 2ª via | Nova cobrança ou atualização conforme regras do banco |
| Cancelamento | Baixa/cancelamento no banco + status local |

### 3.3 Retorno e conciliação

| Funcionalidade | Descrição |
|----------------|-----------|
| Webhook bancário | POST assinado → processamento assíncrono idempotente |
| Retorno CNAB (fase 2+) | Importação de arquivo de retorno quando webhook não disponível |
| Baixa automática de parcelas | `finance_receipts.status` → `pago`, `paid_at`, `paid_amount` |
| Lançamento automático no financeiro | `cash_movements` tipo `entrada`, categoria `parcela`, `source_table = bank_charges` |
| Tarifas | Saída automática (categoria `tarifa_bancaria`) vinculada à cobrança |
| Transferências | Registro de TED/PIX entre contas da empresa |
| Saídas diversas | Estornos, devoluções, chargebacks |

---

## 4. Modelo de dados previsto

> **Nota:** tabelas abaixo são **proposta de planejamento**. Migrations serão criadas em fase de implementação na `develop`.

### 4.1 `bank_integrations`

Configuração da integração bancária por empresa.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | |
| `tenant_id` | uuid FK → `companies` | Empresa dona |
| `provider` | text | `sicoob`, `sicredi`, `bradesco`, `bb`, `caixa` |
| `environment` | text | `sandbox`, `production` |
| `bank_code` | text | COMPE |
| `agency` | text | Agência |
| `account_number` | text | Conta + dígito |
| `account_type` | text | corrente, poupança |
| `covenant_code` | text | Convênio/carteira (boleto) |
| `pix_key` | text | Chave Pix recebedora (opcional) |
| `webhook_url` | text | URL registrada no banco |
| `is_active` | boolean | Integração habilitada |
| `is_default` | boolean | Conta padrão da empresa |
| `metadata` | jsonb | Campos específicos por banco |
| `created_at`, `updated_at` | timestamptz | |

**RLS:** isolamento por `tenant_id` (padrão SV LOTES).

### 4.2 `bank_credentials`

Credenciais sensíveis — **nunca em texto plano**.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | |
| `integration_id` | uuid FK → `bank_integrations` | |
| `credential_type` | text | `oauth`, `certificate`, `api_key`, `webhook_secret` |
| `encrypted_payload` | text / bytea | Ciphertext (Supabase Vault ou app-level AES-256-GCM) |
| `key_version` | integer | Rotação de chaves |
| `expires_at` | timestamptz | Validade certificado |
| `created_at`, `updated_at` | timestamptz | |

**Acesso:** somente service role / Edge Function; UI nunca exibe secret completo.

### 4.3 `bank_charges`

Cobrança emitida (boleto, Pix ou híbrido).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `integration_id` | uuid FK | |
| `finance_receipt_id` | uuid FK → `finance_receipts` | Parcela vinculada |
| `sale_id` | uuid FK → `sales` | Denormalizado para consulta |
| `customer_id` | uuid FK → `customers` | Pagador |
| `charge_type` | text | `boleto`, `pix`, `boleto_pix` |
| `external_id` | text | ID no banco |
| `our_number` | text | Nosso número |
| `txid` | text | Pix txid |
| `amount` | numeric | Valor nominal |
| `due_date` | date | Vencimento |
| `status` | text | `pending`, `registered`, `paid`, `cancelled`, `expired`, `failed` |
| `barcode` | text | Código de barras |
| `digitable_line` | text | Linha digitável |
| `pix_qr_code` | text | Payload EMV ou URL |
| `pix_qr_image_url` | text | Imagem QR (se hospedada) |
| `payment_url` | text | Link de pagamento |
| `pdf_url` | text | Boleto PDF |
| `paid_at` | timestamptz | Data pagamento confirmada |
| `paid_amount` | numeric | Valor efetivamente pago |
| `fee_amount` | numeric | Tarifa descontada |
| `idempotency_key` | text UNIQUE | Evita duplicidade na emissão |
| `metadata` | jsonb | Resposta bruta do banco |
| `created_at`, `updated_at` | timestamptz | |

### 4.4 `bank_webhook_events`

Log de eventos recebidos (auditoria + reprocessamento).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | |
| `tenant_id` | uuid | Nullable até resolver integração |
| `integration_id` | uuid FK | |
| `provider` | text | |
| `event_type` | text | `payment.confirmed`, `payment.cancelled`, etc. |
| `external_event_id` | text | ID do banco |
| `payload` | jsonb | Body completo |
| `signature_valid` | boolean | |
| `processing_status` | text | `pending`, `processed`, `ignored`, `failed` |
| `processed_at` | timestamptz | |
| `error_message` | text | |
| `idempotency_key` | text UNIQUE | `(provider, external_event_id)` |
| `created_at` | timestamptz | |

### 4.5 `bank_cash_movements`

Ponte entre evento bancário e `cash_movements` existente (ou extensão direta).

**Opção recomendada:** usar `cash_movements` existente com:

- `source_table = 'bank_charges'`
- `source_id = bank_charges.id`
- `category` ∈ `parcela`, `tarifa_bancaria`, `transferencia`, `estorno`

Tabela auxiliar opcional `bank_cash_movements` apenas se precisar de campos bancários extras (NSU, autorização, COMPE origem):

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | |
| `cash_movement_id` | uuid FK → `cash_movements` | |
| `bank_charge_id` | uuid FK | |
| `webhook_event_id` | uuid FK | |
| `bank_reference` | text | NSU / endToEndId Pix |
| `movement_kind` | text | `payment`, `fee`, `transfer`, `refund` |

### 4.6 Relacionamentos

```
companies (tenant)
  └── bank_integrations
        └── bank_credentials
        └── bank_charges ──→ finance_receipts ──→ sales ──→ contracts
              └── bank_webhook_events
              └── cash_movements (via source_table/source_id)
                    └── bank_cash_movements (opcional)
```

**Regra:** uma parcela pode ter **múltiplas cobranças** históricas (reemissões), mas apenas **uma cobrança ativa** por vez (`status IN ('pending','registered')`).

---

## 5. Telas necessárias

### 5.1 Configurações → Integração Bancária

**Rota sugerida:** `/settings/banking` (aba em Settings existente)

- Listar integrações da empresa
- Wizard: escolher banco → ambiente → dados da conta → credenciais → testar conexão
- Upload certificado (.pfx) com senha
- Toggle sandbox/produção
- Log de webhooks recentes (somente admin)

### 5.2 Financeiro → Parcelas → Gerar Boleto/Pix

**Extensão:** `app/finance/page.tsx` (ações por parcela)

- Botão **Gerar cobrança** (se integração ativa)
- Modal: boleto, Pix ou ambos
- Exibir linha digitável, QR, link, PDF
- Reenviar por WhatsApp/e-mail (integração futura)
- Status da cobrança em tempo real

### 5.3 Financeiro → Fluxo de Caixa

**Extensão:** módulo existente (`cash_movements`)

- Filtro por origem bancária
- Badge "via Sicoob" / "via Sicredi"
- Conciliação: pendências vs extrato
- Tarifas agrupadas por integração

### 5.4 Portal / App do Cliente (fase posterior)

- 2ª via de boleto/Pix por CPF + contrato
- Histórico de pagamentos
- Notificação de vencimento

---

## 6. APIs internas necessárias

Todas sob `app/api/banking/` (proposta). Autenticação: sessão Supabase + `tenant_id`.

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/banking/integrations` | Listar integrações da empresa |
| POST | `/api/banking/integrations` | Criar integração |
| PATCH | `/api/banking/integrations/[id]` | Atualizar config |
| DELETE | `/api/banking/integrations/[id]` | Desativar (soft delete) |
| POST | `/api/banking/integrations/[id]/test` | Testar conexão |
| POST | `/api/banking/integrations/[id]/credentials` | Salvar credenciais criptografadas |
| POST | `/api/banking/charges` | Gerar boleto/Pix para parcela |
| GET | `/api/banking/charges/[id]` | Consultar cobrança |
| GET | `/api/banking/charges?receipt_id=` | Cobranças de uma parcela |
| POST | `/api/banking/charges/[id]/cancel` | Cancelar cobrança |
| POST | `/api/banking/charges/[id]/refresh` | Sincronizar status com banco |
| POST | `/api/banking/webhooks/[provider]` | Entrada pública de webhook (sem auth; validação por assinatura) |
| POST | `/api/banking/reconcile` | Conciliação manual ou batch |
| GET | `/api/banking/webhook-events` | Auditoria (admin) |

### Camada de serviço (lib)

```
lib/banking/
  types.ts
  registry.ts              # BankProvider registry
  providers/
    sicoob/
    sicredi/
  charges/createCharge.ts
  charges/reconcilePayment.ts
  webhooks/processWebhook.ts
  crypto/credentials.ts
```

Padrão similar ao existente em `lib/payments/providers/asaas.ts` (SaaS Master), porém **separado** e multi-tenant.

---

## 7. Fluxo completo

```
Parcela criada (finance_receipts — venda/contrato)
        ↓
Operador ou regra automática solicita cobrança
        ↓
API POST /api/banking/charges
        ↓
Adapter Sicoob/Sicredi registra boleto e/ou Pix
        ↓
bank_charges persistido (registered)
        ↓
Cliente recebe cobrança (PDF, link, WhatsApp, carnê)
        ↓
Cliente paga (boleto compensado ou Pix confirmado)
        ↓
Banco envia webhook (ou retorno CNAB)
        ↓
POST /api/banking/webhooks/[provider]
        ↓
bank_webhook_events (idempotência)
        ↓
reconcilePayment():
  • finance_receipts → pago
  • cash_movements → entrada
  • tarifa → saída (se houver)
  • recibo PDF (opcional/async)
        ↓
Fluxo de Caixa atualizado
        ↓
Dashboard / relatórios refletem pagamento
```

### Diagrama de estados — `bank_charges`

```
pending → registered → paid
              ↓           ↑
         cancelled    expired
              ↓
           failed
```

---

## 8. Riscos e cuidados

| Risco | Mitigação |
|-------|-----------|
| Vazamento de credenciais | Criptografia em repouso; Vault; nunca logar secrets; mascarar na UI |
| Certificados A1 expirados | Alerta 30 dias antes; bloqueio de emissão se inválido |
| Homologação bancária | Sandbox obrigatório; checklist por banco antes de `production` |
| Webhook duplicado | `idempotency_key` único; transação DB; status `processed` imutável |
| Pagamento duplicado | Verificar `finance_receipts.status` antes de baixar; lock otimista |
| Valor divergente | Registrar `paid_amount` ≠ `amount`; fila de revisão manual |
| LGPD | Dados bancários do pagador mínimos necessários; retenção de logs definida |
| Indisponibilidade do banco | Retry com backoff; fila de reprocessamento; status `failed` visível |
| Misturar com Asaas Master | Namespaces separados (`lib/banking` vs `lib/payments` SaaS) |
| RLS incorreto | Testes de isolamento multi-tenant em toda API |

### Auditoria obrigatória

- Quem emitiu cobrança (`created_by`)
- Payload webhook completo (com mascaramento de PII se necessário)
- Histórico de alteração de status
- Logs em `public.logs` para ações críticas

---

## 9. Ordem recomendada de implementação

### Fase 1 — Estrutura genérica (develop)

- [x] Documento aprovado (este arquivo)
- [x] Migrations: `bank_integrations`, `bank_credentials`, `bank_charges`, `bank_webhook_events`, `bank_cash_movements`
- [x] Interface `BankProvider` + registry + provider MOCK
- [ ] Criptografia de credenciais (Fase 1.5 — antes de conectar banco real)
- [ ] APIs CRUD integração persistente (Fase 1.5)
- [x] Tela Settings → Integração Bancária MOCK (Fase 1.1)
- [x] Feature flag global `BANKING_MODULE_ENABLED=false` (desativado por padrão)

### Fase 1.1 — Interface MOCK (develop)

- [x] Aba Integração Bancária em Configurações (flag UI)
- [x] Rotas `/api/banking/mock/*` protegidas
- [x] Painel teste conexão + boleto + Pix fictícios

### Fase 2 — Sicoob

- [ ] Adapter Sicoob (sandbox)
- [ ] Emissão boleto registrado
- [ ] Emissão Pix dinâmico
- [ ] Webhook Sicoob + baixa automática
- [ ] Integração UI Financeiro → Gerar cobrança
- [ ] Testes homologação Sicoob

### Fase 3 — Sicredi

- [ ] Adapter Sicredi (reutilizar contratos da Fase 1)
- [ ] Paridade funcional com Sicoob
- [ ] Homologação Sicredi

### Fase 4 — Cobrança automática e lembretes

- [ ] Geração automática X dias antes do vencimento
- [ ] Lembretes WhatsApp/e-mail (parcela + link Pix/boleto)
- [ ] Retorno CNAB (se necessário)
- [ ] Conciliação bancária avançada

### Fase 5 — Portal / App do cliente

- [ ] 2ª via self-service
- [ ] Notificações push
- [ ] Histórico de pagamentos

---

## 10. O que NÃO fazer agora

| Restrição | Motivo |
|-----------|--------|
| **Não conectar banco real** | Aguardar migrations, adapters e sandbox testados |
| **Não publicar na `main`** | Todo código passa por `develop` + preview + PR |
| **Não alterar cobrança Asaas do Master** | `lib/payments/providers/asaas.ts`, SaaS billing e webhooks Master permanecem intactos |
| **Não afetar clientes atuais** | Feature flag; opt-in por empresa; fluxo manual de recebimento continua funcionando |
| **Não substituir carnê/recibo existente** | Estender, não remover |
| **Não armazenar certificado em bucket público** | Storage privado + criptografia |

---

## Referências no código atual

| Área | Arquivo / tabela | Uso no módulo bancário |
|------|------------------|------------------------|
| Parcelas | `finance_receipts` | Origem da cobrança |
| Fluxo de caixa | `cash_movements` | Destino do lançamento |
| Vendas | `sales` | Contexto da parcela |
| Contratos | `contracts` | Referência legal |
| Empresas | `companies` | Tenant / `bank_integrations.tenant_id` |
| SaaS (não mexer) | `lib/payments/providers/asaas.ts` | Apenas referência de padrão adapter |

---

## Fase 1 implementada — estrutura base e MOCK provider

**Commit:** `feat(banking): add base banking module architecture` · Branch `develop`

### Entregas

| Item | Caminho |
|------|---------|
| Migration idempotente | `supabase/migrations/20260825150000_banking_module_phase1.sql` |
| Tipos TypeScript | `lib/banking/types.ts` |
| Interface genérica | `lib/banking/BankProvider.ts` |
| Registry + barrel | `lib/banking/registry.ts`, `lib/banking/index.ts` |
| Feature flag | `lib/banking/config.ts` · `BANKING_MODULE_ENABLED=false` |
| Provider MOCK | `lib/banking/providers/mockBankProvider.ts` |
| Idempotência webhook (MOCK/testes) | `lib/banking/webhookIdempotency.ts` |
| Testes obrigatórios | `npm run test:banking-mock` |

### Comportamento do MOCK

- Gera linha digitável, código de barras, QR Pix EMV e link de pagamento **fictícios**
- Status inicial `PENDING` — **sem cobrança real**
- `parseWebhook` deduplica por `idempotency_key` (cache em memória; DB na Fase 2)
- `reconcilePayment` retorna estrutura válida para `cash_movements` (entrada parcela + tarifa opcional)

### Fora do escopo desta fase (intencional)

- Nenhuma tela visível com `BANKING_MODULE_ENABLED=false`
- Sem alteração em `lib/payments/` (Asaas Master)
- Sem conexão bancária real

---

## Fase 1.1 — Interface interna MOCK protegida por feature flag

**Commit:** `feat(banking): add mock banking admin interface` · Branch `develop`

### Entregas

| Item | Caminho |
|------|---------|
| Aba Configurações | `components/settings/CompanySettingsV2Shell.tsx` · `#bancario` |
| Layout legacy | `app/settings/page.tsx` |
| Painel UI | `components/banking/BankingIntegrationPanel.tsx` |
| Guard de rotas | `lib/banking/bankingRouteGuard.ts` |
| Handlers MOCK | `lib/banking/mockApiHandlers.ts` |
| POST test-connection | `app/api/banking/mock/test-connection/route.ts` |
| POST create-boleto | `app/api/banking/mock/create-boleto/route.ts` |
| POST create-pix | `app/api/banking/mock/create-pix/route.ts` |

### Feature flags

| Variável | Escopo | Padrão |
|----------|--------|--------|
| `BANKING_MODULE_ENABLED` | API / servidor | `false` |
| `NEXT_PUBLIC_BANKING_MODULE_ENABLED` | UI Configurações | `false` (deve coincidir) |

Com ambas `false`: nenhuma aba, nenhuma rota funcional (404).

### UI (quando flag ativa)

- Status: MOCK / Sandbox
- Banco: MOCK · Ambiente: SANDBOX · Integração: DRAFT
- Botões: Testar conexão · Gerar boleto mock · Gerar Pix mock
- Resultado: linha digitável, código de barras, QR Pix, link fictício, status `PENDING`

### Segurança

- Rotas exigem sessão autenticada + tenant (`authorizeTenantBilling`)
- Apenas `provider=MOCK` aceito; Sicoob/Sicredi retornam 400
- Sem escrita em `finance_receipts` / `cash_movements`
- Sem persistência em banco nesta subfase (memória MOCK)

---

## Próximo passo sugerido

1. Aplicar migration no Supabase de **develop/preview**
2. Ativar flags no preview Vercel para homologar UI MOCK
3. Fase 1.5 — criptografia de credenciais + CRUD integração persistente
4. Detalhar API Sicoob sandbox e iniciar **Fase 2**

---

*Documento criado em junho/2026 · Branch: `develop` · Fases 1 e 1.1 implementadas*
