# Relatório de Validação — Layout do popup do lote (Mapa GIS)

**Data:** 2026-06-08  
**Escopo:** Apenas interface visual do popup `LotPopupContent`  
**Commit:** não realizado (conforme solicitado)

---

## Objetivo

Reorganizar o popup do lote no Mapa GIS para ficar mais compacto, profissional e fácil de usar — **sem alterar regras de negócio, cálculos, confrontações, memorial, contratos, financeiro ou Supabase**.

---

## Arquivo alterado

| Arquivo | Alteração |
|---------|-----------|
| `components/map/GISMap.tsx` | Reorganização visual de `LotPopupContent` (+358 / −406 linhas) |

**Nenhum outro arquivo de lógica foi modificado.**

Imports removidos (não usados após simplificação visual): `chanfreTooltipText`, `formatChanfreMeters`.

---

## Mudanças de layout

### 1. Cabeçalho compacto
- `Lote {n} / QD {quadra}` em uma linha
- Badge de status à direita
- Cliente no cabeçalho apenas quando existir e lote não estiver disponível

### 2. Abas internas
- **Resumo** — área, frente, frente para, valor, cliente (se vendido), Corrigir Frente, Gerar Memorial
- **Confrontações** — frente/fundo/laterais com origem e botão Editar (mesmos dados da auditoria)
- **Comercial** — valor editável, Disponibilizar/Reservar/Vender/Limpar, ações de venda

### 3. Redução de altura
- Removidas linhas repetidas: Projeto, Quadra, Lote
- Removida grade de dimensões completa (fundo, laterais, perímetro, chanfre, curva) do popup
- Removida legenda decorativa de cores no rodapé
- Espaçamentos verticais reduzidos (`py-1.5`, `space-y-1.5`, `text-[10px]`/`[11px]`)

---

## O que NÃO foi alterado

| Área | Status |
|------|--------|
| `getOfficialLotMeasurementsForPopup` | Inalterado |
| `resolveLotFrontStreetDisplay` / frente | Inalterado |
| `buildLotConfrontationAudit` / confrontações | Inalterado — mesmos dados exibidos |
| Handlers: venda, reserva, contrato, financeiro | Inalterados |
| `handleSavePrice` / Supabase `blocks.update` | Inalterado |
| Memorial, contratos, financeiro (módulos) | Não tocados |
| `lib/`, `app/map/page.tsx` (lógica) | Não tocados |

---

## Build

| Comando | Resultado |
|---------|-----------|
| `npx next build` | **PASS** (warning pré-existente `ShieldCore` em `app/plans/page.tsx`) |

---

## Verificação de escopo (git diff)

```
components/map/GISMap.tsx   ← único arquivo de código alterado
tsconfig.tsbuildinfo        ← artefato de build (não incluir no commit)
```

---

## Próximo passo sugerido

Abrir o mapa, clicar em um lote (ex.: Lote 5 / QD 123) e validar visualmente as três abas em desktop e mobile.
