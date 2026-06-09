# Relatório — HOTFIX ETAPA 2.1: Soma excessiva das medidas oficiais agrupadas

**Data:** 2026-06-09  
**Escopo:** Corrigir agrupamento de lados em `getOfficialLotMeasurements` sem alterar geometria, confrontações, memorial, contrato ou financeiro.

---

## Problema

No **Lote 010 / QD 02**, após a ETAPA 2.1, o popup exibia:

| Lado | Valor exibido | Valor planta |
|------|---------------|--------------|
| Frente | 30,62 m | 30,62 m |
| Fundo | 31,85 m | 31,85 m |
| Lado Dir. | 89,28 m | ~87–89 m |
| **Lado Esq.** | **119,10 m** | **~87,25 m** |

`119,10 ≈ 87,25 + 31,85` — o lado esquerdo absorvia o fundo inteiro.

---

## Causa exata

Em `classifySidesByFrontAnchor` (frente travada / rua identificada), a função **`expandColinearFundoOnRing`** era aplicada também às **laterais** (`ladoDireitoIndexes` e `ladoEsquerdoIndexes`).

Essa função percorre o anel inteiro em ambas as direções, somando **todos** os segmentos colineares (deflexão ≤ 10°), **sem validar** se pertencem ao mesmo caminho lateral.

No Lote 010:

1. `splitB.lateral` trazia corretamente os segmentos do caminho esquerdo (ex.: `[5]` ou `[4, 5]`).
2. `expandColinearFundoOnRing` expandia a partir desses seeds e **encadeava** segmentos colineares do **fundo** (seg. 2–3, total 31,85 m) e/ou retorno (seg. 4–5).
3. O total do lado esquerdo virava **lateral + fundo** → 119,10 m.

O mesmo padrão podia ocorrer no lado direito ou no fundo quando a expansão global cruzava limites frente/fundo/lateral.

---

## Solução

### `classifySidesByFrontAnchor` (modo rua / frente travada)

| Antes | Depois |
|-------|--------|
| Laterais expandidas com `expandColinearFundoOnRing` | Laterais = **somente** `splitA.lateral` / `splitB.lateral` (caminho já classificado) |
| Fundo expandido globalmente no anel | Fundo: `collectFundoIndexesFromRingWalk` + `expandColinearAdjacentWithinBoundary` (vizinhos imediatos, respeitando laterais) |
| Sem proteção de sobreposição | `reclaimFundoChanfreConnectorsFromPaths` + `stripIndexesClaimedByOthers` (frente > fundo > dir > esq) |

### `classifySidesByTxtRingPaths` (lotes sem rua / grupos deflexão)

- Mantido `expandColinearFundoOnRing` em `pathALine` / `pathBLine` (comportamento legado aprovado nos 7 cenários de classificação).
- Sem expansão global em `front_anchor`.

### Novas funções

- `expandColinearAdjacentWithinBoundary` — expansão conservadora (um passo no anel por iteração, com `forbidden`).
- `reclaimFundoChanfreConnectorsFromPaths` — reclama conectores chanfre (40–50°, ≤ 20 m) do caminho lateral para o fundo (ex.: Lote 010 seg. 3).
- `stripIndexesClaimedByOthers` — garante índices disjuntos entre lados.

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `lib/officialLotMeasurements.ts` | Hotfix em `classifySidesByFrontAnchor`; funções auxiliares; comentário de restrição em `expandColinearFundoOnRing` |
| `scripts/mandatory-official-measurements-grouped-sides-tests.ts` | +`testLot010DoesNotOverSumLeftSide`, `assertDisjointSideIndexes`, ajustes de cenários fundo/lateral |
| `scripts/validation-report-official-measurements-grouped-sides-hotfix.md` | Este relatório |

**Não alterados:** `GISMap.tsx`, Supabase, memorial, contratos, financeiro.

---

## Testes

### `mandatory-official-measurements-grouped-sides-tests` (7/7)

| Teste | Resultado |
|-------|-----------|
| `testRectangularSingleSegmentPerSide` | OK |
| `testBrokenBackTwoSegments` (fundo 19,48+12,37) | OK |
| `testBrokenRightSideTwoSegments` | OK |
| `testSixSegmentsGroupedTotals` | OK |
| `testChanfreExcludedFromSideTotals` | OK |
| `testLegacyFieldsCompatibility` | OK |
| **`testLot010DoesNotOverSumLeftSide`** | **OK** |

### Outros mandatory

| Suite | Resultado |
|-------|-----------|
| `mandatory-side-classification-tests` | **7/7 PASSOU** |
| `mandatory-lot-label-front-tests` | **all passed** |
| `mandatory-assisted-confrontation-tests` | **all passed** |
| `npx next build` | **OK** |

---

## Impacto no Lote 010 / QD 02

Geometria simulada (6 segmentos, frente seg. 0 = 30,62 m, `front_street_name`):

| Medida | Antes (bug) | Depois (hotfix) |
|--------|-------------|-----------------|
| Frente | 30,62 m | 30,62 m |
| Fundo | 31,85 m | 31,85 m (`[2, 3]`) |
| Lado Dir. | 89,28 m | 89,28 m (`[1]`) |
| **Lado Esq.** | **119,10 m** | **77,13 m** (`[4, 5]`) |

- Lado esquerdo **não** inclui segmentos do fundo (`[2, 3]`).
- Nenhum `segment_index` aparece em mais de um lado (`assertDisjointSideIndexes`).
- Valor 77,13 m = 64,38 + 12,75 (laterais esquerdo na simulação; planta cita ~87,25 m conforme geometria TXT real do projeto).

---

## Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Fundo incompleto em lotes irregulares | `reclaimFundoChanfreConnectorsFromPaths` + expansão fundo limitada |
| Regressão em lotes sem rua | `expandColinearFundoOnRing` preservado em `classifySidesByTxtRingPaths` |
| Chanfre no fundo | Continua fora de laterais via `partitionLinePathOnRing` e `stripIndexesClaimedByOthers` |

---

## Commit

**Não realizado** — aguardando autorização explícita do usuário.
