# Relatório de Validação — GIS frente / "is not iterable"

**Data:** 2026-06-08  
**Escopo:** Mapa GIS — salvar frente, confrontação automática, labels, crash do mapa  
**Commit:** não realizado (conforme solicitado)

---

## Problema reportado

1. Após **Confrontação Automática** ou **Corrigir frente**: `Erro ao salvar frente: o is not iterable`
2. Após refresh: mapa em `Something went wrong`
3. Labels permaneciam no centro/lateral em vez da frente oficial

---

## Causa raiz

**Arquivo:** `utils/calculateLotDimensions.ts` — função `mergeCurvedSegments`

Na fusão do último grupo colinear com o primeiro segmento fundido do anel fechado:

```typescript
// ANTES (bug)
merged[0] = createMergedSegment([...currentGroup, ...firstGroup]);

// firstGroup é um Segment (objeto), não um array
// spread em objeto → TypeError: object is not iterable (minificado: "o is not iterable")
```

Esse caminho é acionado em:

- `resolveSideSegmentIndexes` → confrontação automática / auditoria
- `resolveFrontWgs84RingIndex` / `resolveFrontStreetGuideForLot` → salvar frente
- `getOfficialLotMeasurements` quando normaliza índice UTM↔WGS84

---

## Correções aplicadas

### 1. Causa raiz (crítica)

| Arquivo | Alteração |
|---------|-----------|
| `utils/calculateLotDimensions.ts` | `[...currentGroup, firstGroup]` — sem spread do Segment |

### 2. Normalização de `front_segment_index`

| Arquivo | Alteração |
|---------|-----------|
| `lib/resolveFrontStreetGuide.ts` | `blockWithGeometryFromBounds`, `normalizeFrontSegmentIndexForPersist` |
| `components/map/GISMap.tsx` | `handlePickFrontSegment` persiste índice WGS84 canônico |
| `app/map/page.tsx` | `handleIdentifyFronts` normaliza antes de gravar |

### 3. Hardening anti-crash (lote inválido não derruba mapa)

| Arquivo | Alteração |
|---------|-----------|
| `lib/officialLotMeasurements.ts` | try/catch em `getOfficialLotMeasurements`, guards em spreads, `getOfficialLotSegmentTable` seguro |
| `lib/assistedConfrontation.ts` | `ensureSideIndexArray` em iterações de `sides[role]` |
| `lib/lotSegmentConfrontation.ts` | guards em `pathA/pathB.indexes` |
| `lib/resolveFrontStreetGuide.ts` | try/catch em `resolveFrontStreetGuideForLot` |
| `components/map/GISMap.tsx` | try/catch: popup medidas, txtSegments, confrontationAudits, carga de lotes, `boundsFromBlockGeometry` |

### 4. Labels na frente oficial

- Persistência com índice normalizado UTM↔WGS84
- `segments_json` + geometry explícita no fluxo de salvamento
- Melhorias anteriores em `lotLabelPosition.ts` preservadas

---

## Testes executados

| Comando | Resultado |
|---------|-----------|
| `npx tsx scripts/mandatory-lot-label-front-tests.ts` | **PASS** (incl. novos testes anti-iterable) |
| `npm run test:side-mandatory` | **PASS** |
| `npm run test:confrontation-segment` | **PASS** |
| `npm run test:geometry-diagnostic` | **PASS** |
| `npx tsx scripts/mandatory-assisted-confrontation-tests.ts` | **PASS** |
| `npx next build` | **PASS** (warnings pré-existentes em `/plans`) |

### Novos testes

- `testMergeCurvedSegmentsClosingColinear` — reproduz e valida o fix da causa raiz
- `testSaveFrontFlowNeverThrowsIterable` — fluxo salvar frente completo
- `testOfficialSegmentIndexesWithCorruptSides` — sides inválidos não lançam

---

## Módulos não alterados (conforme regras)

- Contratos
- Financeiro
- Memorial
- Layout visual

---

## Riscos residuais

- Lotes com geometria GeoJSON malformada ainda podem ter medidas via fallback de colunas (`parseColumnFallback`)
- `npx tsc --noEmit` reporta erros pré-existentes fora do escopo GIS (contratos, financeiro, etc.)

---

## Checklist pós-deploy manual

- [ ] Corrigir frente no mapa (clique na aresta) — sem alerta de erro
- [ ] Corrigir frente via popup (segmento TXT) — sem alerta de erro
- [ ] Confrontação automática — modo assistido ativa sem crash
- [ ] Refresh da página — mapa carrega normalmente
- [ ] Labels dos lotes 12/13/19/20/34 na aresta da frente oficial
