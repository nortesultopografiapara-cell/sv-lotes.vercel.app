# Relatório de Validação — Confrontação: rua só na frente

**Data:** 2026-06-08  
**Escopo:** GIS — confrontação automática, auditoria (popup/prancha/memorial)  
**Commit:** não realizado (conforme solicitado)

---

## Problema reportado

Após corrigir a identificação de frentes por linha de rua, a confrontação automática passou a marcar **frente, fundo, lado direito e lado esquerdo** como rua (ex.: Lote 5 — todos os lados como `RUA 02`).

**Esperado (Lote 5):**

| Lado | Confrontante |
|------|----------------|
| Frente | RUA 02 |
| Lado esquerdo | Lote 4 (vizinho) |
| Lado direito | Lote 6 (vizinho) |
| Fundo | Lote 7 (vizinho) |

---

## Causa raiz

**Arquivo:** `lib/lotSegmentConfrontation.ts` — `resolveConfrontantForMergedSegment`

A `street_guide` era consultada **antes** da detecção geométrica de lotes vizinhos, para **qualquer** segmento, sem restringir ao lado `frente`. Segmentos laterais/fundos próximos da mesma polilinha de rua (ex.: canto inferior) recebiam `RUA 02` em vez do lote vizinho.

---

## Correções aplicadas

### 1. Prioridade por segmento (`lib/lotSegmentConfrontation.ts`)

| Etapa | Regra |
|-------|--------|
| 1 | Confrontante manual em `segments_json` |
| 2 | Contato geométrico com lote vizinho (`scoreSegmentAgainstBlock`) |
| 3 | Sequência numérica em laterais (lote ±1) |
| 4 | `street_guide` **somente** se permitido pelo papel do lado |
| 5 | Caso contrário → `A DEFINIR` |

**Rua permitida quando:**

- `sideRole === 'frente'` (frente mantém RUA quando junto à guia), **ou**
- Lote de esquina: segmento realmente voltado para a rua (`segmentQualifiesAsRealStreetFace` — paralelo + colado, sem vizinho)

**Rua bloqueada quando:**

- Lateral/fundo com vizinho geométrico resolvido (regra 4: linha de rua não vence lote vizinho)

### 2. Auditoria por segmento (`lib/assistedConfrontation.ts`)

- `buildLotConfrontationAudit` passa o `SideRole` completo (`frente` / `fundo` / `ladoDireito` / `ladoEsquerdo`) para `resolveConfrontantForMergedSegment`, não apenas laterais.

### 3. Agregação por lado

- `confrontantsForSide` agora recebe `SideRole` também para `fundo` (antes `undefined`).

### Arquivos verificados (sem alteração necessária)

| Arquivo | Status |
|---------|--------|
| `lib/memorial/memorialConfrontants.ts` | Consome auditoria — OK |
| `lib/lotStreetFrontDetection.ts` | Reutilizado (`scoreSegmentStreetProximity`) |
| `lib/resolveFrontStreetGuide.ts` | Frente por guia — OK |
| `lib/autoFrontStreetSegments.ts` | Grava rua só em índices de frente — OK |

---

## Teste novo

**Arquivo:** `scripts/mandatory-assisted-confrontation-tests.ts`  
**Caso:** `testLot5StreetOnlyOnFrontNeighborsOnSides`

- Quadra 123: Lotes 4, 5, 6, 7 + guia `RUA 02`
- Garante frente = `RUA 02`, esquerdo = `Lote 4`, direito = `Lote 6`, fundo = `Lote 7`
- Garante que `segmentEdges` da auditoria não marcam lateral/fundo como rua

---

## Testes executados

| Comando | Resultado |
|---------|-----------|
| `npx next build` | **PASS** (warnings pré-existentes em `app/plans/page.tsx` — `ShieldCore`) |
| `npx tsx scripts/mandatory-assisted-confrontation-tests.ts` | **PASS** (8 testes, incl. Lote 5) |
| `npx tsx scripts/mandatory-memorial-description-tests.ts` | **PASS** |
| `npx tsx scripts/mandatory-front-street-name-tests.ts` | **PASS** (10 testes) |

---

## Impacto

| Módulo | Impacto |
|--------|---------|
| GIS / popup | Confrontações laterais e fundo voltam a priorizar vizinhos |
| Memorial / prancha | Mesma auditoria (`buildLotConfrontationAudit`) — consistente |
| Contratos / financeiro | Não alterados |
| Layout visual | Não alterado |
| Múltiplos confrontantes por lado | Preservado (`concatDistinctSideConfrontants`) |

---

## Riscos residuais

1. **Lote de esquina** com rua em lateral: só recebe rua se não houver vizinho e o segmento for paralelo/colado à guia (critério mais estrito que antes).
2. **Projetos com `street_guide` muito próxima** de divisas internas: laterais com vizinho geométrico continuam protegidas; cantos sem vizinho podem ainda receber rua se paralelos à guia.

---

## Próximo passo sugerido

Validar no mapa real (Quadra 123, Lote 5): executar **Confrontação Automática** e confirmar no popup que apenas a frente exibe `RUA 02 (rua)`.
