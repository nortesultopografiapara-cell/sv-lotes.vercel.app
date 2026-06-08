# Relatório de Validação — Identificar Frentes × polilinha de rua

**Data:** 2026-06-08  
**Escopo:** GIS — frente por street_guides, labels, sem alterar memorial/contratos/financeiro  
**Commit:** não realizado (conforme solicitado)

---

## Problema

Após **Identificar Frentes** (220 lotes), vários labels permaneciam em laterais ou divisas internas em vez da frente voltada para a linha de rua desenhada.

## Causa raiz

1. **Mapeamento errado segmento TXT ↔ aresta WGS84** — `findFrontSegmentIndexTouchingStreet` usava posição no array (`i`) em vez da aresta real do polígono.
2. **Polilinha incompleta** — guias multiponto não eram flattenadas em `handleIdentifyFronts`.
3. **Divisas internas** — laterais encostadas em lotes vizinhos competiam com a frente voltada para a rua.
4. **Amostragem fraca** — distância calculada só em 3 pontos (extremos + meio), insuficiente para ruas curvas.

## Correções

### `lib/lotStreetFrontDetection.ts` (reescrita focal)

| Função | Mudança |
|--------|---------|
| `scoreSegmentStreetProximity` | 5 amostras ao longo da aresta + `nearestPointOnLine` na polilinha completa |
| `findFrontWgsRingEdgeTouchingStreet` | Pontua **arestas WGS84** do anel; prioriza arestas externas |
| `isLotEdgeInternal` | Detecta divisa com outro lote (tolerância 1,5 m) |
| `identifyLotFrontFromStreetGuides` | API unificada: aresta WGS + segment_index + guia |
| `findFrontSegmentIndexTouchingStreet` | Delega à nova lógica WGS → UTM |

### `app/map/page.tsx` — `handleIdentifyFronts`

- Flatten de `geometry_geojson` via `flattenLineStringCoordinates`
- Vizinhos do projeto passados como `neighborRingsLngLat`
- Caminho único TXT / não-TXT via `identifyLotFrontFromStreetGuides`
- Persistência com `normalizeFrontSegmentIndexForPersist(ringEdgeIndex)`

### Labels

- `front_segment_index` salvo como aresta WGS84 canônica
- `computeOfficialLotLabelPosition` já existente — obedece índice normalizado + `segments_json`

## Teste novo

`testCurvedStreetPicksFrontNotInternalLateral` em `mandatory-front-street-name-tests.ts`:

- Lote retangular 12×25 m
- Vizinho a leste (lateral interna 25 m)
- Rua curva/multiponto na frente sul
- Garante `ringEdgeIndex === 0`, não lateral leste
- Garante label mais próximo da frente sul

## Validação executada

| Comando | Resultado |
|---------|-----------|
| `npx tsx scripts/mandatory-front-street-name-tests.ts` | **PASS** |
| `npx tsx scripts/mandatory-lot-label-front-tests.ts` | **PASS** |
| `npx tsx scripts/mandatory-assisted-confrontation-tests.ts` | **PASS** |
| `npx next build` | **PASS** |

## Checklist pós-deploy manual

- [ ] Identificar Frentes com ruas multiponto visíveis
- [ ] Lotes de esquina: frente na rua, não na divisa com vizinho
- [ ] Labels reposicionados na frente após refresh do mapa
- [ ] Lotes 12/13/19/20/34 com frente correta

## Arquivos alterados

- `lib/lotStreetFrontDetection.ts`
- `app/map/page.tsx`
- `scripts/mandatory-front-street-name-tests.ts`
- `scripts/validation-report-identify-fronts-street-polyline.md`
