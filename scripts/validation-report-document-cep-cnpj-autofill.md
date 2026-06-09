# Relatório — Validação visual CPF/CNPJ/CEP + autofill CEP e CNPJ

**Data:** 2026-06-08  
**Commit:** Não realizado (conforme solicitado)

---

## Resumo executivo

Melhoria UX nos formulários de cliente e venda: feedback visual de CPF/CNPJ e CEP, preenchimento automático de endereço via ViaCEP e dados empresariais via BrasilAPI (somente CNPJ com 14 dígitos). CPF completo **não** dispara busca automática.

**Não alterado:** banco, migrations, contratos, financeiro, memorial, GIS.

---

## Novos módulos

| Arquivo | Função |
|---------|--------|
| `lib/cepLookup.ts` | `isCompleteCep`, `lookupCep`, `mapViaCepToAddressFields` |
| `lib/cnpjLookup.ts` | `isCompleteCnpj`, `lookupCnpj`, `mapBrasilApiCnpjToCustomerFields` |
| `lib/mergeAutofillFields.ts` | Mescla sem sobrescrever campos preenchidos |
| `lib/inputMasks.ts` | `getCpfCnpjValidationState`, `getCepValidationState` |
| `hooks/useCustomerDocumentAutofill.ts` | Hook compartilhado (máscara + validação + lookup) |
| `components/customers/DocumentFieldFeedback.tsx` | Feedback visual e bordas |

---

## Validação visual CPF/CNPJ

| Dígitos | Mensagem | Borda |
|---------|----------|-------|
| 1–10 | CPF incompleto | Vermelha |
| 11 | CPF completo | Verde (sem busca) |
| 12–13 | CNPJ incompleto | Vermelha |
| 14 | CNPJ completo | Verde + busca BrasilAPI |

Salvamento **não bloqueado** — apenas feedback.

---

## Validação visual CEP

| Dígitos | Mensagem | Borda |
|---------|----------|-------|
| 1–7 | CEP incompleto | Vermelha |
| 8 | CEP completo | Verde + busca ViaCEP |

Exemplo: `68515000` → `68.515-000`

---

## Autofill CEP (ViaCEP)

- Endpoint: `https://viacep.com.br/ws/{cep}/json/`
- Preenche apenas vazios: endereço, bairro, cidade, UF
- Status: Buscando / encontrado / não encontrado / erro de consulta

---

## Autofill CNPJ (BrasilAPI)

- Endpoint: `https://brasilapi.com.br/api/cnpj/v1/{cnpj}`
- Apenas 14 dígitos (CNPJ completo)
- Preenche apenas vazios: nome, endereço, bairro, cidade, UF, CEP, e-mail, telefone
- CPF (11 dígitos) **não** consulta API

---

## Formulários integrados

| Tela | Arquivo |
|------|---------|
| Venda / Reserva / Editar Venda (GIS) | `components/map/CustomerLotFormModal.tsx` |
| Novo Cliente / Editar Cliente | `app/customers/page.tsx` |

CRM: apenas listagem/busca — sem formulário de cadastro (não alterado).

---

## Testes executados

| Script | Resultado |
|--------|-----------|
| `mandatory-input-mask-tests` | ✅ (+ validação visual) |
| `mandatory-cep-lookup-tests` | ✅ |
| `mandatory-cnpj-lookup-tests` | ✅ |
| `mandatory-customer-data-preservation-tests` | ✅ |
| `npx next build` | ✅ |

### Cenários cobertos

- CPF/CNPJ/CEP completo e incompleto
- Mapeamento ViaCEP e BrasilAPI
- Campos preenchidos não sobrescritos
- Falha de API não quebra fluxo
- CPF não dispara lookup CNPJ

---

## Verificação manual recomendada

1. Digitar CPF parcial → borda vermelha + "CPF incompleto"
2. Completar CPF → verde, sem busca automática
3. Digitar CNPJ completo → busca BrasilAPI + preenchimento
4. Digitar CEP `68515000` → endereço preenchido se campos vazios
5. Editar venda no GIS — mesmo comportamento
