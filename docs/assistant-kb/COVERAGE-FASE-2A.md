# Cobertura operacional — Assistente SV Fase 2A

Fonte: código real em `sv-lotes-feat-assistant-sv` (branch `feat/assistant-sv-fase-2a`).  
KB antes: **16** procedimentos. KB depois: **37** procedimentos.

Legenda KB: `criada` = arquivo novo; `atualizada` = tags/passos; `prévia` = já existia e permanece; `lacuna` = existe na UI e ainda não tem procedimento próprio.

## Inventário

| Módulo | Funcionalidade encontrada | Rota | Controle real | KB criada/atualizada | Perfil permitido | Teste |
|---|---|---|---|---|---|---|
| Dashboard | KPIs + filtro empreendimento | `/dashboard` | Empreendimento / Todos os empreendimentos | dashboard-exportar (criada) | ADMIN, OWNER | 2A testKbCoverageGrew |
| Dashboard | Exportar Relatório de Lotes | `/dashboard` | Exportar Excel / Exportar PDF → Gerar | dashboard-exportar (criada) | canExportLotReport | 2A |
| GIS | Abrir mapa / voltar projetos | `/map` | Abrir Mapa / Voltar aos projetos | gis-config-empreendimento (atualizada) | ADMIN, BROKER | 1A/2A |
| GIS | Novo/Editar Projeto | `/map` | Novo Projeto / Editar Projeto | gis-config-empreendimento (prévia) | ADMIN | 2A testCoreModules |
| GIS | Split | `/map` | Configurar Split | gis-split-recebimentos (prévia) | ADMIN | 2A |
| GIS | Quadras do Projeto | `/map` | tooltip Quadras do Projeto | gis-quadras-txt (criada) | ADMIN desktop | — |
| GIS | Importar TXT Civil 3D | `/map` | Importar TXT | gis-quadras-txt (criada) | ADMIN desktop | — |
| GIS | Importar KML (toolbar) | `/map` | Importar Quadras (KML) | lacuna (toolbar oculta: SHOW_LEGACY_GIS_IMPORT=false) | ADMIN | relatado |
| GIS | Shapefile toolbar | `/map` | Shapefile (.zip) | lacuna na barra; citado no TXT | ADMIN | relatado |
| GIS | Confrontação Automática | `/map` | Confrontação Automática | gis-confrontacoes (criada) | ADMIN desktop | 2A testGisDocuments |
| GIS | Revisar Confrontações | `/map` | Revisar Confrontações | gis-confrontacoes (criada) | ADMIN desktop | 2A |
| GIS | Memorial Descritivo (barra) | `/map` | Memorial Descritivo | gis-lot-memorial (criada) | ADMIN | 2A |
| GIS | Centralizar GPS | `/map` | Centralizar GPS | gis-medir-camadas (criada) | mapa aberto | — |
| GIS | Medir Distância | `/map` | Medir Distância | gis-medir-camadas (criada) | mapa aberto | — |
| GIS | Medir Área + PDF | `/map` | Medir Área / Exportar PDF | gis-medir-camadas (criada) | mapa aberto | — |
| GIS | Prancha Geral | `/map` | Prancha Geral | gis-prancha-geral (criada) | mapa aberto | 2A |
| GIS | Relatório de Vias | `/map` | Relatório de Vias | gis-vias (criada) | ADMIN | — |
| GIS | Gerar Prancha do Lote (barra) | `/map` | Gerar Prancha do Lote | gis-prancha-lote (criada) | não OWNER | 2A |
| GIS | Camadas do Mapa | `/map` | Google Satélite / Híbrido / Esri / OSM | gis-medir-camadas (criada) | mapa aberto | — |
| GIS | Linha de Rua | `/map` | Linha de Rua / Salvar logradouro | gis-vias (criada) | ADMIN desktop | — |
| GIS | Identificar Frentes | `/map` | Identificar Frentes | gis-corrigir-frente (criada) | ADMIN | — |
| GIS | Ocultar/Mostrar Linhas | `/map` | Ocultar Linhas / Mostrar Linhas | gis-corrigir-frente (criada) | ADMIN desktop | — |
| Ficha lote | Abas Resumo / Confrontações / Comercial / Histórico | `/map` | tabs da ficha | gis-lot-memorial + venda/reserva | ADMIN, BROKER | 1D/2A |
| Ficha lote | Corrigir frente | `/map` | Corrigir frente | gis-corrigir-frente (criada) | não BROKER/OWNER | — |
| Ficha lote | Gerar memorial | `/map` | Gerar memorial | gis-lot-memorial (criada) | segmentos oficiais | 2A follow-up |
| Ficha lote | Gerar prancha | `/map` | Gerar prancha | gis-prancha-lote (criada) | não OWNER | 2A |
| Ficha lote | Vender / Reservar | `/map` | Vender / Reservar | gis-venda-* / gis-reserva (prévia) | ADMIN, BROKER | 1A/1C/2A |
| Ficha lote | Editar Venda / Ver Contrato / Regenerar / Ver Financeiro | `/map` | Comercial (lote vendido) | contracts-regenerar + finance (parcial) | ADMIN | lacuna de procedimento dedicado |
| Corretores | Cadastrar | `/dashboard/brokers` | Novo Corretor | brokers-corretores (prévia) | ADMIN | 1A |
| Corretores | Foto/avatar | `/dashboard/brokers` | clique na foto → Foto do corretor → Salvar foto | brokers-foto (criada) | ADMIN | 2A testBrokerPhoto |
| Corretores | Editar / ativar / senha / CRECI | `/dashboard/brokers` | Ações | brokers-editar (criada) | ADMIN | — |
| Corretores | Minhas Vendas | `/my-sales` | menu do BROKER | lacuna (relação documentada no audit) | BROKER | — |
| Clientes | Novo Cliente | `/customers` | Novo Cliente | customers-cadastro (prévia) | ADMIN | 2A |
| Clientes | Busca/edição/histórico | `/customers` | Editar / Visualizar / Histórico | customers-editar (criada) | ADMIN | — |
| Clientes | Botão Filtros | `/customers` | Filtros | lacuna — controle sem handler | — | inconsistência |
| Financeiro | Parcelas / filtros | `/finance` | aba Parcelas | finance-visao-geral (prévia) | ADMIN, OWNER leitura | 2A |
| Financeiro | Registrar pagamento + auth | `/finance` | Registrar pagamento | finance-recibos (prévia) + finance-baixa-manual (criada) | ADMIN | — |
| Financeiro | Recibo/carnê | `/finance` | Gerar recibo / carnê | finance-recibos (prévia) | ADMIN | 1A |
| Financeiro | Fluxo de caixa / saída | `/finance` | Fluxo de Caixa / Registrar Saída | finance-fluxo-caixa (criada) | ADMIN; OWNER leitura | — |
| Cobranças | Gerar PIX/boleto / sync | `/charges` | Gerar cobrança | charges-cobrancas (prévia) | ADMIN | 2A |
| Cobranças | WhatsApp e lote | `/charges` | WhatsApp / WhatsApp em lote | charges-whatsapp (atualizada) | ADMIN | 1A |
| Cobranças | Lembretes / régua | `/charges` | Lembretes | charges-lembretes (criada) | ADMIN | — |
| Contratos | Gerar a partir da venda | `/map` + `/contracts` | Confirmar Venda | contracts-gerar (prévia) | ADMIN, BROKER na venda | 1A |
| Contratos | Enviar para assinatura | `/contracts` | Enviar para assinatura | contracts-enviar-assinatura (prévia) | ADMIN | 1D/2A |
| Contratos | Regenerar | `/contracts` | Regenerar Contrato | contracts-regenerar (prévia) | ADMIN | 1A |
| Contratos | PDF / versões / cancelar / carnê | `/contracts` | Baixar PDF / Histórico / Cancelar | contracts-pdf-versoes (criada) | ADMIN; OWNER leitura | — |
| Contratos | Assinatura LF / Mundo Novo | `/contracts` | Assinar promitente vendedor | contracts-assinatura-* (prévia) | ADMIN | 1A/1B |
| Configurações | Empresa / representante / integração | `/settings` | Salvar Configurações | settings-empresa (criada) | ADMIN | — |
| Sócios | Cadastro e acesso | `/owners` | Novo Sócio / Proprietário | owners-socios (criada) | ADMIN | — |
| Billing | Minha Assinatura | `/billing` | Atualizar / Baixar boleto | billing-assinatura (criada) | ADMIN | — |
| Offline | Fila offline | `/offline-sync` | Sincronizar pendentes | offline-sync (criada) | ADMIN | — |
| Migração | Assistente de carga | `/data-migration` | Assistente / Histórico | data-migration (criada, abas apenas) | ADMIN | lacuna do wizard interno |
| Header | Assistente IA / perfil / sair | layout | Assistente IA | 1A chrome | todos (RBAC no conteúdo) | 1A |
| Portal cliente | CPF + painel público | `/portal-cliente` | Continuar | lacuna — sem tela admin no app operador | — | INCONCLUSIVO |
| GIS | Venda parcelada / à vista / reserva | `/map` | Vender / Reservar | prévia | ADMIN, BROKER | 1A–1D |

## Lacunas (existem no código, KB incompleta ou ausente)

- Toolbar KML/Shapefile oculta (`SHOW_LEGACY_GIS_IMPORT = false`); Shapefile ainda no modal TXT.
- Ações do lote vendido (Editar Venda, Ver Contrato, Ver Financeiro) sem procedimento próprio.
- Minhas Vendas (`/my-sales`) sem procedimento dedicado.
- Wizard interno de Migração de Dados (além das abas).
- Portal do Cliente como orientação administrativa (não há tela operador dedicada).
- Rotas fora do menu permanente: `/manual`, `/reports`, `/legacy-contracts`, `/crm`, `/users`, `/logs`, `/contracts/templates`.
- Painel Asaas dentro do Financeiro (além de Cobranças).

## Inconsistências (código vs UI — não corrigidas nesta fase)

1. Em Clientes, o botão **Filtros** não tem handler.
2. No mobile de Contratos, **Editar Modelo** chama aba `"Templates"`, que não existe na lista de abas.
3. Cadastro **Novo Corretor** não tem foto; a foto só existe na lista/edição.
4. Import KML/Shapefile ainda no código da toolbar, mas a flag os esconde.

## activeGoal

Arquivo: `lib/assistant/activeGoal.ts`.  
Resolvido no servidor a partir da pergunta + histórico. Não substitui o snapshot factual da UI.

Persistência conceitual até: conclusão, mudança explícita de assunto, ou objetivo incompatível com o contexto.  
Follow-up `Já selecionei. E agora?` após memorial permanece em `gis.lot.memorial` (não cai em Vender/Reservar).

## Validação (Fase 2A)

- `npx tsx scripts/mandatory-assistant-sv-fase-1a-tests.ts` → ASSISTANT_SV_FASE_1A_OK
- `npx tsx scripts/mandatory-assistant-sv-fase-1b-tests.ts` → ASSISTANT_SV_FASE_1B_OK
- `npx tsx scripts/mandatory-assistant-sv-fase-1c-tests.ts` → ASSISTANT_SV_FASE_1C_OK
- `npx tsx scripts/mandatory-assistant-sv-fase-1d-tests.ts` → ASSISTANT_SV_FASE_1D_OK
- `npx tsx scripts/mandatory-assistant-sv-fase-2a-tests.ts` → ASSISTANT_SV_FASE_2A_OK

Contagem: **16** procedimentos (1A–1D) → **37** procedimentos (2A). Arquivos JSON da KB: 37 + `index.json`. Inventário da tabela acima: **55** funcionalidades reais auditadas; **6** lacunas listadas; **4** inconsistências código/UI (não corrigidas nesta fase).

## Fechamento candidato (1A–1D + 2A)

Consulta em tempo real **não** entra nesta versão (Fase 2B futura).  
`Tem parcela vencida hoje?` recupera `finance-visao-geral` e orienta a abrir Financeiro → Parcelas; o Assistente declara que **não consulta o banco**.

Correções de retrieval no fechamento (sem novo produto):
- tags genéricas de WhatsApp (`cobranca`, `lote`, `lembrete`) não roubam emissão nem régua;
- `gis-config-empreendimento` não lista mais memorial/prancha/confrontação como rótulos próprios;
- matching de tags deixou de tratar `parcela` como `parcelado`.
