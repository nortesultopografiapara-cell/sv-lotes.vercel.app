# Fase 2.1-Sicredi — Homologação real Sicredi

Checklist técnico e estrutura segura para homologação do conector **Sicredi** no SV LOTES 2.0.

> **Pré-requisito concluído:** [Fase 2.0-Sicredi — Provider Sicredi estrutural](#fase-20-sicredi--provider-sicredi-estrutural) (develop).

| Item | Valor |
|------|-------|
| **Branch** | `develop` apenas |
| **Produção (`main`)** | Não alterar nesta fase |
| **Emissão real** | Proibida nesta fase |
| **Referência** | [SVLOTES_2_BANKING_MODULE.md](./SVLOTES_2_BANKING_MODULE.md) |
| **Provider alvo** | `SICREDI` (COMPE 748) |
| **Ambiente desta fase** | Sandbox / homologação exclusivamente |

---

## Fase 2.0-Sicredi — Provider Sicredi estrutural

**Status:** implementado em `develop` · **Sem API real**

| Entrega | Caminho |
|---------|---------|
| Provider Sicredi | `lib/banking/providers/sicrediBankProvider.ts` |
| Validação de config | `lib/banking/sicrediConfigValidation.ts` |
| Handler test connection | `lib/banking/sicrediApiHandlers.ts` |
| Rota test connection | `app/api/banking/sicredi/test-connection/route.ts` |
| Registry | `lib/banking/registry.ts` → `SICREDI` + `SICOOB` + `MOCK` |

Comportamento Fase 2.0-Sicredi:

- `testConnection()` — valida campos obrigatórios localmente
- `createBoleto()` — erro: *"Sicredi boleto real ainda não habilitado nesta fase."*
- `createPix()` — erro: *"Sicredi Pix real ainda não habilitado nesta fase."*
- Demais métodos — erro controlado de não implementado
- UI — aviso Sicredi; botões MOCK ocultos quando banco ≠ MOCK

---

## Escopo da Fase 2.1-Sicredi

Esta fase **planeja e valida** a integração Sicredi em ambiente de homologação. Não inclui:

- Deploy ou merge em `main`
- Emissão de cobrança em produção
- Conexão com banco real fora do sandbox acordado com o cliente

Inclui:

- Checklist de dados e permissões a solicitar ao cliente/cooperativa
- Fluxo técnico de homologação passo a passo
- Regras de segurança obrigatórias
- Critérios para avançar à produção controlada

---

## 1. Dados a solicitar ao cliente / cooperativa Sicredi

| Campo | Obrigatório | Campo SV LOTES |
|-------|-------------|----------------|
| Client ID | Sim | `clientId` |
| Client Secret | Sim | `bank_credentials` (criptografado) |
| Certificado A1 | Se exigido | `certificateName` + storage privado |
| Senha do certificado | Se certificado | criptografado |
| Agência | Sim | `agency` |
| Conta | Sim | `account` |
| Dígito | Sim | `accountDigit` |
| Convênio | Sim (boleto) | `agreementCode` |
| Carteira | Sim (boleto) | `walletCode` |
| Código do beneficiário | Sim (boleto) | `beneficiaryCode` |
| Chave Pix | Sim (Pix) | `pixKey` |
| Ambiente sandbox | Sim | `environment` = `SANDBOX` |
| URLs sandbox/produção | Documentar | `apiBaseUrl` |
| Webhook URL (Preview) | Sim | `webhookUrl` |

### Permissões no portal Sicredi

- [ ] OAuth / autenticação API
- [ ] Cobrança bancária (boleto registrado)
- [ ] Pix cobrança dinâmica
- [ ] Consulta de cobrança
- [ ] Webhook / retorno de pagamento

---

## 2. Fluxo de homologação (sandbox)

| # | Etapa | Resultado esperado |
|---|-------|-------------------|
| 1 | Autenticação OAuth sandbox | Token válido |
| 2 | Teste de conexão (UI) | Config validada |
| 3 | Emitir boleto sandbox | Registro em `bank_charges` |
| 4 | Emitir Pix sandbox | QR + copia e cola |
| 5 | Consultar cobrança | Status coerente |
| 6 | Webhook sandbox | Evento idempotente |
| 7 | Reconciliar pagamento | Parcela + caixa atualizados |

### Pré-requisitos técnicos (código)

- [x] `SicrediBankProvider` estrutural (Fase 2.0-Sicredi)
- [x] Registry `SICREDI` sem quebrar MOCK/SICOOB
- [ ] OAuth real sandbox
- [ ] Emissão boleto/Pix sandbox
- [ ] Webhook `/api/banking/webhooks/sicredi`

---

## 3. Regras de segurança

| Regra | Detalhe |
|-------|---------|
| Não logar secrets | Client Secret, senha certificado, webhook secret |
| Não expor certificado | Storage privado + criptografia |
| Não emitir cobrança real | Sandbox fixo nesta fase |
| Não alterar `main` | Apenas `develop` + Preview |
| Feature flags | `BANKING_MODULE_ENABLED` ON só Preview/develop |

---

## 4. Critérios para produção controlada

- [ ] Sandbox 100% OK
- [ ] Logs auditáveis sem secrets
- [ ] Baixa automática validada
- [ ] Zero recebimento duplicado (testes webhook)
- [ ] `npm run test:banking-mock` verde
- [ ] `npx next build` verde
- [ ] Nenhuma alteração em `main` até PR aprovado

---

## Referências no código (develop)

| Área | Caminho |
|------|---------|
| Provider Sicredi | `lib/banking/providers/sicrediBankProvider.ts` |
| Validação | `lib/banking/sicrediConfigValidation.ts` |
| Handler | `lib/banking/sicrediApiHandlers.ts` |
| Provider Sicoob (referência) | `lib/banking/providers/sicoobBankProvider.ts` |
| Provider MOCK | `lib/banking/providers/mockBankProvider.ts` |
| Registry | `lib/banking/registry.ts` |
| UI | `components/banking/BankingIntegrationPanel.tsx` |

---

## Histórico

| Versão | Data | Descrição |
|--------|------|-----------|
| 1.0 | 2026-06-08 | Checklist Fase 2.0-Sicredi estrutural + plano homologação |
