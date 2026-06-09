# Relatório de Validação — ETAPA 4 Layout SIGEF da Prancha PDF

**Data:** 2026-06-08  
**Escopo:** Reestruturação visual da prancha PDF (estilo SIGEF/INCRA)  
**Commit:** Não realizado (conforme solicitado)

---

## Objetivo

Reestruturar o layout da prancha PDF com referência em plantas SIGEF/INCRA: croqui limpo, quadros dedicados de confrontações e dados técnicos, escala e norte fixos, posicionamento seguro de medidas/número/área.

**Não alterado:** cálculos GIS, `officialLotMeasurements`, confrontações (dados), memorial, contratos, financeiro, banco.

---

## Arquivos criados / alterados

| Arquivo | Alteração |
|---------|-----------|
| `lib/lotSheetSigefLayout.ts` | **Novo** — regiões da página, quadro CONFRONTAÇÕES, bloco técnico SIGEF |
| `lib/lotSheetPdf.ts` | Layout SIGEF, medidas com flip interno/externo, nº lote central, área compacta |
| `scripts/mandatory-lot-sheet-sigef-layout-tests.ts` | **Novo** — 8 casos ETAPA 4 |

---

## Implementações

### 1. Croqui limpo (`LOT_SHEET_SIGEF_LAYOUT`)

Exibe apenas:
- Perímetro
- Vértices M-01…
- Medidas oficiais agrupadas
- Número do lote (centro visual livre)
- Área (fonte proporcional, caixa compacta se necessário)

**Removido do croqui:** confrontantes laterais, rua principal, textos longos.

### 2. Quadro CONFRONTAÇÕES

- Posicionado **abaixo do croqui**
- `drawSigefConfrontationsPanel` usa `sideConfrontants` de `confrontantsFromAudit` / `buildLotConfrontationAudit`
- Layout 2 colunas: Frente/Fundo | Lado Direito/Esquerdo

### 3. Quadro técnico SIGEF

`drawSigefTechnicalPanel` com:
- Projeto, Cliente, CPF/CNPJ
- Quadra, Lote, Área, Perímetro, Escala, Município, Data
- Responsável Técnico (nome + CREA/CFT)
- Perímetro via `getOfficialLotMeasurements` (sem alterar cálculo)

### 4. Responsável técnico

- Painel inferior mantido (`drawBottomFooterSplit`)
- Assinatura, carimbo, nome, cargo, CREA/CFT da empresa

### 5. Escala e norte

- **Norte:** canto superior direito do croqui (posição fixa)
- **Escala gráfica:** faixa inferior do croqui (`sketchScaleBand`), protegida de labels
- Regiões sem sobreposição validadas em testes

### 6. Posicionamento técnico de textos

| Elemento | Regra |
|----------|-------|
| Medidas | Mín. **4 mm** da divisa; tenta interno, depois externo; evita colisão com vértices |
| Número do lote | Centro visual livre (`findBestInteriorLabelPosition`), mín. 6 mm da divisa |
| Área | Fonte adaptativa; fallback abaixo do número em bloco compacto |
| Vértices | Stagger ×6 para M-03/M-04 e similares |
| Rua | Oculta no croqui SIGEF (só no quadro CONFRONTAÇÕES) |

### 7. Tabela de coordenadas

- Título "TABELA DE COORDENADAS"
- Fonte e linhas maiores (5 mm / 6 pt cabeçalho)
- Alinhamento preservado

---

## Testes executados

| Comando | Resultado |
|---------|-----------|
| `npx tsx scripts/mandatory-lot-sheet-sigef-layout-tests.ts` | **PASS** (8 casos) |
| `npx tsx scripts/mandatory-lot-sheet-layout-tests.ts` | **PASS** |
| `npx tsx scripts/mandatory-memorial-description-tests.ts` | **PASS** |
| `npx tsx scripts/mandatory-official-measurements-grouped-sides-tests.ts` | **PASS** |
| `npx next build` | **PASS** |

### Casos SIGEF

| Caso | Validação |
|------|-----------|
| Lote retangular | PDF gerado, perímetro ~300 m |
| Lote irregular (010) | 7 segmentos, PDF OK |
| Lote com chanfre (05) | 5 vértices, PDF OK |
| Muitos segmentos (018) | 7 segmentos, PDF OK |
| Regiões da página | Sem sobreposição entre caixas |
| Confrontações | `buildLotConfrontationAudit` + `confrontantsFromAudit` |

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Croqui com pouco espaço vertical | `computeSigefPageRegions` garante croqui mín. 88 mm |
| Perímetro ausente em lotes sem TXT | Exibe "—" via `formatPerimeterDisplay` |
| RT sem cadastro | Mensagem no painel inferior mantida |

---

## Conclusão

ETAPA 4 implementada: layout SIGEF profissional com croqui limpo, quadros dedicados e posicionamento seguro de labels. Nenhum commit ou push realizado.
