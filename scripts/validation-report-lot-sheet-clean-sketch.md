# Relatório de Validação — ETAPA 3.2 Croqui Limpo da Prancha PDF

**Data:** 2026-06-08  
**Escopo:** Layout/desenho do croqui — modo `cleanSketch`  
**Commit:** Não realizado (conforme solicitado)

---

## Problema

Mesmo após ETAPA 3.1, pranchas reais ainda ficavam poluídas:

| Lote | Sintomas |
|------|----------|
| **018** | Área azul cruzando divisa; confrontantes sobrepostos; M-03/M-04 embolados |
| **010** | Confrontantes longos apertados no canto |
| **04** | Rua repetida no croqui |

## Solução — modo `cleanSketch`

Nova regra: o croqui deve ser **limpo**. Confrontações completas vão **somente** ao quadro inferior CONFRONTAÇÕES.

### Dentro do croqui (apenas)

1. Perímetro do lote  
2. Vértices M-01, M-02…  
3. Medidas dos segmentos  
4. Número do lote  
5. Área (fonte menor, sem cruzar divisa)  
6. Nome da rua principal **somente** se couber com segurança (≤ 12 caracteres, sem invadir escala)

### Fora do croqui (rodapé)

- Frente, Fundo, Lado Direito, Lado Esquerdo — textos completos, com fonte maior e melhor espaçamento

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `lib/lotSheetLayout.ts` | `LOT_SHEET_CLEAN_SKETCH`, filtros clean, área em caixa, fonte menor |
| `lib/lotSheetPdf.ts` | Croqui sem confrontantes laterais; rua condicional; rodapé legível |
| `scripts/mandatory-lot-sheet-layout-tests.ts` | +`testCleanSketchModeRules`, casos 04/010/018 atualizados |

**Não alterados:** cálculo de área, medidas oficiais, confrontações (dados), memorial, contrato, financeiro, banco.

---

## Implementações

### 1. `LOT_SHEET_CLEAN_SKETCH = true`

Flag global do modo croqui limpo.

### 2. Confrontantes ocultos no croqui

- `filterSketchSidesForCleanMap()` retorna `[]` — nenhum confrontante lateral no desenho  
- `shouldDrawConfrontantInSketch()` — rejeita > 12 caracteres e padrões de rodapé  
- `isFooterOnlyConfrontant()` — APP, faixa de domínio, propriedade particular

### 3. Rua principal condicional

- `shouldDrawStreetInSketch()` — só desenha se ≤ 12 chars e não invade faixa da escala  
- Lote 018: `RUA MARGINAL FERROVIA` (22 chars) → **oculta** no croqui (`streetPos: null`)

### 4. Área azul menor e segura

- Fonte máxima **14 pt** (antes 18)  
- `resolveAreaLabelPlacement()` — busca interior seguro (≥ 7 mm)  
- Fallback: caixa branca deslocada no centro quando não há espaço interno

### 5. Vértices com maior afastamento

- Proximity stagger: **18 mm** (antes 14)  
- Boost alternado: **×5** (antes ×2.5)  
- Gap mínimo entre labels: **12 mm** (antes 8)

### 6. Quadro CONFRONTAÇÕES mais legível

- Título: **6 pt** (antes 5.2)  
- Rótulos: **5 pt**  
- Valores: **4.8 pt**, até **3 linhas** por confrontante  
- Espaçamento entre linhas: **4.2 mm**, entre linhas de valor: **5 mm**

---

## Testes — lotes reais

| Caso | Validação |
|------|-----------|
| `prancha_lote_04` | `filterSketchSidesForCleanMap` vazio; área ≤ 14 pt; PDF OK |
| `prancha_lote_010` | Sem confrontantes no croqui; área segura ou em caixa; PDF OK |
| `prancha_lote_018` | Stagger M-03/M-04; confrontantes só rodapé; rua longa oculta; PDF OK |

---

## Validação executada

| Comando | Resultado |
|---------|-----------|
| `npx tsx scripts/mandatory-lot-sheet-layout-tests.ts` | **PASS** (15 casos) |
| `npx tsx scripts/mandatory-memorial-description-tests.ts` | **PASS** |
| `npx tsx scripts/mandatory-official-measurements-grouped-sides-tests.ts` | **PASS** |
| `npx next build` | **PASS** |

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Usuário espera rua no croqui em lotes com nome longo | Nome completo permanece no rodapé CONFRONTAÇÕES |
| Croqui “vazio” demais em lotes simples | Rua curta (ex. RUA INTERNA, 11 chars) ainda aparece se couber |

---

## Conclusão

ETAPA 3.2 implementada: croqui profissional limpo, confrontações completas no rodapé, área e vértices com layout mais seguro. Nenhum commit criado.
