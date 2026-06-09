# Relatório — HOTFIX ETAPA 2.1.2: Medidas oficiais Lote 010 / QD 02

**Data:** 2026-06-09  
**Escopo:** Classificação correta de frente/fundo/laterais para lotes irregulares (6+ segmentos) + suporte `official_side` manual em `segments_json`.

---

## Problema (produção)

Popup do **Lote 010 / QD 02**:

| Medida | Exibido | Planta Civil |
|--------|---------|--------------|
| Frente | 30,62 m | 30,62 m |
| Fundo | **19,48 m** | **31,85 m** |
| Lado Dir. | 89,28 m | 96,54 m (60,74+7,26+28,54) |
| Lado Esq. | **99,62 m** | **87,25 m** |

Diagnóstico numérico: `99,62 = 87,25 + 12,37` — o conector do fundo (12,37 m) permanecia na lateral esquerda; o fundo ficava só com 19,48 m.

---

## Causa

1. **Heurística `front_anchor`** classificava o trecho **12,37 m** como parte do caminho lateral (87,25 m), não do fundo.
2. **`reclaimFundoChanfreConnectorsFromPaths`** só recuperava conectores com deflexão 40–50°; no TXT real o vértice pode não atingir esse critério de forma confiável.
3. **Geometria de teste anterior** (89,28 m / 77,13 m) não correspondia à planta Civil (87,25 / 96,54).
4. Lotes irregulares **6+ segmentos** exigem classificação explícita quando a heurística não é segura.

---

## Solução

### A) `getOfficialLotMeasurements` / `classifySidesByFrontAnchor`

- **`reclaimShortFundoBreakSegmentsFromPaths`** — reclama trecho curto (≤ 20 m) no caminho de uma lateral principal longa (≥ 80 m) colado ao fundo (caso 12,37 m do Lote 010).
- Mantidos: sem expansão colinear nas laterais, `stripIndexesClaimedByOthers`, fundo com expansão limitada.

### B) Classificação manual `official_side` em `segments_json`

Campo por segmento:

```json
"official_side": "front" | "back" | "right" | "left" | "chanfre"
```

Aliases aceitos: `frente`, `fundo`, `direito`, `esquerdo`, `dir`, `esq`.

Funções novas:

| Função | Papel |
|--------|-------|
| `normalizeOfficialSideKind` | Normaliza valor do JSON |
| `readManualOfficialSideMap` | Lê mapa `segment_index → lado` |
| `hasManualOfficialSideClassification` | Detecta presença de manual |
| `applyManualOfficialSideOverrides` | Sobrescreve heurística automática (segmentos disjuntos) |

Prioridade: **manual > automático** por segmento.

### C) UI “Definir lado oficial da medida”

Não implementada nesta etapa (apenas suporte em código + testes), conforme solicitado.

---

## Medidas esperadas — Lote 010 / QD 02

| Lado | Valor | Segmentos |
|------|-------|-----------|
| Frente | 30,62 m | 1 |
| Fundo | 31,85 m | 1 (ou 19,48+12,37) |
| Lado esquerdo | 87,25 m | 1 (confronta Lote 09) |
| Lado direito | 96,54 m | 60,74 + 7,26 + 28,54 |

Área de referência: 2.727,13 m².

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `lib/officialLotMeasurements.ts` | `official_side`, reclaim fundo quebrado, override manual |
| `scripts/mandatory-official-measurements-grouped-sides-tests.ts` | `testLot010OfficialSidesFromSixSegments`, `testLot010AutoFundoBreakFromSevenSegments` |
| `scripts/validation-report-lot010-official-side-measurements.md` | Este relatório |

**Sem migration nova.**

---

## Testes

| Suite | Resultado |
|-------|-----------|
| `mandatory-official-measurements-grouped-sides-tests` | **9/9 OK** (incl. `testLot010OfficialSidesFromSixSegments`, `testLot010AutoFundoBreakFromSevenSegments`) |
| `mandatory-side-classification-tests` | **7/7 OK** |
| `mandatory-lot-label-front-tests` | **all passed** |
| `mandatory-assisted-confrontation-tests` | **all passed** |
| `npx next build` | **OK** |

### Casos Lote 010

| Teste | Modo | Fundo | Esq. | Dir. |
|-------|------|-------|------|------|
| `testLot010OfficialSidesFromSixSegments` | `official_side` manual | 31,85 | 87,25 | 96,54 |
| `testLot010AutoFundoBreakFromSevenSegments` | automático 7 seg. | 31,85 | 87,25 | 89,28* |

\*Automático corrige fundo e esquerdo; lado direito completo (96,54) requer `official_side` manual no conector 7,26 m até UI de edição.

---

## Uso em produção (Lote 010)

Exemplo `segments_json` com classificação manual:

```json
[
  { "segment_index": 0, "distance": 30.62, "official_side": "front", ... },
  { "segment_index": 1, "distance": 87.25, "official_side": "left", ... },
  { "segment_index": 2, "distance": 31.85, "official_side": "back", ... },
  { "segment_index": 3, "distance": 60.74, "official_side": "right", ... },
  { "segment_index": 4, "distance": 7.26, "official_side": "right", ... },
  { "segment_index": 5, "distance": 28.54, "official_side": "right", ... }
]
```

---

## Commit

**Não realizado** — aguardando autorização.
