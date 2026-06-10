# Validação manual — Google Satellite/Hybrid no GIS

## Pré-requisitos

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` configurada na Vercel (Production/Preview)
- APIs habilitadas no Google Cloud: **Maps JavaScript API**
- Restrições de referrer incluindo `https://sv-lotes.vercel.app/*` e domínio de preview

## Console (logs temporários)

Ao abrir o mapa ou trocar zoom/camada:

```
GOOGLE_MAPS_KEY_PRESENT=true
activeBaseLayer google_satellite
currentZoom 18
```

Se Google falhar:

```
GIS_GOOGLE_LAYER_FALLBACK { requested: 'google_satellite', fallback: 'esri_satellite' }
effectiveBaseLayer esri_satellite
```

## Checklist — CHACREAMENTO MARTINI II

1. Abrir **Mapa GIS** → selecionar empreendimento **CHACREAMENTO MARTINI II**
2. Confirmar camada padrão **Google Satélite**
3. Aumentar zoom (18 → 21+)
4. Verificar imagem de satélite **Google** (sem “Map data not yet available”)
5. Trocar para **Google Híbrido** → ruas/labels Google sobre satélite
6. Trocar para **Esri Satélite** → fallback Esri funcional
7. Trocar para **OpenStreetMap** → vetor OSM
8. Confirmar lotes, rótulos, seleção de lote e barra lateral intactos
9. Testar **Prancha do Lote** (impressão/PDF) em um lote

## Resultado esperado

- Google como padrão quando a chave está presente
- Fallback automático para Esri se Google não carregar
- `maxZoom` 22 mantido no mapa
