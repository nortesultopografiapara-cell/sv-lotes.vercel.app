# Relatório — ETAPA 4.2 Correção cirúrgica final da prancha SIGEF

**Data:** 2026-06-08  
**Commit:** Não realizado (conforme solicitado)  
**Escopo:** Somente layout visual da prancha PDF — lotes 04, 010 e 018

---

## Resumo executivo

Correção cirúrgica dos problemas visuais restantes na prancha SIGEF: escala gráfica deslocada para o canto inferior esquerdo (com fallback), área do lote obrigatoriamente dentro do polígono, medidas com afastamento mínimo de 5 mm, tabela de coordenadas com colunas De | Para (sem seta Unicode corrompida) e bloco número/área horizontal com caixa combinada quando necessário.

**Não alterado:** GIS, medidas oficiais, confrontações (dados), memorial, contratos, financeiro, banco, cálculo de área/perímetro.

---

## Problemas corrigidos

| # | Problema | Correção |
|---|----------|----------|
| 1 | Escala centralizada invadindo croqui | `resolveSigefGraphicScaleBox()` — canto inferior esquerdo fixo; fallback acima das confrontações |
| 2 | Área azul fora do perímetro ou colada em medida | `placeLotNumberAndArea()` — busca multi-candidata + caixa branca combinada; área sempre horizontal |
| 3 | Medidas sobre a divisa | `resolveMeasureLabelPosition()` — clearance 5 mm; segmentos curtos priorizam lado externo |
| 4 | Tabela com `M-01 !' M-02` | `drawMetricTable()` — colunas **De \| Para** separadas (sem `→`) |
| 5 | Número e área sem bloco limpo | Desenho SIGEF com círculo + área 10–15 mm abaixo ou caixa combinada |

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `lib/lotSheetSigefLayout.ts` | Caixa fixa da escala; `resolveSigefGraphicScaleBox()`; `sigefLotBBoxOverlapsScaleBox()`; helpers tabela De/Para; escala alinhada à esquerda |
| `lib/lotSheetLayout.ts` | Offsets 5 mm; `placeLotNumberAndArea()` com anti-colisão área×medida reforçado |
| `lib/lotSheetPdf.ts` | Escala resolvida antes do posicionamento de rótulos; área horizontal; tabela 6 colunas; `edgeLenMm` nas medidas |
| `scripts/mandatory-lot-sheet-final-polish-tests.ts` | Validações ETAPA 4.2 |

---

## Detalhamento técnico

### 1. Escala gráfica

- Posição preferencial: `x = croqui.x + 8 mm`, `y = croqui.base - 18 mm`, `75 × 8 mm`
- Se bbox do lote colidir → acima do quadro de confrontações, alinhada à esquerda
- `scaleBandRect` resolvido **antes** de medidas/número/área (anti-colisão no layout)
- Barra mínima: 70 mm; altura: 6 mm; alinhamento à esquerda (não centralizado)

### 2. Área do lote

- Número no centro visual (círculo branco)
- Área horizontal, 10–15 mm abaixo (`LOT_NUMBER_AREA_MIN_GAP_MM` = 12)
- Fallback: candidatos laterais, acima do número, `findBestInteriorLabelPosition()`
- `useCombinedBox`: retângulo branco discreto quando necessário
- Validação: `areaInsidePolygon` + distância mínima de zonas de medida

### 3. Medidas

- `MEASURE_LABEL_MIN_EDGE_CLEARANCE_MM` = 5
- `DISTANCE_MIN_CLEARANCE_FROM_EDGE_MM` = 5 (SIGEF em `lotSheetPdf.ts`)
- Segmentos &lt; 22 mm: offsets externos maiores (8–18 mm)
- Texto paralelo à linha, deslocado para fora quando interno colide

### 4. Tabela de coordenadas

- Cabeçalho: `De | Para | Azimute | Distância | E(X) | N(Y)`
- Células separadas — elimina renderização `→` → `!'` no Helvetica/jsPDF
- `sigefMetricTableTextValid()` rejeita `→`, `!'`, `!` em colunas De/Para

---

## Testes executados

| Script | Resultado |
|--------|-----------|
| `mandatory-lot-sheet-final-polish-tests` | ✅ all passed |
| `mandatory-lot-sheet-sigef-layout-tests` | ✅ all passed |
| `mandatory-lot-sheet-layout-tests` | ✅ all passed |
| `mandatory-memorial-description-tests` | ✅ all passed |
| `mandatory-official-measurements-grouped-sides-tests` | ✅ all passed |
| `npx next build` | ✅ sucesso (warnings pré-existentes em `app/plans/page.tsx`) |

### Validações adicionadas (ETAPA 4.2)

- Escala não colide com bbox do lote (04, 010, 018)
- Área dentro do polígono
- Área não colide com medidas (retângulo sintético + lotes reais)
- Tabela sem `!'` / `→` em De/Para
- Medidas com offset mínimo 5 mm
- PDFs lotes 04, 010 e 018 geram sem erro

---

## Riscos e mitigação

| Risco | Nível | Mitigação |
|-------|-------|-----------|
| Lotes muito pequenos no croqui | Médio | Fallback escala acima das confrontações |
| Polígono estreito sem espaço interno | Médio | Caixa combinada + busca de posição interior |
| Azimute DMS com `'` na tabela | Baixo | Validação restringe `!` apenas às colunas De/Para |

---

## Verificação visual recomendada

1. **Lote 04** — escala no canto inferior esquerdo; área dentro do polígono
2. **Lote 010** — medidas afastadas das divisas; tabela com M-01 e M-02 em colunas separadas
3. **Lote 018** — número centralizado; área legível sem sobrepor perímetro

---

## Próximos passos (opcional)

- Commit após revisão visual das três pranchas
- Push somente após aprovação do layout em PDF real
