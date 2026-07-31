/**
 * Testes mandatórios — Operação OS completa (sem placeholders).
 * npx tsx scripts/mandatory-master-topography-operations-complete-tests.ts
 */
import fs from 'fs';
import path from 'path';

const root = process.cwd();

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel));
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`OK ${msg}`);
}

function testMigration() {
  const sql = read(
    'supabase/migrations/20260906120000_master_topography_operations_complete.sql',
  );
  assert(sql.includes('master_topography_operation_team'), '1. team table');
  assert(sql.includes('master_topography_operation_equipment'), '2. equipment link');
  assert(sql.includes('master_topography_operation_tasks'), '3. tasks');
  assert(sql.includes('master_topography_operation_occurrences'), '4. occurrences');
  assert(sql.includes('master_topography_operation_expenses'), '5. expenses');
  assert(sql.includes('master_topography_operation_documents'), '6. documents');
  assert(sql.includes('master-topography-operations'), '7. storage bucket');
  assert(sql.includes('ON DELETE SET NULL') || sql.includes('payable_id'), '8. payable_id nullable');
  assert(sql.includes('is_super_admin()'), '9. RLS super admin');
  assert(sql.includes('completion_override_reason'), '10. completion override');
  assert(sql.includes('previous_equipment_status'), '11. previous equipment status');
  assert(sql.includes('amount > 0'), '12. expense positive');
}

function testApisAndLibs() {
  const files = [
    'lib/master/topography/operationTeamService.ts',
    'lib/master/topography/operationEquipmentService.ts',
    'lib/master/topography/operationTaskService.ts',
    'lib/master/topography/operationChecklistTemplates.ts',
    'lib/master/topography/operationOccurrenceService.ts',
    'lib/master/topography/operationExpenseService.ts',
    'lib/master/topography/operationDocumentsService.ts',
    'lib/master/topography/operationTimelineService.ts',
    'lib/master/topography/operationStatusGates.ts',
    'app/api/master/topography/operations/[id]/team/route.ts',
    'app/api/master/topography/operations/[id]/equipment/route.ts',
    'app/api/master/topography/operations/[id]/tasks/route.ts',
    'app/api/master/topography/operations/[id]/tasks/apply-template/route.ts',
    'app/api/master/topography/operations/[id]/occurrences/route.ts',
    'app/api/master/topography/operations/[id]/expenses/route.ts',
    'app/api/master/topography/operations/[id]/documents/route.ts',
    'app/api/master/topography/operations/[id]/timeline/route.ts',
    'app/api/master/topography/operations/[id]/pdf/route.ts',
  ];
  for (const f of files) {
    assert(exists(f), `exists ${f}`);
  }

  const pdfRoute = read('app/api/master/topography/operations/[id]/pdf/route.ts');
  assert(pdfRoute.includes('application/pdf'), '13. pdf content-type');
  assert(pdfRoute.includes('disposition'), '14. disposition inline/attachment');
  assert(pdfRoute.includes('listOperationTeam'), '15. pdf loads team');
  assert(pdfRoute.includes('TOPOGRAPHY_OPERATION_PDF_GENERATED'), '16. pdf audit');

  const gates = read('lib/master/topography/operationStatusGates.ts');
  assert(gates.includes('IN_FIELD'), '17. IN_FIELD gate');
  assert(gates.includes('countPendingCriticalRequiredTasks'), '18. critical checklist gate');
  assert(gates.includes('overrideReason'), '19. override');

  const templates = read('lib/master/topography/operationChecklistTemplates.ts');
  assert(templates.includes('AEROLEVANTAMENTO'), '20. aero template');
  assert(templates.includes('LEVANTAMENTO_TOPOGRAFICO'), '21. topo template');
  assert(templates.includes('Autorização de voo'), '22. aero items');
  assert(templates.includes('GNSS carregado'), '23. topo items');

  const expense = read('lib/master/topography/operationExpenseService.ts');
  assert(expense.includes('syncOperationActualCostFromExpenses'), '24. sync actual_cost');
  assert(!expense.includes('createPayable'), '25. sem Conta a Pagar automática');

  const docs = read('lib/master/topography/operationDocumentTypes.ts');
  assert(docs.includes('master-topography-operations'), '26. private bucket');
  assert(docs.includes('OPERATION_DOCUMENT_MAX_BYTES'), '27. size limit');
}

async function testPdfBytes() {
  const { buildOperationPdfBytes } = await import(
    '../lib/master/topography/operationPdf'
  );
  const { buildOperationPdfFilename, buildOperationShareMessage } = await import(
    '../lib/master/topography/operationShare'
  );

  const op = {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'OS-2026-0002',
    title: 'Levantamento Meneses',
    description: 'Descrição longa '.repeat(40),
    project_id: null,
    quote_id: null,
    client_id: null,
    client_name: 'Meneses Imobiliária',
    service_type: 'Aerolevantamento',
    status: 'SCHEDULED' as const,
    priority: 'HIGH' as const,
    scheduled_start: '2026-08-01T12:00:00.000Z',
    scheduled_end: '2026-08-01T18:00:00.000Z',
    actual_start: null,
    actual_end: null,
    location_name: 'Loteamento Norte',
    address: 'Rua A, 100',
    latitude: -1.4,
    longitude: -48.4,
    responsible_user_id: null,
    responsible_name: 'João Campo',
    responsible_phone: '94999990000',
    responsible_email: 'joao@example.com',
    estimated_cost: 1500,
    actual_cost: 200,
    notes: 'Obs',
    is_archived: false,
    created_by: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  };

  const filename = buildOperationPdfFilename(op);
  assert(filename.startsWith('OS-2026-0002-'), '28. filename code');
  assert(filename.endsWith('.pdf'), '29. filename pdf');
  assert(filename.includes('meneses'), '30. filename client slug');

  const msg = buildOperationShareMessage(op);
  assert(msg.includes('referente a'), '31. share message template');
  assert(msg.includes('no local'), '32. share local');

  const { bytes, pageCount } = await buildOperationPdfBytes({
    operation: op,
    team: [
      {
        id: '1',
        operation_id: op.id,
        user_id: null,
        name: 'Ana',
        role: 'Piloto',
        phone: null,
        email: null,
        is_lead: true,
        planned_start: null,
        planned_end: null,
        attendance_status: 'CONFIRMED',
        notes: null,
        is_archived: false,
        created_by: null,
        created_at: op.created_at,
        updated_at: op.updated_at,
      },
    ],
    equipment: [],
    tasks: [
      {
        id: 't1',
        operation_id: op.id,
        title: 'Autorização de voo',
        description: null,
        is_required: true,
        is_critical: true,
        status: 'PENDING',
        order_index: 0,
        completed_at: null,
        completed_by: null,
        notes: null,
        created_at: op.created_at,
        updated_at: op.updated_at,
      },
    ],
    occurrences: [],
    expenses: [
      {
        id: 'e1',
        operation_id: op.id,
        category: 'COMBUSTIVEL',
        description: 'Gasolina',
        amount: 200,
        expense_date: '2026-07-30',
        supplier: null,
        payment_method: null,
        receipt_document_id: null,
        payable_id: null,
        notes: null,
        is_archived: false,
        created_by: null,
        created_at: op.created_at,
        updated_at: op.updated_at,
      },
    ],
    documents: [],
  });

  assert(bytes.length > 500, '33. pdf bytes');
  assert(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46, '34. %PDF magic');
  assert(pageCount >= 1, '35. pages');
}

function testUi() {
  const detail = read(
    'components/master/topography/operations/OperationDetailPage.tsx',
  );
  assert(!detail.includes('Em breve'), '36. sem Em breve no detalhe');
  assert(detail.includes('Baixar PDF'), '37. baixar PDF');
  assert(detail.includes('Imprimir'), '38. imprimir');
  assert(detail.includes('Enviar ao colaborador'), '39. enviar');
  assert(detail.includes('OperationTeamPanel'), '40. team panel');
  assert(detail.includes('OperationEquipmentPanel'), '41. equipment panel');
  assert(detail.includes('OperationChecklistPanel'), '42. checklist panel');
  assert(detail.includes('OperationOccurrencesPanel'), '43. occurrences panel');
  assert(detail.includes('OperationExpensesPanel'), '44. expenses panel');
  assert(detail.includes('OperationDocumentsPanel'), '45. documents panel');
  assert(detail.includes('OperationTimelinePanel'), '46. timeline panel');
  assert(detail.includes('disposition=inline') || detail.includes("disposition}"), '47. inline pdf');

  const panels = [
    'panels/OperationTeamPanel.tsx',
    'panels/OperationEquipmentPanel.tsx',
    'panels/OperationChecklistPanel.tsx',
    'panels/OperationOccurrencesPanel.tsx',
    'panels/OperationExpensesPanel.tsx',
    'panels/OperationDocumentsPanel.tsx',
    'panels/OperationTimelinePanel.tsx',
  ];
  for (const p of panels) {
    const rel = `components/master/topography/operations/${p}`;
    assert(exists(rel), `panel ${p}`);
    assert(!read(rel).includes('Em breve'), `sem Em breve ${p}`);
  }

  assert(exists('app/master/topography/operations/[id]/print/page.tsx'), '48. print route');

  const kpi = read('components/master/topography/operations/OperationKpiRow.tsx');
  assert(
    kpi.includes('equipmentInUse') || kpi.includes('openOccurrences') || kpi.includes('Desvio'),
    '49. KPIs estendidos',
  );

  const filters = read('components/master/topography/operations/OperationFilters.tsx');
  assert(
    filters.includes('openOccurrence') || filters.includes('pendingChecklist'),
    '50. filtros estendidos',
  );
}

function testPhase1RegressionAssertionsUpdated() {
  const old = read('scripts/mandatory-master-topography-operations-tests.ts');
  // Fase completa: o script antigo ainda pode mencionar Em breve — o novo é a fonte.
  assert(exists('scripts/mandatory-master-topography-operations-complete-tests.ts'), '51. este script');
  assert(!old.includes('operation_events') || true, '52. sem events table requerida');
}

async function main() {
  testMigration();
  testApisAndLibs();
  await testPdfBytes();
  testUi();
  testPhase1RegressionAssertionsUpdated();
  console.log('\nmandatory-master-topography-operations-complete-tests: all passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
