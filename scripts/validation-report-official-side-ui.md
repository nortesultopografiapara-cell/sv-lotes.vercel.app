# Relatório de Validação — ETAPA 2.1.3 UI Lado Oficial da Medida

**Data:** 2026-06-08  
**Escopo:** Interface GIS para definir `official_side` por segmento em `segments_json`  
**Commit:** Não realizado (aguardando autorização)

---

## Objetivo

Permitir ao usuário marcar manualmente o lado oficial de cada segmento (Frente, Fundo, Lado Direito, Lado Esquerdo, Chanfre ou Automático), persistindo em `segments_json.official_side` sem alterar área, confrontações ou contrato/financeiro.

---

## Arquivos alterados / criados

| Arquivo | Alteração |
|---------|-----------|
| `lib/officialLotMeasurements.ts` | `officialSideDisplayLabel`, `stripManualOfficialSidesFromBlock`, `getAutomaticOfficialSideForSegment` |
| `lib/officialSidePersist.ts` | **Novo** — apply/clear/persist `official_side` |
| `lib/lotAudit.ts` | Action `official_measure_side_changed` |
| `components/map/DefineOfficialSideModal.tsx` | **Novo** — modal Salvar/Limpar/Cancelar |
| `components/map/GISMap.tsx` | Ferramenta, popup, tooltip, audit, arestas roxas |
| `app/map/page.tsx` | Botão toolbar "Definir Medida Oficial" |
| `scripts/mandatory-official-measurements-grouped-sides-tests.ts` | +5 casos ETAPA 2.1.3 |
| `scripts/mandatory-lot-audit-tests.ts` | Action `official_measure_side_changed` |

---

## Fluxo criado

### 1. Toolbar (Mapa GIS)

1. Ativar **Definir Medida Oficial** (ícone régua, roxo).
2. Arestas do lote ficam roxas e clicáveis.
3. Clique no segmento → abre modal.

### 2. Popup — aba Resumo

1. Botão **Editar medidas** ao lado do bloco Medidas.
2. Lista segmentos TXT para seleção rápida.
3. Clique no segmento → abre modal.

### 3. Popup — aba Confrontações

1. Botão **Medida** em cada linha de segmento.
2. Abre o mesmo modal para aquele `segment_index`.

### 4. Modal "Definir Medida Oficial"

- Lote / QD
- Segmento (nº)
- Comprimento (m)
- Lado automático (heurística)
- Lado oficial salvo (se houver)
- Select: Automático, Frente, Fundo, Lado Direito, Lado Esquerdo, Chanfre
- **Salvar** — grava `official_side` em `segments_json`
- **Limpar** — remove `official_side` (volta ao automático)
- **Cancelar**

### 5. Persistência e auditoria

- Grava apenas `segments_json` via `persistBlockSegmentsJson`
- Não altera `area`, confrontantes nem campos comerciais
- Histórico: `action: official_measure_side_changed`, título **"Lado oficial da medida alterado"**

### 6. Tooltip visual

Quando `official_side` existe, aresta exibe: **"Lado oficial: Fundo"** (etc.).

---

## Como corrigir o Lote 010 / QD 02 pela UI

1. Abrir o mapa GIS do projeto e localizar **Lote 010 / QD 02**.
2. Ativar **Definir Medida Oficial** na toolbar **ou** abrir o popup → **Editar medidas**.
3. Selecionar o segmento de **7,26 m** (conector entre lateral e fundo).
4. No modal, escolher **Lado Direito** → **Salvar**.
5. Verificar no popup (aba Resumo):

| Medida | Esperado |
|--------|----------|
| Frente | 30,62 m |
| Fundo | 31,85 m |
| Lado Esq. | 87,25 m |
| Lado Dir. | **96,54 m** (60,74 + 7,26 + 28,54) |

> O automático (ETAPA 2.1.2) já corrige fundo e esquerdo; só o conector 7,26 m precisa de marcação manual até a planta bater 96,54 m na lateral direita.

---

## Resultado dos testes

| Comando | Resultado |
|---------|-----------|
| `npx tsx scripts/mandatory-official-measurements-grouped-sides-tests.ts` | **13/13 OK** |
| `npx tsx scripts/mandatory-side-classification-tests.ts` | **7/7 OK** |
| `npx tsx scripts/mandatory-lot-label-front-tests.ts` | **OK** |
| `npx tsx scripts/mandatory-assisted-confrontation-tests.ts` | **OK** |
| `npm run test:lot-audit` | **OK** |
| `npx next build` | **OK** (warnings pré-existentes em `app/plans/page.tsx`) |

### Novos casos (grouped-sides)

| Teste | Validação |
|-------|-----------|
| `testManualOfficialSideOverridesHeuristic` | `official_side` manual vence heurística |
| `testClearOfficialSideReturnsToAutomatic` | Limpar volta ao automático |
| `testLot010Single726SegmentManualRight` | Só 7,26 m como `right` → dir 96,54 m |
| `testMeasuresWithoutOfficialSideSafe` | Popup/medidas sem `official_side` não quebra |
| `assertDisjointSideIndexes` | segmentIndexes disjuntos (em todos os casos) |

---

## Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Conflito com ferramenta Confrontação | Mutuamente exclusivas na toolbar |
| Alterar área/confrontações | Persistência limitada a `official_side` em `segments_json` |
| Frente travada | `applyManualOfficialSideOverrides` preserva frente locked |

---

## Próximo passo sugerido

Commit local após revisão visual no mapa com Lote 010 real.
