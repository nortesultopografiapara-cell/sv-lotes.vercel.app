# Relatório — Padrão visual do croqui da prancha (planta real)

**Data:** 2026-06-08  
**Objetivo:** Alinhar o croqui individual ao padrão visual da planta de loteamento (Civil 3D / Topograph), isolando o lote selecionado com layout limpo e sem colisões.

---

## Resumo executivo

O algoritmo de layout do croqui foi reestruturado para priorizar **legibilidade profissional** em vez de apenas correção geométrica. As mudanças principais estão em `lib/lotSheetLayout.ts` e `lib/lotSheetPdf.ts`, com testes obrigatórios para os lotes **04**, **11** e **18**.

| Critério | Antes | Depois |
|----------|-------|--------|
| Posição da área | Puxada ao centroide (ruim em lotes irregulares) | Maior região livre interna (`findBestInteriorLabelPosition`) |
| Rotação da área | Eixo do lote forçado | Horizontal preferida; rotação só se limpa |
| Número do lote | Círculo grande | Badge 4 mm / fonte 8 pt, na frente oficial |
| Medidas × área | Colisões frequentes (fallback ignorava zonas) | Reserva de área + deslocamento ao longo da aresta + externo quando necessário |
| Fluxo SIGEF | Um passe | Três passes: área → medidas → confirmação |

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `lib/lotSheetLayout.ts` | Pontuação visual da área, `measureEdgeGeometryAt`, slide de medidas, fallback externo com offset até 60 mm, `preferredAreaPos`, badge discreto |
| `lib/lotSheetPdf.ts` | Passo 3 com `preferredAreaPos` do pré-plano |
| `scripts/mandatory-lot-sheet-final-polish-tests.ts` | Testes críticos lotes 11 e 18, `dedupeClosedRingVerts`, `measureEdgeGeometryAt` |

---

## Regras implementadas

### Área
1. Candidato principal: **maior região livre interna** (grid 14×14 maximizando distância às divisas).
2. **Horizontal primeiro** (+28 pts de bônus visual).
3. Redução progressiva de fonte (até −8 pt) se necessário.
4. Clearance mínimo de **12 mm** contra medidas (`AREA_MEASURE_MIN_CLEARANCE_MM`).
5. Sem caixa branca combinada.

### Número do lote
- Raio **4 mm**, fonte **8 pt**, linha **0,35 mm**.
- Posicionado na frente oficial (`LOT_FRONT_BADGE_DEPTH_FRACTION`).
- Secundário em relação à área.

### Medidas
- Offset interno padrão 6 mm (SIGEF).
- Deslocamento ao longo da aresta (frações ordenadas **longe da projeção da área**).
- Colisão com `area_reserve`: gap de 12 mm.
- Se interno impossível: **offset externo** até 60 mm (padrão da planta real em laterais apertadas).
- Normal externa corrigida (`exNx = -inNx` após probe interno).

### Fluxo SIGEF (dois passes + confirmação)
```
1. placeLotNumberAndArea (só vértices) → área pré-plano
2. area_reserve → placeDistanceLabelsInsideLot
3. placeLotNumberAndArea (medidas + preferredAreaPos) → layout final
```

---

## Casos tratados

### Lote 04 — retângulo estreito inclinado
**Problema:** Área rotacionada desnecessariamente; competição com medida de 87,27 m.

**Tratamento:**
- Bônus forte para área **horizontal** em retângulos onde cabe.
- Área no interior livre central.
- Badge discreto próximo à frente (RUA INTERNA), fora do centro.
- Medidas com offset interno uniforme, sem cruzar a área.

**Resultado:** `testPrimaryAreaLayout`, `testAreaHorizontalPreferredWhenPossible`, `testPdfLot04`, `testSigefScaleDoesNotCollideWithLot 04` — OK.

---

### Lote 11 — caso crítico (bota / 2.936,38 m²)
**Problema:** Área embolada com medida **50,72 m**; centroide geométrico caía no “pescoço” do lote.

**Tratamento:**
1. **Área** reposicionada para `[~164, ~72]` mm na folha — ponto de máxima distância às divisas (região larga da bota).
2. **Pré-plano + reserva** antes das medidas.
3. Medidas das laterais críticas (50,72 m e 44,75 m) com **offset externo** (até 60 mm) quando o interno colide com a reserva — como na planta original.
4. Medidas da frente e fundo deslocadas ao longo da aresta, longe da área.
5. Área **horizontal**, fonte principal, sem sobreposição (clearance ≥ 12 mm).

**Teste:** `testCroquiVisualLot11Critical` — OK.

---

### Lote 18 — caso crítico (20.013,61 m²)
**Problema:** Área muito próxima de **277,08 m** e **133,20 m**; leitura suja.

**Tratamento:**
1. Área na região central ampla do lote alongado.
2. Reserva circular da área antes do posicionamento das medidas.
3. Laterais longas: medidas deslocadas ao longo da linha; externo se necessário.
4. `preferredAreaPos` mantém o pré-plano quando limpo após as medidas.
5. Horizontal preferida; rotação só se pontuação visual compensar.

**Teste:** `testCroquiVisualLot18Critical`, `testPdfLot018`, `testPranchaLote018StaggerAndScaleProtection` — OK.

---

## Pontuação visual (`scoreAreaVisualLayout`)

**Penaliza (−∞):**
- Área fora do polígono
- Colisão área × medida / vértice / linha
- Distância à borda < 7 mm

**Prefere (+):**
- Proximidade ao melhor interior (+32 − 1,1×gap)
- Área horizontal (+28)
- Maior distância às divisas (×2,4)
- Clearance confortável contra obstáculos

---

## Validação executada

```bash
npx tsx scripts/mandatory-lot-sheet-final-polish-tests.ts   # OK (incl. lotes 11 e 18)
npx tsx scripts/mandatory-lot-sheet-layout-tests.ts          # OK
npx tsx scripts/mandatory-lot-sheet-sigef-layout-tests.ts    # OK
npx next build                                               # OK (warnings pré-existentes ShieldCore)
```

---

## Riscos e observações

| Risco | Mitigação |
|-------|-----------|
| Medida externa em lateral SIGEF | Só quando interno impossível com reserva de área; padrão da planta real |
| Offset externo grande (60 mm) | Pode sair muito do polígono em escalas pequenas — monitorar lotes muito compactos |
| Lotes não convexos | Não usar centroide; usar `findBestInteriorLabelPosition` |

---

## Próximos passos sugeridos (opcional)

- Pré-visualização no GIS com o mesmo motor de layout antes do PDF.
- Ajuste fino de fonte de medida por comprimento de aresta quando deslocada para externo.
- Caso de teste visual automatizado (snapshot PNG) para lotes 04, 11 e 18.

---

**Status:** Implementado e validado. Sem commit/push nesta entrega.
