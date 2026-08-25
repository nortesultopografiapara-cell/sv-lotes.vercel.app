/**
 * Workspace visual da aba Histórico do lote no GIS (somente UI).
 * npx tsx scripts/mandatory-gis-lot-history-workspace-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { formatLotAuditEvent, type FormattedLotAuditEvent, type LotAuditLogRow } from '../lib/lotAudit';
import {
  classifyLotHistoryFilter,
  filterLotHistoryEvents,
  formatLotHistoryEventCount,
  groupLotHistoryByDate,
  listLotHistoryFilterChips,
  lotHistoryDateKey,
  lotHistoryTerminationDocumentLinks,
  lotHistoryTerminationSaleIds,
  lotHistoryImprovementsLine,
  resolveLotHistoryActor,
  splitLotHistoryDescription,
} from '../lib/lotHistoryPresentation';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function event(
  partial: Partial<LotAuditLogRow> & Pick<LotAuditLogRow, 'id' | 'action' | 'title' | 'created_at' | 'source'>,
): FormattedLotAuditEvent {
  return formatLotAuditEvent({
    company_id: null,
    project_id: null,
    block_id: 'b1',
    lot_id: 'b1',
    sale_id: null,
    contract_id: null,
    user_id: null,
    description: null,
    old_data: null,
    new_data: null,
    ...partial,
  });
}

function testClassificationAndFilters() {
  const sold = event({
    id: 's',
    action: 'sold',
    title: 'Venda concluída',
    created_at: '2026-08-21T22:50:00.000Z',
    source: 'sale_flow',
  });
  const reserved = event({
    id: 'r',
    action: 'reserved',
    title: 'Lote reservado',
    created_at: '2026-08-20T12:00:00.000Z',
    source: 'sale_flow',
  });
  const front = event({
    id: 'f',
    action: 'front_corrected',
    title: 'Frente corrigida',
    created_at: '2026-08-24T12:37:00.000Z',
    source: 'gis_map',
    description: 'Frente alterada para Rua 02',
  });
  const auto = event({
    id: 'a',
    action: 'confrontation_auto',
    title: 'Confrontação automática',
    created_at: '2026-08-12T10:00:00.000Z',
    source: 'gis_map',
  });
  const value = event({
    id: 'v',
    action: 'value_changed',
    title: 'Valor do lote alterado',
    created_at: '2026-08-21T22:49:00.000Z',
    source: 'gis_map',
    description: 'R$ 1.200,00 → R$ 25,00',
  });
  const created = event({
    id: 'c',
    action: 'lot_created',
    title: 'Lote criado',
    created_at: '2026-08-01T09:00:00.000Z',
    source: 'gis_map',
  });
  const viewed = event({
    id: 'w',
    action: 'contract_viewed',
    title: 'Contrato visualizado',
    created_at: '2026-08-10T11:00:00.000Z',
    source: 'contract_flow',
  });
  const pay = event({
    id: 'p',
    action: 'payment_received',
    title: 'Pagamento recebido',
    created_at: '2026-08-11T11:00:00.000Z',
    source: 'finance_flow',
  });

  assert(classifyLotHistoryFilter(sold) === 'comercial', 'venda → comercial');
  assert(classifyLotHistoryFilter(reserved) === 'comercial', 'reserva → comercial');
  assert(classifyLotHistoryFilter(front) === 'gis', 'frente → gis');
  assert(classifyLotHistoryFilter(auto) === 'gis', 'confrontação auto → gis');
  assert(classifyLotHistoryFilter(value) === 'gis', 'valor → gis');
  assert(classifyLotHistoryFilter(created) === 'gis', 'lote criado → gis');
  assert(classifyLotHistoryFilter(viewed) === 'contrato', 'visualização → contrato');
  assert(classifyLotHistoryFilter(pay) === 'financeiro', 'pagamento → financeiro');

  const all = [sold, reserved, front, auto, value, created, viewed, pay];
  const chips = listLotHistoryFilterChips(all);
  assert(chips[0].id === 'all', 'Todos primeiro');
  assert(chips.some((c) => c.id === 'comercial'), 'chip Comercial');
  assert(chips.some((c) => c.id === 'gis'), 'chip GIS');
  assert(chips.some((c) => c.id === 'contrato'), 'chip Contrato');
  assert(chips.some((c) => c.id === 'financeiro'), 'chip Financeiro');

  const onlyGis = listLotHistoryFilterChips([front, created]);
  assert(onlyGis.some((c) => c.id === 'gis'), 'GIS presente');
  assert(!onlyGis.some((c) => c.id === 'financeiro'), 'sem financeiro inventado');

  const comercial = filterLotHistoryEvents(all, 'comercial', '');
  assert(comercial.every((e) => classifyLotHistoryFilter(e) === 'comercial'), 'filtro comercial em memória');
  assert(comercial.some((e) => e.action === 'sold'), 'mantém venda');
  assert(comercial.some((e) => e.action === 'reserved'), 'mantém reserva');

  const search = filterLotHistoryEvents(all, 'all', 'rua 02');
  assert(search.length === 1 && search[0].id === 'f', 'busca local por descrição');
  console.log('OK testClassificationAndFilters');
}

function testGroupByDateNewestFirst() {
  const events: FormattedLotAuditEvent[] = [
    event({
      id: '1',
      action: 'front_corrected',
      title: 'Frente corrigida',
      created_at: '2026-08-24T12:37:00.000Z',
      source: 'gis_map',
    }),
    event({
      id: '2',
      action: 'sold',
      title: 'Venda concluída',
      created_at: '2026-08-21T22:50:00.000Z',
      source: 'sale_flow',
    }),
    event({
      id: '3',
      action: 'value_changed',
      title: 'Valor do lote alterado',
      created_at: '2026-08-21T22:49:00.000Z',
      source: 'gis_map',
    }),
    event({
      id: '4',
      action: 'lot_created',
      title: 'Lote criado',
      created_at: '2026-08-12T10:00:00.000Z',
      source: 'gis_map',
    }),
  ];
  const groups = groupLotHistoryByDate(events);
  assert(groups.length === 3, '3 dias');
  assert(groups[0].dateKey === lotHistoryDateKey(events[0].createdAt), 'dia mais recente primeiro');
  assert(groups[1].events.map((e) => e.id).join(',') === '2,3', 'mesmo dia preserva ordem');
  assert(groups[2].events[0].action === 'lot_created', 'lote criado no dia mais antigo do recorte');
  console.log('OK testGroupByDateNewestFirst');
}

function testEmptyFewManyAndCount() {
  assert(formatLotHistoryEventCount(0) === '0 eventos', 'zero');
  assert(formatLotHistoryEventCount(1) === '1 evento', 'singular');
  assert(formatLotHistoryEventCount(18) === '18 eventos', 'plural');
  const many = Array.from({ length: 40 }, (_, i) =>
    event({
      id: `n${i}`,
      action: i % 2 ? 'sold' : 'value_changed',
      title: i % 2 ? 'Venda concluída' : 'Valor do lote alterado',
      created_at: `2026-08-${String(24 - (i % 10)).padStart(2, '0')}T10:00:00.000Z`,
      source: i % 2 ? 'sale_flow' : 'gis_map',
    }),
  );
  const groups = groupLotHistoryByDate(many);
  assert(groups.length >= 2, 'muitos eventos agrupam por dia');
  assert(filterLotHistoryEvents([], 'all', '').length === 0, 'nenhum evento');
  console.log('OK testEmptyFewManyAndCount');
}

function testBadgesAndTechnicalDetails() {
  const sold = event({
    id: 's',
    action: 'sold',
    title: 'Venda concluída',
    created_at: '2026-08-21T22:50:00.000Z',
    source: 'sale_flow',
  });
  const front = event({
    id: 'f',
    action: 'front_corrected',
    title: 'Frente corrigida',
    created_at: '2026-08-24T12:37:00.000Z',
    source: 'gis_map',
  });
  const identified = event({
    id: 'i',
    action: 'front_identified',
    title: 'Frente identificada',
    created_at: '2026-08-02T12:00:00.000Z',
    source: 'gis_map',
  });
  const auto = event({
    id: 'a',
    action: 'confrontation_auto',
    title: 'Confrontação automática',
    created_at: '2026-08-03T12:00:00.000Z',
    source: 'gis_map',
  });
  const value = event({
    id: 'v',
    action: 'value_changed',
    title: 'Valor do lote alterado',
    created_at: '2026-08-04T12:00:00.000Z',
    source: 'gis_map',
  });
  const created = event({
    id: 'c',
    action: 'lot_created',
    title: 'Lote criado',
    created_at: '2026-08-01T12:00:00.000Z',
    source: 'gis_map',
  });
  const viewed = event({
    id: 'w',
    action: 'contract_viewed',
    title: 'Contrato visualizado',
    created_at: '2026-08-05T12:00:00.000Z',
    source: 'contract_flow',
  });

  assert(sold.actionLabel === 'Venda', 'badge Venda');
  assert(front.actionLabel === 'Frente corrigida', 'badge Frente corrigida');
  assert(identified.actionLabel === 'Frente identificada', 'badge Frente identificada');
  assert(auto.actionLabel === 'Confrontação automática', 'badge Confrontação automática');
  assert(value.actionLabel === 'Valor alterado', 'badge Valor alterado');
  assert(created.actionLabel === 'Lote criado', 'badge Lote criado');
  assert(viewed.actionLabel === 'Visualização', 'badge Visualização');

  const split = splitLotHistoryDescription(
    `Lote vinculado ao contrato aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`,
  );
  assert(split.hasTechnical, 'UUID vira detalhe técnico');
  assert(!split.preview.includes('aaaaaaaa-bbbb'), 'preview sem UUID');
  assert(split.full.includes('aaaaaaaa-bbbb'), 'fonte completa preservada');

  assert(resolveLotHistoryActor(null, {}) === null, 'sem usuário inventado');
  assert(
    resolveLotHistoryActor('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', {
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee': 'aaaaaaaa',
    }) === null,
    'não mostra UUID truncado',
  );
  assert(
    resolveLotHistoryActor('u1', { u1: 'Admin' }) === 'Admin',
    'mostra nome real',
  );
  console.log('OK testBadgesAndTechnicalDetails');
}

function testPanelWiringAndSingleScroll() {
  const gis = read('components/map/GISMap.tsx');
  const panel = read('components/map/LotHistoryPanel.tsx');
  const css = read('app/globals.css');
  const layout = read('lib/gisLotPopupLayout.ts');

  assert(gis.includes('LotHistoryPanel'), 'GISMap usa o painel de histórico');
  assert(gis.includes('popupTab === "historico"'), 'aba Histórico');
  assert(gis.includes('getLotAuditHistory(supabase, lot.id, 50)'), 'mesma carga de eventos');
  assert(gis.includes('setPopupTab(tab.id)'), 'troca de abas intacta');
  assert(gis.includes('label: "Resumo"'), 'aba Resumo');
  assert(gis.includes('label: "Confrontações"'), 'aba Confrontações');
  assert(gis.includes('label: "Comercial"'), 'aba Comercial');
  assert(gis.includes('label: "Histórico"'), 'aba Histórico');
  assert(
    gis.includes('popupTab === "confrontacoes" || popupTab === "historico"'),
    'histórico preenche o corpo como Confrontações',
  );
  assert(!gis.includes('max-h-56 md:max-h-64'), 'remove altura estreita antiga');
  assert(panel.includes('Histórico do lote'), 'header da aba');
  assert(panel.includes('Nenhum evento registrado para este lote.'), 'estado vazio');
  assert(panel.includes('gis-lot-history-scroll'), 'scroll único da área');
  assert(panel.includes('Ver detalhes') || panel.includes('Ver mais'), 'expansão de detalhes');
  assert(panel.includes('Ver documento'), 'link Ver documento no histórico');
  assert(panel.includes('Visualizar documento assinado'), 'histórico assinado visualizar');
  assert(panel.includes('Baixar PDF assinado'), 'histórico assinado baixar');
  assert(panel.includes('lotHistoryTerminationDocumentLinks'), 'reusa sale_id do evento');
  assert(panel.includes('lotHistoryTerminationSaleIds'), 'sale_ids do histórico vêm dos eventos');
  assert(panel.includes('terminationDocumentMetaHref'), 'meta do termo por sale_id');
  assert(!panel.includes('lot.saleId'), 'histórico não usa blocks.sale_id do lote');
  assert(!panel.includes('blocks.sale_id'), 'histórico não lê blocks.sale_id');
  assert(panel.includes('lotHistoryImprovementsLine'), 'benfeitorias no detalhe sem poluir o título');
  assert(panel.includes('formatLotAuditDescription'), 'reusa formatter de descrição');
  assert(!panel.includes("from('lot_audit_logs')"), 'painel não consulta o banco');
  assert(css.includes('gis-lot-history'), 'CSS do workspace');
  assert(css.includes('1920x1080'), 'homolog 1920x1080');
  assert(css.includes('1366x768'), 'homolog 1366x768');
  assert(css.includes('-webkit-line-clamp: 3'), 'descrição longa em 3 linhas');
  assert(layout.includes('max-h-[min(82vh,720px)]'), 'popup não vira fullscreen');
  console.log('OK testPanelWiringAndSingleScroll');
}

function testTerminationDocumentLinkUsesSameSale() {
  const withTerm = lotHistoryTerminationDocumentLinks({
    action: 'sale_cancelled',
    saleId: 'sale-homolog',
    motiveCode: 'desistencia',
  });
  assert(Boolean(withTerm), 'desistência no histórico tem link');
  assert(withTerm?.saleId === 'sale-homolog', 'sale_id do evento');
  assert(withTerm?.signed === false, 'sem artefato ainda não marca assinado');
  assert(
    Boolean(withTerm?.viewHref.includes('/sales/sale-homolog/termination-document')),
    'visualizar usa a mesma API do modal',
  );
  assert(
    Boolean(withTerm?.pdfHref.endsWith('/termination-document/pdf')),
    'PDF usa a mesma API do modal',
  );
  assert(
    Boolean(withTerm?.signedPdfHref.endsWith('/termination-document/signed-pdf')),
    'PDF assinado usa a rota existente',
  );
  assert(
    Boolean(withTerm?.signedPdfDownloadHref.includes('download=1')),
    'download assinado reusa signed-pdf',
  );
  const signedLinks = lotHistoryTerminationDocumentLinks(
    {
      action: 'sale_cancelled',
      saleId: 'sale-homolog',
      motiveCode: 'desistencia',
    },
    { signed: true },
  );
  assert(signedLinks?.signed === true, 'flag assinado');
  assert(
    lotHistoryTerminationSaleIds([
      {
        action: 'sale_cancelled',
        saleId: 'sale-homolog',
        motiveCode: 'desistencia',
      },
      {
        action: 'sold',
        saleId: 'sale-other',
        motiveCode: 'desistencia',
      },
    ]).join(',') === 'sale-homolog',
    'coleta só o sale_id da desistência no evento',
  );
  const formatted = formatLotAuditEvent({
    id: 'e-imp',
    company_id: null,
    project_id: 'p1',
    block_id: 'b1',
    lot_id: 'b1',
    sale_id: 'sale-homolog',
    contract_id: null,
    user_id: 'u1',
    action: 'sale_cancelled',
    title: 'Lote liberado — venda encerrada',
    description: 'Desistência do cliente · Vendido → Disponível',
    old_data: null,
    new_data: { motiveCode: 'desistencia', improvementsTotal: 20000 },
    created_at: '2026-08-25T12:00:00Z',
    source: 'gis_map',
  });
  assert(formatted.title === 'Lote liberado — venda encerrada', 'título intacto');
  const impLine = lotHistoryImprovementsLine(formatted) || '';
  assert(impLine.includes('Benfeitorias reconhecidas'), 'detalhe de benfeitorias no evento');
  assert(impLine.includes('20.000'), 'valor reconhecido no detalhe');
  assert(
    lotHistoryTerminationDocumentLinks({
      action: 'sale_cancelled',
      saleId: 'sale-homolog',
      motiveCode: 'erro_cadastro',
    }) === null,
    'erro_cadastro não gera termo nesta fase',
  );
  assert(
    lotHistoryTerminationDocumentLinks({
      action: 'sold',
      saleId: 'sale-homolog',
      motiveCode: 'desistencia',
    }) === null,
    'venda concluída sem link de termo',
  );
  console.log('OK testTerminationDocumentLinkUsesSameSale');
}

function testAuditAndPopupUnchanged() {
  const audit = read('lib/lotAudit.ts');
  const gis = read('components/map/GISMap.tsx');
  const pres = read('lib/lotHistoryPresentation.ts');
  assert(audit.includes("from('lot_audit_logs')"), 'tabela de auditoria intacta');
  assert(audit.includes(".order('created_at', { ascending: false })"), 'ordenação original');
  assert(audit.includes('logLotAuditEvent'), 'gravação intacta');
  assert(gis.includes('logLotAuditEvent'), 'GIS ainda registra auditoria');
  assert(!pres.includes('supabase'), 'apresentação sem cliente de banco');
  assert(!pres.includes('create table'), 'sem SQL');
  assert(!pres.includes('aezktedncttwpqeunjej'), 'não aponta Production');
  console.log('OK testAuditAndPopupUnchanged');
}

function run() {
  testClassificationAndFilters();
  testGroupByDateNewestFirst();
  testEmptyFewManyAndCount();
  testBadgesAndTechnicalDetails();
  testPanelWiringAndSingleScroll();
  testTerminationDocumentLinkUsesSameSale();
  testAuditAndPopupUnchanged();
  console.log('OK — mandatory-gis-lot-history-workspace-tests passed');
}

run();
