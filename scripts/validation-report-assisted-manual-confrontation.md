# Relatório — ETAPA 2: Confrontação Assistida Manual por Segmento

**Data:** 2026-06-08  
**Escopo:** Confrontação manual por `segment_index` em `segments_json`, prioridade máxima sobre automático, integração popup/memorial/prancha/auditoria/histórico.

---

## Resumo

A ETAPA 2 evolui a infraestrutura GIS-005 já existente para confrontação **por segmento**, com persistência em `segments_json`, modal **Editar Confrontação**, popup segmentado, destaque visual no mapa e histórico granular em `lot_audit_logs`.

**Migration:** Não foi necessária. Toda persistência usa `segments_json` no registro do lote (`blocks.segments_json`).

---

## Prioridade de confrontantes (implementada)

1. Confrontante manual por segmento (`confrontant_source: manual` + campos `manual_confrontant_*`)
2. Auditoria assistida / `segmentEdges`
3. Lote vizinho automático
4. Rua / `street_guide`
5. A DEFINIR

Garantias existentes preservadas:
- `applyAutoFrontStreetToBlockSegments` não sobrescreve segmentos com `manual`
- `resolveConfrontantForMergedSegment` consulta `getSegmentConfrontantRecord` antes de vizinho/rua
- `resolveMemorialSegmentConfrontant` prioriza manual em `segments_json`

---

## Persistência em `segments_json`

Por `segment_index`, ao salvar manual:

```json
{
  "segment_index": 2,
  "confrontant": "Lote 07",
  "confrontante": "Lote 07",
  "confrontant_type": "lot",
  "confrontant_source": "manual",
  "manual_confrontant": "Lote 07",
  "manual_confrontant_type": "lot",
  "manual_confrontant_source": "manual",
  "updated_at": "2026-06-08T..."
}
```

Leitura compatível com registros antigos (`confrontant` / `confrontante` sem `manual_*`).

Limpar manual remove todos os campos de confrontação do segmento (`clearManualConfrontantFromSegmentRows`).

---

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `lib/segmentConfrontantPersist.ts` | Campos `manual_*`, `updated_at`, `clearManualConfrontantFromSegmentRows` |
| `lib/assistedConfrontation.ts` | `clearManualConfrontantFromBlock` |
| `lib/confrontantTypes.ts` | Presets `lot`, `street`; rótulo "Manual / Outro" |
| `components/map/InformConfrontantModal.tsx` | Título "Editar Confrontação", confrontante atual, limpar manual |
| `components/map/GISMap.tsx` | Auditoria sempre ativa, popup por segmento, histórico old/new, tooltip manual |
| `app/map/page.tsx` | Ferramenta renomeada para "Editar Confrontação" |
| `scripts/mandatory-assisted-confrontation-tests.ts` | 9 cenários ETAPA 2 |
| `scripts/mandatory-lot-audit-tests.ts` | Payloads `confrontation_manual` alterada/removida |

**Não alterados (já integrados):**
- `lib/lotSegmentConfrontation.ts` — prioridade manual já existia
- `lib/memorial/memorialConfrontants.ts` — prioridade manual já existia
- `lib/lotSheetData.ts` — usa `buildLotConfrontationAudit` + `confrontantsFromAudit`
- `lib/autoFrontStreetSegments.ts` — proteção manual já existia

---

## Interface

### Ferramenta "Editar Confrontação" (mapa)
- Botão na barra lateral do mapa (antes "Inserir Confrontante")
- Ativa revisão assistida + modo de edição
- Clique na divisa → modal compacto com lote, lado, segmento, confrontante atual, tipo, salvar/cancelar/limpar

### Popup — aba Confrontações
- Lista por **segmento** (Seg. N) quando o lado tem múltiplos segmentos
- Origem: manual / vizinho / rua / auto / indefinido
- Botão **Editar** abre o mesmo modal, por segmento

### Mapa — validação visual
- Azul (`#3b82f6`) = confrontação manual
- Tooltip: "Confrontação manual: {nome}"
- Legenda assistida mantida (verde/amarelo/azul/vermelho)

### Histórico (`lot_audit_logs`)
- Salvar: `action: confrontation_manual`, título "Confrontação manual alterada", `old_data`/`new_data` por segmento
- Limpar: título "Confrontação manual removida"

---

## Testes executados

| Comando | Resultado |
|---------|-----------|
| `npx next build` | ✅ OK (warning pré-existente `ShieldCore` em `app/plans/page.tsx`) |
| `npx tsx scripts/mandatory-assisted-confrontation-tests.ts` | ✅ 16 testes (9 ETAPA 2 + 7 legado) |
| `npx tsx scripts/mandatory-memorial-description-tests.ts` | ✅ OK |
| `npm run test:lot-audit` | ✅ OK |

### Cenários ETAPA 2

| # | Cenário | Teste |
|---|---------|-------|
| 1 | Manual vence lote vizinho automático | `testManualBeatsNeighborAuto` |
| 2 | Manual vence rua | `testManualBeatsStreet` |
| 3 | Confrontação automática não apaga manual | `testAutoStreetDoesNotWipeManual` |
| 4 | Memorial usa confrontante manual | `testMemorialUsesManual` |
| 5 | Prancha usa confrontante manual | `testPranchaUsesManual` |
| 6 | Popup/auditoria exibe origem manual | `testAuditShowsManualOrigin` |
| 7 | Limpar manual volta para automático | `testClearManualRevertsToAuto` |
| 8 | Histórico registra confrontation_manual | `testAuditLogConfrontationManual` |
| 9 | Múltiplos segmentos, confrontantes diferentes | `testMultiSegmentDifferentManual` |

---

## Riscos remanescentes

1. **`CorrectConfrontationsModal`** (prancha) ainda usa `localStorage` (`lotConfrontations.ts`) por lado — legado paralelo ao `segments_json`. Memorial/prancha via `lotSheetData` já usam auditoria/segments_json; o modal da prancha pode divergir se o usuário usar só localStorage.

2. **Performance:** auditoria de confrontação agora roda para todos os lotes visíveis no mapa (para popup). Em projetos muito grandes (>500 lotes simultâneos no viewport) pode exigir lazy-load por lote aberto.

3. **Propagação em lote:** escopos `quadra_same_side` / `aligned_nearby` aplicam manual em lotes pendentes — comportamento herdado; revisar em campo se a propagação deve ser restrita só a `lot_only` por padrão.

4. **Commit:** alterações **não commitadas** conforme solicitado.

---

## Próximos passos sugeridos (opcional)

- Deprecar `CorrectConfrontationsModal` / `localStorage` em favor exclusivo de `segments_json`
- Lazy-build de `buildLotConfrontationAudit` só ao abrir popup do lote
- Teste E2E no browser (clique divisa → salvar → verificar memorial PDF)
