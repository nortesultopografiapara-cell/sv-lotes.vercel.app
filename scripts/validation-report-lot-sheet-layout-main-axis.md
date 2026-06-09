# Validação — Hierarquia profissional da prancha (eixo longitudinal)

Data: 2026-06-09

## Escopo

Alteração **somente do layout PDF** do croqui SIGEF. Sem mudanças em GIS, medidas oficiais, confrontações de dados, memorial, contratos, financeiro ou `lotSheetData.ts`.

## Filosofia visual (referência Civil 3D / Topograph / Métrica TOPO)

| Prioridade | Elemento | Regra |
|------------|----------|--------|
| 1 | Área | Centro da maior região livre; fonte maior; rotacionada no eixo longitudinal |
| 2 | Número do lote | Círculo menor (10 pt); próximo à frente oficial; não compete com a área |
| 3 | Medidas | Offset interno 6 mm (`forceInternalOnly`) |
| 4 | Vértices | Espaçamento mínimo 15 mm |

## Implementação

| Arquivo | Função |
|---------|--------|
| `lib/lotSheetLayout.ts` | `computeLotMainAxis()`, `findBestPrimaryAreaPosition()`, `placeLotNumberAndArea()` reescrito |
| `lib/lotSheetPdf.ts` | Área rotacionada (`areaAngleDeg`); número desenhado após a área com fonte menor |

## Eixo longitudinal

- Base: **maior aresta** do polígono no croqui
- Reforço: **PCA** quando o eixo da maior aresta diverge do eixo principal (> 55°)
- Saída: `angleDeg` legível (−90° … 90°) para jsPDF

## Testes executados

```
npx tsx scripts/mandatory-lot-sheet-final-polish-tests.ts   ✓
npx tsx scripts/mandatory-lot-sheet-sigef-layout-tests.ts   ✓
npx tsx scripts/mandatory-lot-sheet-layout-tests.ts         ✓
npx next build                                              ✓
```

## Resultado esperado

Pranchas futuras com área azul grande e inclinada no centro do lote e número vermelho menor junto à frente oficial, sem caixas brancas de proteção no croqui.
