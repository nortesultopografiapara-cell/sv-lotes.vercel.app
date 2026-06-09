# Relatório — ETAPA 2.1: Medidas Oficiais por Agrupamento de Segmentos

**Data:** 2026-06-09  
**Escopo:** Somar todos os segmentos TXT de cada lado (frente/fundo/laterais) em `getOfficialLotMeasurements`, sem alterar geometria, área, confrontações, memorial, contrato ou financeiro.

---

## Problema

Lotes irregulares com frente para rua (ex.: Lote 010 / QD 02) exibiam no popup apenas **um** comprimento de fundo (ex.: 19,48 m), quando o fundo real possui **vários** segmentos consecutivos no `segments_json`.

## Causa

Em `classifySidesByFrontAnchor` (frente travada / rua identificada), o fundo usava **apenas** o segmento âncora oposto (`findOppositeBackSegmentIndex`), ignorando demais trechos colineares do mesmo lado.

## Solução

### `lib/officialLotMeasurements.ts`

1. **`collectFundoIndexesFromRingWalk`** — segmentos do anel não percorridos pelos caminhos laterais brutos (frente → fundo).
2. **`expandColinearFundoOnRing`** — expande fundo e laterais com segmentos colineares consecutivos no anel.
3. **`findBackGroupIdxByRingHalf`** — seleção do grupo de fundo por distância no anel (~meia-volta) + desempate por azimute oposto (modo grupos, sem rua).
4. **`buildMeasuresSidesFromPaths`** — monta `sides.{front,back,right,left}` com `total` + `segmentIndexes`.
5. **`OfficialLotMeasures.sides`** — novo campo opcional; campos legados `frente`/`fundo`/`ladoDireito`/`ladoEsquerdo` permanecem preenchidos e iguais aos totais agrupados.

### `components/map/GISMap.tsx`

Popup aba **Resumo** usa `sides?.front.total` (etc.) com fallback aos campos legados.

---

## Saída de `getOfficialLotMeasurements`

```typescript
{
  frente: number | null,      // = sides.front.total
  fundo: number | null,       // = sides.back.total
  ladoDireito: number | null, // = sides.right.total
  ladoEsquerdo: number | null,
  sides?: {
    front: { total, segmentIndexes },
    back: { total, segmentIndexes },
    right: { total, segmentIndexes },
    left: { total, segmentIndexes },
  },
  // area, perimeter, chanfre, curva — inalterados
}
```

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `lib/officialLotMeasurements.ts` | Agrupamento por lado, expansão colinear, `sides` |
| `components/map/GISMap.tsx` | Popup usa totais agrupados |
| `scripts/mandatory-official-measurements-grouped-sides-tests.ts` | **Novo** — 6 cenários ETAPA 2.1 |

**Migration:** Não necessária.

---

## Testes executados

| Comando | Resultado |
|---------|-----------|
| `npx next build` | ✅ OK (warning pré-existente `ShieldCore`) |
| `npx tsx scripts/mandatory-official-measurements-grouped-sides-tests.ts` | ✅ 6/6 |
| `npx tsx scripts/mandatory-lot-label-front-tests.ts` | ✅ OK |
| `npx tsx scripts/mandatory-assisted-confrontation-tests.ts` | ✅ OK |
| `npx tsx scripts/mandatory-memorial-description-tests.ts` | ✅ OK |
| `npx tsx scripts/mandatory-side-classification-tests.ts` | ✅ 7/7 |

### Cenários ETAPA 2.1

1. Retângulo simples — 1 segmento/lado, comportamento preservado  
2. Fundo quebrado — 2+ segmentos somados  
3. Lateral quebrada — 2+ segmentos somados  
4. Lote 6 segmentos — `sides.*` consistente com totais  
5. Chanfre excluído dos lados principais  
6. Compatibilidade campos legados + `sides`

---

## Integração memorial / prancha / contrato

- **Memorial** e **prancha** já usam `getOfficialLotMeasurements` / `getOfficialLotSegmentTable` — passam a receber totais corretos automaticamente.
- **Contrato** (`contractLotBoundaries`) usa `getOfficialLotMeasurements` — compatível.
- Layout de memorial/prancha/contrato **não alterado**.

---

## Riscos remanescentes

1. **Fundo com cantos não colineares** (ex.: 3+ segmentos com deflexão entre eles): expansão colinear agrega trechos adjacentes com mesmo azimute; segmentos separados por canto podem exigir evolução futura (agrupamento por grupo de deflexão no modo frente-âncora).
2. **Lotes em L muito assimétricos** sem rua: grupo de fundo por meia-volta pode divergir do âncora único — cenários sem `front_street_name` devem ser validados em campo.
3. **Performance** — logs `LOT_SEGMENTS` / `BACK_GROUP_SELECTED` permanecem verbosos (pré-existente).

---

## Commit

**Não realizado** conforme solicitado.
