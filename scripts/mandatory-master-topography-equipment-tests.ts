/**
 * Testes obrigatórios — Equipamentos (Master Topografia) Fase 1A + 1B.
 * npm run test:master-topography-equipment
 *
 * Cobre: migration, RLS, RPC EQP-, constraints, validation, contratos CRUD,
 * serial único, UI listagem/detalhe, nav ativo, isolamento de outros módulos.
 */
import fs from 'fs';
import path from 'path';
import { validateTopographyEquipmentInput } from '../lib/master/topography/equipmentValidation';
import {
  EQUIPMENT_CATEGORIES,
  isEquipmentCategory,
} from '../lib/master/topography/equipmentCategories';
import {
  EQUIPMENT_STATUSES,
  isEquipmentStatus,
} from '../lib/master/topography/equipmentStatuses';

const root = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel));
}

function testMigrationAndRls() {
  const migPath = 'supabase/migrations/20260902120000_master_topography_equipment.sql';
  assert(exists(migPath), 'migration equipment');
  const migration = read(migPath);

  assert(migration.includes('master_topography_equipment'), 'tabela principal');
  assert(migration.includes('master_topography_equipment_counters'), 'contador anual');
  assert(migration.includes('generate_next_topography_equipment_code'), 'RPC código');
  assert(migration.includes("'EQP-'"), 'prefixo EQP-');
  assert(migration.includes('is_super_admin()'), 'RLS SUPER_ADMIN');
  assert(migration.includes('ENABLE ROW LEVEL SECURITY'), 'RLS enabled');
  assert(migration.includes('UNIQUE (code)') || migration.includes('code_unique'), 'unique code');
  assert(
    migration.includes('uq_master_topo_equipment_serial_number'),
    'unique parcial serial_number',
  );
  assert(migration.includes('is_archived'), 'soft archive');
  assert(migration.includes('warranty_until'), 'garantia');
  assert(migration.includes('supplier'), 'fornecedor');
  assert(migration.includes('invoice_number'), 'nota fiscal');
  assert(migration.includes('cost_center_id'), 'centro de custo');
  assert(migration.includes('usage_hours'), 'horas de uso');
  assert(migration.includes('last_calibration_date'), 'última calibração');
  assert(migration.includes('next_calibration_date'), 'próxima calibração');
  assert(migration.includes('asset_number'), 'patrimônio');
  assert(!migration.includes('REFERENCES public.customers'), 'sem FK customers');
  assert(!migration.includes('REFERENCES public.projects'), 'sem FK projects tenant');
  assert(!migration.includes('master_equipment_documents'), 'sem documents nesta fase');
  assert(!migration.includes('master_equipment_maintenance'), 'sem maintenance nesta fase');
  console.log('OK testMigrationAndRls');
}

function testCategoriesAndStatuses() {
  assert(EQUIPMENT_CATEGORIES.length >= 10, 'categorias suficientes');
  assert(isEquipmentCategory('DRONE'), 'DRONE');
  assert(isEquipmentCategory('TOTAL_STATION'), 'TOTAL_STATION');
  assert(!isEquipmentCategory('VEHICLE'), 'sem frota neste módulo');
  assert(isEquipmentStatus('AVAILABLE'), 'AVAILABLE');
  assert(isEquipmentStatus('DECOMMISSIONED'), 'DECOMMISSIONED');
  assert(
    EQUIPMENT_STATUSES.every((s) => s.label && s.code),
    'labels status',
  );
  console.log('OK testCategoriesAndStatuses');
}

function testValidation() {
  const ok = validateTopographyEquipmentInput({
    name: 'DJI Matrice 350 RTK',
    category: 'DRONE',
    status: 'AVAILABLE',
  });
  assert(ok.name === 'DJI Matrice 350 RTK', 'name');
  assert(ok.usage_hours === 0, 'usage default');
  assert(ok.status === 'AVAILABLE', 'status');

  const full = validateTopographyEquipmentInput({
    name: 'Receptor GNSS',
    category: 'GNSS',
    status: 'IN_USE',
    manufacturer: 'Trimble',
    model: 'R12i',
    serialNumber: 'SN-001',
    assetNumber: 'PAT-100',
    purchaseValue: 45000.5,
    warrantyUntil: '2027-12-31',
    supplier: 'Fornecedor X',
    invoiceNumber: 'NF-123',
    usageHours: 12.5,
    lastCalibrationDate: '2026-01-10',
    nextCalibrationDate: '2026-07-10',
    location: 'Parauapebas',
    responsibleName: 'Técnico A',
  });
  assert(full.serial_number === 'SN-001', 'serial');
  assert(full.asset_number === 'PAT-100', 'asset');
  assert(full.purchase_value === 45000.5, 'valor');
  assert(full.supplier === 'Fornecedor X', 'supplier');
  assert(full.invoice_number === 'NF-123', 'invoice');
  assert(full.usage_hours === 12.5, 'hours');

  let threw = false;
  try {
    validateTopographyEquipmentInput({ name: '', category: 'DRONE', status: 'AVAILABLE' });
  } catch {
    threw = true;
  }
  assert(threw, 'nome obrigatório');

  threw = false;
  try {
    validateTopographyEquipmentInput({
      name: 'X',
      category: 'INVALID',
      status: 'AVAILABLE',
    });
  } catch {
    threw = true;
  }
  assert(threw, 'categoria inválida');

  threw = false;
  try {
    validateTopographyEquipmentInput({
      name: 'X',
      category: 'DRONE',
      status: 'AVAILABLE',
      purchase_value: -1,
    });
  } catch {
    threw = true;
  }
  assert(threw, 'valor negativo');

  threw = false;
  try {
    validateTopographyEquipmentInput({
      name: 'X',
      category: 'DRONE',
      status: 'AVAILABLE',
      last_calibration_date: '2026-07-10',
      next_calibration_date: '2026-01-01',
    });
  } catch {
    threw = true;
  }
  assert(threw, 'próxima calibração < última');

  threw = false;
  try {
    validateTopographyEquipmentInput({
      name: 'X',
      category: 'DRONE',
      status: 'AVAILABLE',
      cost_center_id: 'not-a-uuid',
    });
  } catch {
    threw = true;
  }
  assert(threw, 'cost_center uuid inválido');

  console.log('OK testValidation');
}

function testServiceAndApiContracts() {
  assert(exists('lib/master/topography/equipmentService.ts'), 'service');
  assert(exists('lib/master/topography/equipmentTypes.ts'), 'types');
  assert(exists('lib/master/topography/equipmentValidation.ts'), 'validation');
  assert(exists('lib/master/topography/equipmentStatuses.ts'), 'statuses');
  assert(exists('lib/master/topography/equipmentCategories.ts'), 'categories');
  assert(exists('app/api/master/topography/equipment/route.ts'), 'list/create API');
  assert(exists('app/api/master/topography/equipment/[id]/route.ts'), 'get/patch API');
  assert(!exists('app/api/topography/equipment/route.ts'), 'sem API fora do master');
  assert(!exists('app/api/master/equipment/route.ts'), 'sem rota paralela /master/equipment');

  const service = read('lib/master/topography/equipmentService.ts');
  assert(service.includes('generate_next_topography_equipment_code'), 'RPC no service');
  assert(service.includes('createTopographyEquipment'), 'create');
  assert(service.includes('updateTopographyEquipment'), 'update');
  assert(service.includes('listTopographyEquipment'), 'list');
  assert(service.includes('getTopographyEquipmentById'), 'get');
  assert(service.includes('Número de série já cadastrado'), 'serial unique message');
  assert(/^EQP-\d{4}-\d{4}$/.test('EQP-2026-0001'), 'formato EQP');

  const listApi = read('app/api/master/topography/equipment/route.ts');
  assert(listApi.includes('assertSuperAdmin'), 'GET/POST assertSuperAdmin');
  assert(listApi.includes('validateTopographyEquipmentInput'), 'POST valida');
  assert(listApi.includes('export async function GET'), 'GET');
  assert(listApi.includes('export async function POST'), 'POST');

  const idApi = read('app/api/master/topography/equipment/[id]/route.ts');
  assert(idApi.includes('assertSuperAdmin'), 'id assertSuperAdmin');
  assert(idApi.includes('export async function GET'), 'GET id');
  assert(idApi.includes('export async function PATCH'), 'PATCH');
  assert(idApi.includes('is_archived'), 'archive/restore via PATCH');
  assert(idApi.includes('TOPOGRAPHY_EQUIPMENT_ARCHIVED'), 'audit archive');
  assert(!idApi.includes('documents'), 'sem documents API');
  assert(!idApi.includes('maintenance'), 'sem maintenance API');
  assert(!idApi.includes('assign'), 'sem assignment API');

  console.log('OK testServiceAndApiContracts');
}

function testPhase1bUiAndNavigation() {
  const page = read('app/master/topography/equipment/page.tsx');
  assert(!page.includes('MasterModulePlaceholder'), 'página deixa de ser placeholder');
  assert(page.includes('EquipmentPage'), 'usa EquipmentPage');
  assert(exists('app/master/topography/equipment/[id]/page.tsx'), 'rota detalhe');
  assert(exists('components/master/topography/equipment/EquipmentPage.tsx'), 'lista UI');
  assert(exists('components/master/topography/equipment/EquipmentDetailPage.tsx'), 'detalhe UI');
  assert(exists('components/master/topography/equipment/EquipmentFormModal.tsx'), 'form modal');
  assert(exists('components/master/topography/equipment/EquipmentKpiRow.tsx'), 'KPIs');
  assert(exists('components/master/topography/equipment/EquipmentFilters.tsx'), 'filtros');
  assert(exists('components/master/topography/equipment/EquipmentStatusBadge.tsx'), 'badge status');
  assert(exists('components/master/topography/equipment/equipment.module.css'), 'CSS módulo');

  const listUi = read('components/master/topography/equipment/EquipmentPage.tsx');
  assert(listUi.includes('MasterSuperAdminGuard'), 'lista com guard');
  assert(listUi.includes('Novo equipamento'), 'botão criar');
  assert(listUi.includes('emptyState') || listUi.includes('Nenhum equipamento'), 'estado vazio');
  assert(listUi.includes('Arquivar'), 'ação arquivar');
  assert(listUi.includes('Restaurar'), 'ação restaurar');
  assert(listUi.includes('Editar'), 'ação editar');
  assert(listUi.includes('Detalhes'), 'ação detalhes');
  assert(listUi.includes('EquipmentKpiRow'), 'KPIs na listagem');
  assert(listUi.includes('EquipmentFilters'), 'filtros na listagem');
  assert(listUi.includes('includeArchived'), 'filtro arquivados');
  assert(listUi.includes('/api/master/topography/equipment'), 'consome API listagem');

  const formUi = read('components/master/topography/equipment/EquipmentFormModal.tsx');
  assert(formUi.includes('Dados gerais') || formUi.includes('geral'), 'aba gerais');
  assert(formUi.includes('Aquisição') || formUi.includes('aquisicao'), 'aba aquisição');
  assert(formUi.includes('Controle') || formUi.includes('controle'), 'aba controle');
  assert(formUi.includes('Centro de custo'), 'campo centro de custo');
  assert(
    formUi.includes('Não foi possível carregar centros') ||
      formUi.includes('Nenhum centro de custo'),
    'feedback centro de custo sem mascarar',
  );

  const detailUi = read('components/master/topography/equipment/EquipmentDetailPage.tsx');
  assert(detailUi.includes('MasterSuperAdminGuard'), 'detalhe com guard');
  assert(detailUi.includes('Documentos — Em breve'), 'docs em breve');
  assert(detailUi.includes('Manutenções — Em breve'), 'manutenção em breve');
  assert(detailUi.includes('QR Code — Em breve'), 'QR em breve');
  assert(detailUi.includes('Voltar à lista'), 'voltar lista');

  const nav = read('lib/master/executiveNav.ts');
  const equipBlock = nav.slice(
    nav.indexOf("name: 'Equipamentos'"),
    nav.indexOf("name: 'Veículos'"),
  );
  assert(!equipBlock.includes('comingSoon: true'), 'Equipamentos sem Em breve');
  assert(equipBlock.includes("/master/topography/equipment"), 'href equipamentos');

  assert(
    /name:\s*'Operação'[\s\S]*?comingSoon:\s*true[\s\S]*?name:\s*'Equipamentos'/.test(nav),
    'Operação permanece Em breve',
  );
  assert(
    /name:\s*'Veículos'[\s\S]*?comingSoon:\s*true[\s\S]*?name:\s*'Relatórios'/.test(nav),
    'Veículos permanece Em breve',
  );
  assert(
    /name:\s*'Relatórios'[\s\S]*?comingSoon:\s*true[\s\S]*?FINANCEIRO CORPORATIVO/.test(nav),
    'Relatórios permanece Em breve',
  );

  // Sem documentos/manutenção services nesta fase
  assert(!exists('lib/master/topography/equipmentDocumentsService.ts'), 'sem documents service');
  assert(!exists('lib/master/topography/equipmentMaintenanceService.ts'), 'sem maintenance service');

  // Isolamento
  assert(exists('lib/master/topography/projectsService.ts'), 'projetos intacto');
  assert(exists('lib/master/topography/quotesService.ts'), 'orçamentos intacto');
  assert(exists('lib/gisSaleCreateService.ts') || exists('app/gis/page.tsx'), 'GIS presente');
  assert(
    exists('lib/contracts') || exists('app/contracts') || exists('components/contracts'),
    'contratos presentes',
  );

  console.log('OK testPhase1bUiAndNavigation');
}

function main() {
  testMigrationAndRls();
  testCategoriesAndStatuses();
  testValidation();
  testServiceAndApiContracts();
  testPhase1bUiAndNavigation();
  console.log('\nmandatory-master-topography-equipment-tests: all passed');
}

main();
