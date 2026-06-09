# Relatório de Validação — ETAPA 3 Prancha PDF Profissional

**Data:** 2026-06-08  
**Escopo:** Layout da prancha técnica PDF (croqui + rodapé)  
**Commit:** Não realizado (aguardando autorização)

---

## Objetivo

Melhorar a prancha PDF do lote usando as correções recentes do GIS (medidas agrupadas, `official_side`, confrontações manuais), sem alterar cálculo GIS, memorial, contrato, financeiro ou banco.

---

## Arquivos alterados / criados

| Arquivo | Alteração |
|---------|-----------|
| `lib/lotSheetLayout.ts` | **Novo** — medidas agrupadas, sketch sides, colisão, rua, confrontantes |
| `lib/lotSheetData.ts` | `buildGroupedOfficialEdgeLabels`, `sketchSides` no payload |
| `lib/lotSheetPdf.ts` | Colisão de labels, rua na prancha, confrontantes, rodapé |
| `scripts/mandatory-lot-sheet-layout-tests.ts` | **Novo** — 8 casos ETAPA 3 |

**Não alterados (conforme regra):** `officialLotMeasurements.ts`, memorial, contrato, migrations.

---

## Melhorias aplicadas

### 1. Medidas oficiais agrupadas (`sides.*.total`)

- `buildGroupedOfficialEdgeLabels` coloca o **total do lado** apenas no segmento representativo (maior comprimento).
- Segmentos secundários do mesmo lado ficam **vazios** no croqui — sem duplicar medida quebrada.
- Lote 010: lado direito **96,54 m** em um único rótulo.

### 2. Confrontações (auditoria GIS)

- `buildLotSheetSketchSides` usa `buildLotConfrontationAudit` + índices oficiais `sides.*`.
- Confrontante manual por segmento tem prioridade (`formatSideConfrontantForSheet`).
- Múltiplos confrontantes unidos com ` / ` (`concatDistinctSideConfrontants`).
- Posicionamento no **segmento representativo** de cada lado (não mais `frente + n/2`).

### 3. Sistema de colisão de labels

- Retângulos reservados: escala gráfica, medidas, rua, número, área, confrontantes.
- `resolvePointAvoidingRects` + offsets progressivos nos confrontantes.
- `resolveLabelCollisions` mantido para número do lote e área.

### 4. Nome de rua

- `planFrontStreetLabel`: clamp dentro do `mainBox`, redução de fonte, desvio da faixa da escala.
- Quebra em duas linhas quando necessário (`splitTextToSize`).

### 5. Confrontantes no croqui

- Offset externo aumentado (11 mm).
- `wrapConfrontantText` — até 2 linhas no croqui, 3 no rodapé.
- Largura máxima 48 mm; fonte reduzida para textos longos.

### 6. Número do lote e área

- Número: profundidade 12% frente→fundo (antes 10%), colisão com medidas/rua.
- Área: linha média entre laterais (~52%), zona de colisão registrada.

### 7. Rodapé CONFRONTAÇÕES

- Textos longos quebrados com `wrapConfrontantText` + `splitTextToSize`.
- Fonte adaptativa (4–4,3 pt).

### 8. Escala gráfica

- Faixa reservada (`graphicScaleBandRect`) registrada **antes** dos demais labels.
- Rua e confrontantes deslocados quando intersectam a faixa.

---

## Testes executados

| Comando | Resultado |
|---------|-----------|
| `npx tsx scripts/mandatory-lot-sheet-layout-tests.ts` | **8/8 OK** |
| `npx tsx scripts/mandatory-lot-label-front-tests.ts` | OK |
| `npx tsx scripts/mandatory-memorial-description-tests.ts` | OK |
| `npx tsx scripts/mandatory-official-measurements-grouped-sides-tests.ts` | **13/13 OK** |
| `npx next build` | OK |

### Casos da prancha (novo script)

| Teste | Validação |
|-------|-----------|
| `testGroupedEdgeLabelsRectangle` | Retângulo — 4 totais, sem duplicata |
| `testGroupedEdgeLabelsLot010` | Dir. 96,54 m em um rótulo |
| `testOfficialSideManualGroupedTotals` | `official_side` + total agrupado |
| `testManualConfrontantOnSketchSide` | Confrontação manual no sketch |
| `testStreetLabelInsideSketchBox` | Rua dentro da prancha |
| `testStreetLabelAvoidsScaleBand` | Rua acima da escala |
| `testWrapLongConfrontant` | Texto longo quebrado |
| `testGenerateLotSheetPdfSynthetic` | PDF gera sem erro |

---

## Riscos remanescentes

| Risco | Mitigação / observação |
|-------|------------------------|
| Lotes muito irregulares (8+ segmentos) com labels densos | Colisão por retângulos; pode ainda exigir ajuste visual caso a caso |
| `getTextWidth` depende da fonte jsPDF no momento da medição | Fonte definida antes de medir em rua/confrontantes |
| Chanfre com medida individual | Segmentos fora de `sides.*` mantêm rótulo por segmento (fallback) |
| Modal legado `CorrectConfrontationsModal` (localStorage) | Prancha usa `segments_json`/auditoria; modal paralelo não afetado nesta etapa |
| Validação visual em impressão A4 real | Recomendado revisar Lote 010 e um retângulo no ambiente de produção |

---

## Como validar visualmente

1. Mapa GIS → Prancha do **Lote 010 / QD 02**.
2. Conferir: Dir. **96,54 m** (uma vez), fundo **31,85 m**, esq. **87,25 m**.
3. Rua da frente dentro do croqui, sem sobrepor escala gráfica.
4. Confrontantes afastados das divisas, sem sobrepor medidas.
5. Rodapé com confrontações longas legíveis (quebra de linha).

---

## Próximo passo sugerido

Commit após revisão visual no PDF real do Lote 010.
