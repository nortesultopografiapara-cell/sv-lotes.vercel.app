# Validação — Regras de posicionamento da prancha SIGEF

Data: 2026-06-09 (atualizado)

## Escopo

Correção **somente do algoritmo de layout PDF** (não altera GIS, medidas oficiais, confrontações de dados, memorial, contratos ou financeiro).

## Filosofia atual (referência Civil 3D / Topograph / Métrica TOPO)

| Prioridade | Elemento | Regra |
|------------|----------|--------|
| 1 | **Área** | Centro visual livre, fonte maior, rotacionada no eixo longitudinal |
| 2 | **Número** | Círculo menor, próximo à frente oficial, não compete com a área |
| 3 | Medidas | Offset interno fixo (6 mm) |
| 4 | Vértices | Espaçamento mínimo 15 mm |

## Regras implementadas

| # | Regra | Implementação |
|---|--------|----------------|
| 1 | Área como elemento principal | `findBestPrimaryAreaPosition()` + `computeLotMainAxis()` (maior aresta + PCA) |
| 2 | Área rotacionada no eixo do lote | `areaAngleDeg` desenhado com `angle` no jsPDF |
| 3 | Número secundário na frente | `placeBadgeNearOfficialFront()` com `LOT_FRONT_BADGE_DEPTH_FRACTION = 0.1` |
| 4 | Medidas sempre dentro do lote | `resolveMeasureLabelPosition({ forceInternalOnly: true })`; offset 6 mm |
| 5 | Sem caixas brancas de proteção | `useCombinedBox: false`; colisões por reposicionamento |
| 6 | Confrontações com margem inferior | `computeConfrontationsPanelHeight()` + pad 4 mm |

## Arquivos alterados

- `lib/lotSheetLayout.ts` — núcleo das regras de posicionamento
- `lib/lotSheetPdf.ts` — integração SIGEF, remoção de máscara combinada
- `lib/lotSheetSigefLayout.ts` — altura dinâmica do painel de confrontações
- `scripts/mandatory-lot-sheet-final-polish-tests.ts` — testes das novas regras

## Casos especiais tratados

- **Lotes estreitos** (ex.: Lote 04): profundidade mínima extra quando o texto “abaixo” aponta para a frente (`inwardNy < 0`)
- **Lotes altos**: teto de profundidade (`maxDepthFrac`) evita colisão da área com medida do fundo
- **Colisão número/área × medidas**: busca multi-candidata de stack (profundidade + lateral)

## Testes executados

```
npx tsx scripts/mandatory-lot-sheet-final-polish-tests.ts   ✓
npx tsx scripts/mandatory-lot-sheet-sigef-layout-tests.ts   ✓
npx tsx scripts/mandatory-lot-sheet-layout-tests.ts         ✓
npx next build                                              ✓
```

## Resultado esperado nas próximas pranchas

1. Círculo do lote próximo à frente oficial, avançado para dentro do polígono
2. Área azul logo abaixo do número, centralizada no mesmo eixo
3. Medidas das divisas com afastamento interno uniforme (≥ 6 mm da linha)
4. Sem retângulos brancos sobre o croqui
5. Última linha de confrontações com folga acima da borda inferior da tabela
