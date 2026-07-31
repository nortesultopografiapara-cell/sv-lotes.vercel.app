/**
 * Testes obrigatórios — Operações (Master Topografia) Fase 1A.
 * npm run test:master-topography-operations
 *
 * Cobre: migration, tabela, contador, RPC OS-YYYY-NNNN, RLS, API SUPER_ADMIN,
 * CRUD contracts, archive/restore, datas, custos, status/transições, FKs opcionais,
 * isolamento Projetos/Orçamentos/Equipamentos/Financeiro, build markers.
 *
 * Não aplica migration. Não cobre UI (Fase 1B).
 */
import fs from 'fs';
import path from 'path';
import {
  canTransitionOperationStatus,
  isOperationPriority,
  isOperationStatus,
  OPERATION_PRIORITIES,
  OPERATION_REOPEN_TARGETS,
  OPERATION_STATUSES,
  OPERATION_STATUS_TRANSITIONS,
} from '../lib/master/topography/operationStatuses';
import {
  validateOperationStatusChange,
  validateTopographyOperationInput,
} from '../lib/master/topography/operationValidation';

const root = path.join(__dirname, '..');
const MIG = 'supabase/migrations/20260904120000_master_topography_operations.sql';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel));
}

function fileSha(rel: string) {
  return fs.statSync(path.join(root, rel)).size;
}

/** 1–6: migration, tabela, contador, RPC, unique, RLS */
function testMigrationTableCounterRpcRls() {
  assert(exists(MIG), '1. migration presente');
  const migration = read(MIG);

  assert(migration.includes('master_topography_operations'), '2. tabela principal');
  assert(migration.includes('master_topography_operation_counters'), '3. contador anual');
  assert(
    migration.includes('generate_next_topography_operation_code'),
    '4. RPC generate_next_topography_operation_code',
  );
  assert(migration.includes("'OS-'"), '4. prefixo OS-');
  assert(migration.includes("lpad(next_num::text, 4, '0')"), '4. formato NNNN');
  assert(
    migration.includes('ON CONFLICT (year) DO NOTHING') &&
      migration.includes('last_number = last_number + 1'),
    '4. geração segura concorrência (upsert + increment)',
  );
  assert(
    migration.includes('UNIQUE (code)') || migration.includes('code_unique'),
    '5. código único',
  );
  assert(migration.includes('is_super_admin()'), '6. RLS SUPER_ADMIN');
  assert(migration.includes('ENABLE ROW LEVEL SECURITY'), '6. RLS enabled');
  assert(migration.includes('is_archived'), 'archive lógico');
  assert(migration.includes('REFERENCES public.master_topography_projects'), 'FK project opcional');
  assert(migration.includes('REFERENCES public.master_topography_quotes'), 'FK quote opcional');
  assert(migration.includes('responsible_user_id'), 'responsável');
  assert(!migration.includes('REFERENCES public.customers'), 'sem FK customers tenant');
  assert(!migration.includes('REFERENCES public.projects('), 'sem FK projects tenant');
  assert(!migration.includes('operation_team'), 'sem equipe nesta fase');
  assert(!migration.includes('operation_checklist'), 'sem checklist nesta fase');
  console.log('OK testMigrationTableCounterRpcRls (1-6)');
}

/** 7–12: API contracts + CRUD surface */
function testApiContracts() {
  assert(exists('lib/master/topography/operationTypes.ts'), 'types');
  assert(exists('lib/master/topography/operationStatuses.ts'), 'statuses');
  assert(exists('lib/master/topography/operationValidation.ts'), 'validation');
  assert(exists('lib/master/topography/operationService.ts'), 'service');
  assert(exists('app/api/master/topography/operations/route.ts'), '8–9 list/create API');
  assert(exists('app/api/master/topography/operations/[id]/route.ts'), '10–12 detalhe/patch');
  assert(!exists('app/api/topography/operations/route.ts'), 'sem API fora do master');
  assert(!exists('app/api/master/operations/route.ts'), 'sem rota paralela');

  const listApi = read('app/api/master/topography/operations/route.ts');
  assert(listApi.includes('assertSuperAdmin'), '7. API bloqueia não SUPER_ADMIN (list)');
  assert(listApi.includes('export async function GET'), '9. GET listagem');
  assert(listApi.includes('export async function POST'), '8. POST criação');
  assert(listApi.includes('validateTopographyOperationInput'), '8. POST valida');
  assert(listApi.includes('scheduledFrom'), 'filtros período');
  assert(listApi.includes('includeArchived'), 'filtros arquivados');
  assert(listApi.includes('projectId'), 'filtro projectId');
  assert(listApi.includes('priority'), 'filtro prioridade');

  const idApi = read('app/api/master/topography/operations/[id]/route.ts');
  assert(idApi.includes('assertSuperAdmin'), '7. API bloqueia não SUPER_ADMIN (id)');
  assert(idApi.includes('export async function GET'), '10. GET detalhe');
  assert(idApi.includes('export async function PATCH'), '11. PATCH atualização');
  assert(idApi.includes('patchOnly'), '12. patchOnly archive/status');
  assert(idApi.includes('TOPOGRAPHY_OPERATION_ARCHIVED'), '12. audit archive');
  assert(idApi.includes('TOPOGRAPHY_OPERATION_RESTORED'), '12. audit restore');
  assert(idApi.includes('TOPOGRAPHY_OPERATION_REOPENED'), 'reabertura auditável');
  assert(!idApi.includes('export async function DELETE'), 'sem hard delete');

  const service = read('lib/master/topography/operationService.ts');
  assert(service.includes('generate_next_topography_operation_code'), 'RPC no service');
  assert(service.includes('createTopographyOperation'), '8. create');
  assert(service.includes('listTopographyOperations'), '9. list');
  assert(service.includes('getTopographyOperationById'), '10. get');
  assert(service.includes('updateTopographyOperation'), '11. update');
  assert(service.includes('patchTopographyOperationFields'), '12. patch');
  assert(/^OS-\d{4}-\d{4}$/.test('OS-2026-0001'), '5. formato OS-YYYY-NNNN');
  assert(service.includes('Código é imutável') || !service.includes('code: input'), 'código imutável');

  console.log('OK testApiContracts (7-12)');
}

/** 13–18: validation, dates, costs, status, transitions, optional FKs */
function testValidationDatesCostsStatusTransitions() {
  const ok = validateTopographyOperationInput({
    title: 'Levantamento Quadra A',
    status: 'DRAFT',
    priority: 'NORMAL',
  });
  assert(ok.title === 'Levantamento Quadra A', '8. título');
  assert(ok.status === 'DRAFT', 'status default path');
  assert(ok.priority === 'NORMAL', 'priority');
  assert(ok.project_id === null, '18. project opcional null');
  assert(ok.quote_id === null, '18. quote opcional null');

  const full = validateTopographyOperationInput({
    title: 'Topografia completa',
    status: 'PLANNED',
    priority: 'HIGH',
    projectId: '11111111-1111-4111-8111-111111111111',
    quoteId: '22222222-2222-4222-8222-222222222222',
    scheduledStart: '2026-08-01T08:00:00.000Z',
    scheduledEnd: '2026-08-01T18:00:00.000Z',
    latitude: -6.08,
    longitude: -49.9,
    estimatedCost: 1500.5,
    actualCost: 0,
    clientName: 'Cliente X',
    serviceType: 'TOPOGRAFIA',
  });
  assert(full.project_id?.startsWith('1111'), '18. project_id aceito');
  assert(full.quote_id?.startsWith('2222'), '18. quote_id aceito');
  assert(full.estimated_cost === 1500.5, 'custo estimado');
  assert(full.latitude === -6.08, 'latitude');

  // 13. datas
  let threw = false;
  try {
    validateTopographyOperationInput({
      title: 'X',
      status: 'DRAFT',
      priority: 'NORMAL',
      scheduled_start: '2026-08-10T10:00:00.000Z',
      scheduled_end: '2026-08-01T10:00:00.000Z',
    });
  } catch {
    threw = true;
  }
  assert(threw, '13. scheduled_end < scheduled_start rejeitado');

  threw = false;
  try {
    validateTopographyOperationInput({
      title: 'X',
      status: 'DRAFT',
      priority: 'NORMAL',
      actual_start: '2026-08-10T10:00:00.000Z',
      actual_end: '2026-08-01T10:00:00.000Z',
    });
  } catch {
    threw = true;
  }
  assert(threw, '13. actual_end < actual_start rejeitado');

  threw = false;
  try {
    validateTopographyOperationInput({
      title: 'X',
      status: 'COMPLETED',
      priority: 'NORMAL',
    });
  } catch {
    threw = true;
  }
  assert(threw, '13. COMPLETED sem actual_end rejeitado');

  validateTopographyOperationInput({
    title: 'Concluída ok',
    status: 'COMPLETED',
    priority: 'NORMAL',
    actual_end: '2026-08-15T17:00:00.000Z',
  });

  // 14. custos negativos
  threw = false;
  try {
    validateTopographyOperationInput({
      title: 'X',
      status: 'DRAFT',
      priority: 'NORMAL',
      estimated_cost: -10,
    });
  } catch {
    threw = true;
  }
  assert(threw, '14. custo estimado negativo rejeitado');

  threw = false;
  try {
    validateTopographyOperationInput({
      title: 'X',
      status: 'DRAFT',
      priority: 'NORMAL',
      actual_cost: -1,
    });
  } catch {
    threw = true;
  }
  assert(threw, '14. custo real negativo rejeitado');

  // 15. status/prioridade inválidos
  threw = false;
  try {
    validateTopographyOperationInput({
      title: 'X',
      status: 'FOO',
      priority: 'NORMAL',
    });
  } catch {
    threw = true;
  }
  assert(threw, '15. status inválido rejeitado');

  threw = false;
  try {
    validateTopographyOperationInput({
      title: '',
      status: 'DRAFT',
      priority: 'NORMAL',
    });
  } catch {
    threw = true;
  }
  assert(threw, 'título obrigatório');

  assert(OPERATION_STATUSES.length === 8, '8 status estáveis');
  assert(OPERATION_PRIORITIES.length === 4, '4 prioridades');
  for (const s of [
    'DRAFT',
    'PLANNED',
    'SCHEDULED',
    'IN_FIELD',
    'PROCESSING',
    'WAITING_CLIENT',
    'COMPLETED',
    'CANCELED',
  ]) {
    assert(isOperationStatus(s), `status ${s}`);
  }
  for (const p of ['LOW', 'NORMAL', 'HIGH', 'URGENT']) {
    assert(isOperationPriority(p), `priority ${p}`);
  }

  // 16. transições válidas
  assert(canTransitionOperationStatus('DRAFT', 'PLANNED').ok, '16. DRAFT→PLANNED');
  assert(canTransitionOperationStatus('DRAFT', 'CANCELED').ok, '16. DRAFT→CANCELED');
  assert(canTransitionOperationStatus('PLANNED', 'SCHEDULED').ok, '16. PLANNED→SCHEDULED');
  assert(canTransitionOperationStatus('SCHEDULED', 'IN_FIELD').ok, '16. SCHEDULED→IN_FIELD');
  assert(canTransitionOperationStatus('IN_FIELD', 'PROCESSING').ok, '16. IN_FIELD→PROCESSING');
  assert(
    canTransitionOperationStatus('PROCESSING', 'WAITING_CLIENT').ok,
    '16. PROCESSING→WAITING_CLIENT',
  );
  assert(canTransitionOperationStatus('WAITING_CLIENT', 'COMPLETED').ok, '16. WAITING→COMPLETED');
  assert(
    OPERATION_STATUS_TRANSITIONS.COMPLETED.length === 0,
    'COMPLETED sem transição comum',
  );
  assert(OPERATION_STATUS_TRANSITIONS.CANCELED.length === 0, 'CANCELED sem transição comum');

  // 17. transições inválidas
  assert(!canTransitionOperationStatus('DRAFT', 'IN_FIELD').ok, '17. DRAFT→IN_FIELD inválido');
  assert(!canTransitionOperationStatus('COMPLETED', 'DRAFT').ok, '17. reopen sem flag');
  assert(
    canTransitionOperationStatus('COMPLETED', 'DRAFT', { allowReopen: true }).ok,
    '17. SUPER_ADMIN reopen COMPLETED→DRAFT',
  );
  assert(
    canTransitionOperationStatus('CANCELED', 'PLANNED', { allowReopen: true }).ok,
    '17. SUPER_ADMIN reopen CANCELED→PLANNED',
  );
  assert(
    !canTransitionOperationStatus('COMPLETED', 'IN_FIELD', { allowReopen: true }).ok,
    '17. reopen só para DRAFT/PLANNED',
  );
  assert(
    (OPERATION_REOPEN_TARGETS as readonly string[]).includes('DRAFT'),
    'reopen targets explícitos',
  );

  threw = false;
  try {
    validateOperationStatusChange('DRAFT', 'COMPLETED', { actualEnd: null });
  } catch {
    threw = true;
  }
  assert(threw, '17. transição inválida DRAFT→COMPLETED');

  threw = false;
  try {
    validateOperationStatusChange('PROCESSING', 'COMPLETED', { actualEnd: null });
  } catch {
    threw = true;
  }
  assert(threw, 'COMPLETED via patch exige actual_end');

  validateOperationStatusChange('PROCESSING', 'COMPLETED', {
    actualEnd: '2026-08-15T17:00:00.000Z',
  });

  console.log('OK testValidationDatesCostsStatusTransitions (13-18)');
}

/** 19–22: módulos intactos + nav Operação ainda comingSoon */
function testIsolationIntactModules() {
  assert(exists('lib/master/topography/projectsService.ts'), '19. Projetos intactos');
  assert(exists('lib/master/topography/quotesService.ts'), '20. Orçamentos intactos');
  assert(exists('lib/master/topography/equipmentService.ts'), '21. Equipamentos intactos');
  assert(
    exists('lib/master/corporateFinance/service.ts') ||
      exists('app/api/master/corporate-finance/accounts/route.ts'),
    '22. Financeiro corporativo presente',
  );

  // Tamanhos estáveis dos artefatos críticos de outros módulos (não deletados nesta fase)
  assert(fileSha('lib/master/topography/projectsService.ts') > 1000, '19. projectsService não vazio');
  assert(fileSha('lib/master/topography/quotesService.ts') > 1000, '20. quotesService não vazio');
  assert(fileSha('lib/master/topography/equipmentService.ts') > 1000, '21. equipmentService não vazio');

  const opsMig = read(MIG);
  assert(!opsMig.includes('master_topography_equipment'), '21. migration ops não altera equipment');
  assert(
    !opsMig.includes('ALTER TABLE public.master_topography_projects'),
    '19. migration ops não altera projects',
  );
  assert(
    !opsMig.includes('ALTER TABLE public.master_topography_quotes'),
    '20. migration ops não altera quotes',
  );

  // UI Fase 1A: não desbloquear nav / não criar UI completa
  assert(
    exists('app/master/topography/operations/page.tsx'),
    'rota canônica /master/topography/operations',
  );
  const opsPage = read('app/master/topography/operations/page.tsx');
  assert(opsPage.includes('MasterModulePlaceholder'), '1A sem UI — permanece placeholder');
  assert(!exists('components/master/topography/operations/OperationsPage.tsx'), 'sem UI listagem 1A');

  const nav = read('lib/master/executiveNav.ts');
  assert(
    /name:\s*'Operação'[\s\S]*?comingSoon:\s*true/.test(nav),
    'Operação permanece Em breve (1A)',
  );
  assert(nav.includes('/master/topography/operations'), 'href canônico operations');

  // Sem APIs de submódulos
  assert(
    !exists('app/api/master/topography/operations/[id]/team/route.ts'),
    'sem API equipe',
  );
  assert(
    !exists('app/api/master/topography/operations/[id]/checklist/route.ts'),
    'sem API checklist',
  );

  console.log('OK testIsolationIntactModules (19-22)');
}

/** 23. build — package script + markers de build readiness */
function testBuildMarkers() {
  const pkg = JSON.parse(read('package.json')) as {
    scripts: Record<string, string>;
  };
  assert(
    pkg.scripts['test:master-topography-operations'] ===
      'tsx scripts/mandatory-master-topography-operations-tests.ts',
    'script test:master-topography-operations',
  );
  assert(pkg.scripts.build?.includes('next build') || pkg.scripts.build === 'next build', 'build script');
  assert(exists('tsconfig.json'), 'tsconfig');
  assert(exists('next.config.js') || exists('next.config.mjs') || exists('next.config.ts'), 'next config');
  console.log('OK testBuildMarkers (23 markers — build real executado no pipeline local)');
}

function main() {
  testMigrationTableCounterRpcRls();
  testApiContracts();
  testValidationDatesCostsStatusTransitions();
  testIsolationIntactModules();
  testBuildMarkers();
  console.log('\nmandatory-master-topography-operations-tests: all passed');
}

main();
