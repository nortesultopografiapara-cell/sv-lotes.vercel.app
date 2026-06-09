# Relatório — Máscaras automáticas CPF/CNPJ e CEP

**Data:** 2026-06-08  
**Commit:** Não realizado (conforme solicitado)

---

## Resumo executivo

Implementação de máscaras automáticas nos formulários de cliente e venda: CPF/CNPJ e CEP formatados enquanto o usuário digita, persistência mascarada no banco (compatível com dados legados) e busca funcionando com ou sem máscara.

**Não alterado:** banco, migrations, contratos (lógica), financeiro, memorial, GIS.

---

## Helper criado — `lib/inputMasks.ts`

| Função | Descrição |
|--------|-----------|
| `onlyDigits` | Remove caracteres não numéricos |
| `formatCpfCnpj` | CPF até 11 dígitos; CNPJ até 14; limita 14 |
| `normalizeCpfCnpj` | Apenas dígitos (máx. 14) |
| `matchesCpfCnpj` | Busca com ou sem máscara |
| `formatCep` | Formato `00.000-000`; limita 8 dígitos |
| `normalizeCep` | Apenas dígitos (máx. 8) |
| `matchesCep` | Busca CEP com ou sem máscara |
| `cpfCnpjIlikePatterns` | Padrões ilike para Supabase |
| `cepIlikePatterns` | Padrões ilike para CEP |

### Exemplos validados

| Entrada | Saída |
|---------|-------|
| `12551515500` | `125.515.155-00` |
| `01634822990` | `016.348.229-90` |
| `12345678000199` | `12.345.678/0001-99` |
| `68515000` | `68.515-000` |

---

## Formulários atualizados

| Arquivo | Campos |
|---------|--------|
| `components/map/CustomerLotFormModal.tsx` | `cpf_cnpj`, `zip_code` (venda/reserva/editar venda) |
| `app/customers/page.tsx` | `cpf_cnpj`, `cep` (novo + editar); busca na listagem |
| `lib/customerIdentity.ts` | Formatação ao carregar/salvar; busca Supabase |
| `lib/saleEdit.ts` | Lookup de cliente na edição de venda |
| `app/crm/page.tsx` | Filtro de busca por CPF/CNPJ |

---

## Persistência e compatibilidade

- Novos registros salvos **já mascarados** (`formatCpfCnpj` / `formatCep`)
- Dados antigos sem máscara continuam válidos
- Busca usa `matchesCpfCnpj` / `matchesCep` e padrões `ilike` duplos (bruto + mascarado)
- Deduplicação de cliente na tela Clientes usa comparação normalizada

---

## Testes executados

| Script | Resultado |
|--------|-----------|
| `mandatory-input-mask-tests` | ✅ all passed |
| `mandatory-customer-data-preservation-tests` | ✅ all passed |
| `npx next build` | ✅ sucesso |

### Cenários cobertos

**CPF/CNPJ:** formatação, limite 14, valor já mascarado, busca cruzada  
**CEP:** `68515000` → `68.515-000`, limite 8 dígitos, busca cruzada

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Registros legados sem máscara | `matchesCpfCnpj` + `ilike` com dígitos e formato |
| Busca Supabase parcial | Padrões múltiplos + filtro client-side na listagem |

---

## Verificação manual recomendada

1. **Clientes → Novo Cliente** — digitar CPF e CEP; confirmar máscara ao digitar
2. **GIS → Vender/Editar Venda** — mesmo comportamento no modal
3. **Busca** — localizar cliente por `12551515500` ou `125.515.155-00`
