# Relatório de Validação — ETAPA 3.1 Ajuste Fino Visual da Prancha PDF

**Data:** 2026-06-08  
**Escopo:** Layout/desenho do croqui na prancha técnica PDF  
**Commit:** Não realizado (conforme solicitado)

---

## Objetivo

Corrigir problemas visuais observados em pranchas reais (Lotes 04, 010 e 018), sem alterar cálculo de área, medidas oficiais, confrontações, memorial, contrato, financeiro ou banco.

---

## Problemas tratados

| # | Problema observado | Solução ETAPA 3.1 |
|---|-------------------|-------------------|
| 1 | Área azul grande e sobreposta à divisa | `resolveAreaFontSize` + `findBestInteriorLabelPosition` |
| 2 | Nome de rua/confrontante cortado ou fora da prancha | `clampPointToBox`, offsets maiores, até 3 linhas |
| 3 | Confrontantes muito próximos da linha | Offset 11 → **15 mm**, offsets progressivos até +16 mm |
| 4 | Textos repetidos/embolados em lotes irregulares | `filterSketchSidesForMapLabels` + `normalizeConfrontantKey` |
| 5 | Vértices próximos sobrepostos (M-03/M-04) | `vertexLabelStaggerIndex` em `placeVertexLabelOutsideCorner` |
| 6 | Escala gráfica invadida por texto | `graphicScaleBandRect` (14 mm) + `resolveLabelClearOfScaleBand` |
| 7 | Confrontantes longos precisam ir para fora com offset seguro | `wrapConfrontantText` (até 3 linhas), `labelAtEdgeExternalResolved` |

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `lib/lotSheetLayout.ts` | Prioridade visual, dedupe de confrontantes no croqui, stagger de vértices, fonte/posição da área, proteção da escala |
| `lib/lotSheetPdf.ts` | Ordem de desenho por prioridade, offsets maiores, área adaptativa, confrontantes filtrados |
| `scripts/mandatory-lot-sheet-layout-tests.ts` | +3 casos reais (04, 010, 018) e geração PDF dos três lotes |

**Não alterados (conforme regra):** cálculo de área, `officialLotMeasurements`, memorial, contrato, financeiro, migrations.

---

## Implementações ETAPA 3.1

### 1. Prioridade visual (`LOT_SHEET_VISUAL_PRIORITY`)

Ordem de desenho no croqui:

1. Perímetro (polígono)
2. Vértices (M-01…)
3. Medidas oficiais agrupadas
4. Número do lote (badge vermelho)
5. Área azul
6. Confrontantes / ruas

### 2. Área azul adaptativa

- `resolveAreaFontSize`: reduz fonte em lotes estreitos (`crossWidthMm < 38/28`), irregulares (`vertexCount > 4/6`) e áreas com muitos dígitos.
- `findBestInteriorLabelPosition`: busca em grade o ponto interior com maior distância às divisas (mín. **7 mm**).
- `placeAreaLabelCenter`: usa centro visual livre quando a linha média colide com divisa ou medida.
- Fonte base reduzida: 16 pt (normal) / 13 pt (estreito), piso 8 pt.

### 3. Confrontantes e ruas

- Offset lateral/fundo: **15 mm** (antes 11 mm).
- `wrapConfrontantText`: até **3 linhas** no croqui.
- `filterSketchSidesForMapLabels`: remove confrontante igual à frente e duplicatas entre laterais no mapa (rodapé mantém todos).
- `planFrontStreetLabel` + `resolveLabelClearOfScaleBand`: desloca texto acima da faixa da escala.

### 4. Vértices com stagger

- `vertexLabelStaggerIndex`: conta vértices anteriores dentro de 14 mm e alterna offset radial (±15, ±40, ±65, ±90 mm).

### 5. Faixa protegida da escala gráfica

- `graphicScaleBandRect`: altura **14 mm** registrada como primeiro `placedRects`.
- Nenhum label de rua/confrontante pode ocupar essa faixa após `resolveLabelClearOfScaleBand`.

---

## Casos de teste — pranchas reais

| Caso | Validações |
|------|------------|
| `prancha_lote_04` | Dedupe de RUA INTERNA nas laterais; fonte de área moderada; PDF gerado |
| `prancha_lote_010` | Fonte de área reduzida (7 vértices); posição interior ≥ 5 mm da divisa; PDF gerado |
| `prancha_lote_018` | Stagger de vértices; fonte de área ≤ 13 pt; label acima da escala; PDF gerado |

---

## Testes executados

| Comando | Resultado |
|---------|-----------|
| `npx tsx scripts/mandatory-lot-sheet-layout-tests.ts` | **PASS** (14 casos, incl. 04/010/018) |
| `npx tsx scripts/mandatory-memorial-description-tests.ts` | **PASS** |
| `npx tsx scripts/mandatory-official-measurements-grouped-sides-tests.ts` | **PASS** |
| `npx next build` | **PASS** (warning pré-existente `ShieldCore` em `/plans`) |

---

## Riscos e limitações

| Risco | Mitigação |
|-------|-----------|
| Lotes muito concavos com pouco espaço interior | Grade 14×14 + fallback no centroide; fonte mínima 8 pt |
| Confrontante único em vários lados (ex. RUA INTERNA) | Dedupe só no croqui; rodapé CONFRONTAÇÕES intacto |
| Polígonos com > 7 vértices muito próximos | Stagger alternado; pode precisar ajuste manual em casos extremos |

---

## Próximos passos sugeridos

1. Revisão visual das três pranchas exportadas no ambiente real (comparar com imagens de referência).
2. Commit após aprovação do usuário.
3. Se necessário, calibrar `MIN_AREA_EDGE_CLEARANCE_MM` ou `proximityMm` do stagger com mais lotes de produção.

---

## Conclusão

ETAPA 3.1 concluída: ajustes exclusivamente de layout/desenho da prancha PDF, com testes obrigatórios e build validados. Nenhum commit foi criado.
