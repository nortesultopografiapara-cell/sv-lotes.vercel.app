# Validação — Regras de posicionamento da prancha SIGEF

Data: 2026-06-09

## Escopo

Correção **somente do algoritmo de layout PDF** (não altera GIS, medidas oficiais, confrontações de dados, memorial, contratos ou financeiro).

## Regras implementadas

| # | Regra | Implementação |
|---|--------|----------------|
| 1 | Número do lote pela frente oficial (não centroide) | `computeLotFrontLayoutContext()` + `placeLotNumberAndArea()` com `frontEdgeIndex`; profundidade base `LOT_FRONT_BADGE_DEPTH_FRACTION = 0.1` |
| 2 | Área abaixo e alinhada ao número | `areaPosBelowBadge()` — stack vertical PDF (+Y) com mesmo X |
| 3 | Medidas sempre dentro do lote | `resolveMeasureLabelPosition({ forceInternalOnly: true })` no fluxo SIGEF; offset mínimo 6 mm |
| 4 | Sem caixas brancas de proteção | `useCombinedBox: false` permanente; colisões resolvidas por reposicionamento |
| 5 | Tabela de confrontações com margem inferior | `computeConfrontationsPanelHeight()` + `CONFRONTATIONS_PANEL_BOTTOM_PAD_MM = 4` |

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
