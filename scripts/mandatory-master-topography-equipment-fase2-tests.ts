/**
 * Testes obrigatórios — Equipamentos (Master Topografia) Fase 2.
 * npm run test:master-topography-equipment-fase2
 *
 * Cobre: migration F2, Storage, validation docs/mime/size, manutenção, custo,
 * assignments, alertas, timeline, RLS/APIs SUPER_ADMIN, regressão Fase 1.
 */
import fs from 'fs';
import path from 'path';
import {
  EQUIPMENT_DOCUMENT_MAX_BYTES,
  EQUIPMENT_DOCUMENTS_STORAGE_BUCKET,
  EQUIPMENT_DOCUMENT_TYPES,
  isEquipmentDocumentType,
} from '../lib/master/topography/equipmentDocumentTypes';
import {
  buildEquipmentDocumentStoragePath,
  validateEquipmentDocumentFileSize,
  validateEquipmentDocumentMeta,
  validateEquipmentDocumentMimeType,
} from '../lib/master/topography/equipmentDocumentValidation';
import {
  EQUIPMENT_MAINTENANCE_TYPES,
  isEquipmentMaintenanceStatus,
  isEquipmentMaintenanceType,
} from '../lib/master/topography/equipmentMaintenanceTypes';
import { validateEquipmentMaintenanceInput } from '../lib/master/topography/equipmentMaintenanceValidation';
import { validateEquipmentTransferInput } from '../lib/master/topography/equipmentAssignmentValidation';
import { computeEquipmentAlertsFromData } from '../lib/master/topography/equipmentAlertsService';
import { hashEquipmentDocumentContent } from '../lib/master/topography/equipmentDocumentsService';
import type { MasterTopographyEquipment } from '../lib/master/topography/equipmentTypes';
import { validateTopographyEquipmentInput } from '../lib/master/topography/equipmentValidation';

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

function testMigrationFase2() {
  const mig = 'supabase/migrations/20260903120000_master_topography_equipment_fase2.sql';
  assert(exists(mig), 'migration fase 2');
  const sql = read(mig);

  assert(sql.includes('master_topography_equipment_documents'), 'tabela documents');
  assert(sql.includes('master_topography_equipment_maintenance'), 'tabela maintenance');
  assert(sql.includes('master_topography_equipment_assignments'), 'tabela assignments');
  assert(sql.includes('is_super_admin()'), 'RLS SUPER_ADMIN');
  assert(sql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS enabled');
  assert(sql.includes("master-topography-equipment"), 'bucket storage');
  assert(sql.includes('content_hash'), 'content_hash');
  assert(sql.includes('deleted_at'), 'soft delete docs');
  assert(sql.includes('payable_id'), 'hook payables');
  assert(sql.includes('previous_equipment_status'), 'restore status');
  assert(sql.includes("'INVOICE'"), 'tipo invoice');
  assert(sql.includes("'PREVENTIVE'"), 'tipo preventiva');
  assert(sql.includes("'CALIBRATION'"), 'tipo calibração');
  assert(!sql.includes('REFERENCES public.customers'), 'sem FK customers');
  console.log('OK testMigrationFase2');
}

function testDocumentValidation() {
  assert(EQUIPMENT_DOCUMENT_TYPES.length === 10, '10 tipos documento');
  assert(isEquipmentDocumentType('ANAC'), 'ANAC');
  assert(isEquipmentDocumentType('PHOTO'), 'PHOTO');
  assert(!isEquipmentDocumentType('XYZ'), 'tipo inválido');

  assert(validateEquipmentDocumentMimeType('application/pdf', 'a.pdf').valid, 'pdf ok');
  assert(validateEquipmentDocumentMimeType('image/jpeg', 'a.jpg').valid, 'jpg ok');
  assert(
    !validateEquipmentDocumentMimeType('application/msword', 'a.doc').valid,
    'doc bloqueado',
  );
  assert(validateEquipmentDocumentFileSize(1024).valid, 'size ok');
  assert(!validateEquipmentDocumentFileSize(0).valid, 'vazio');
  assert(
    !validateEquipmentDocumentFileSize(EQUIPMENT_DOCUMENT_MAX_BYTES + 1).valid,
    'acima do limite',
  );

  const meta = validateEquipmentDocumentMeta({
    tipo: 'INVOICE',
    titulo: 'NF 1',
    issued_at: '2026-01-01',
    valid_until: '2027-01-01',
  });
  assert(meta.tipo === 'INVOICE', 'meta tipo');
  assert(meta.titulo === 'NF 1', 'meta título');

  let threw = false;
  try {
    validateEquipmentDocumentMeta({ tipo: 'BAD', titulo: 'x' });
  } catch {
    threw = true;
  }
  assert(threw, 'tipo inválido lança');

  const storagePath = buildEquipmentDocumentStoragePath({
    equipmentId: 'eq-1',
    fileName: 'Manual Drone.pdf',
    uuid: 'uuid-abc',
  });
  assert(storagePath.startsWith('eq-1/'), 'path equipment');
  assert(storagePath.includes('uuid-abc-'), 'uuid no path');
  assert(EQUIPMENT_DOCUMENTS_STORAGE_BUCKET === 'master-topography-equipment', 'bucket');

  const h1 = hashEquipmentDocumentContent(Buffer.from('abc'));
  const h2 = hashEquipmentDocumentContent(Buffer.from('abc'));
  const h3 = hashEquipmentDocumentContent(Buffer.from('abd'));
  assert(h1 === h2, 'hash estável');
  assert(h1 !== h3, 'hash distinto');
  assert(h1.length === 64, 'sha256 hex');

  console.log('OK testDocumentValidation');
}

function testMaintenanceValidation() {
  assert(isEquipmentMaintenanceType('PREVENTIVE'), 'preventiva');
  assert(isEquipmentMaintenanceType('CALIBRATION'), 'calibração');
  assert(isEquipmentMaintenanceStatus('DONE'), 'DONE');
  assert(EQUIPMENT_MAINTENANCE_TYPES.length === 7, '7 tipos manutenção');

  const input = validateEquipmentMaintenanceInput({
    tipo: 'CALIBRATION',
    status: 'DONE',
    description: 'Calibração anual',
    cost: 150.5,
    next_review_at: '2027-01-01',
    performed_at: '2026-07-01',
  });
  assert(input.cost === 150.5, 'custo');
  assert(input.next_review_at === '2027-01-01', 'próxima revisão');

  let threw = false;
  try {
    validateEquipmentMaintenanceInput({
      tipo: 'PREVENTIVE',
      description: 'x',
      cost: -1,
    });
  } catch {
    threw = true;
  }
  assert(threw, 'custo negativo bloqueado');

  console.log('OK testMaintenanceValidation');
}

function testAssignmentValidation() {
  const t = validateEquipmentTransferInput({
    to_responsible_name: 'Técnico B',
    to_location: 'Campo',
    reason: 'Obra X',
  });
  assert(t.to_responsible_name === 'Técnico B', 'responsável');
  assert(t.to_location === 'Campo', 'localização');

  let threw = false;
  try {
    validateEquipmentTransferInput({});
  } catch {
    threw = true;
  }
  assert(threw, 'transfer vazio bloqueado');

  console.log('OK testAssignmentValidation');
}

function testAlerts() {
  const equipment: MasterTopographyEquipment = {
    id: 'e1',
    code: 'EQP-2026-0001',
    name: 'Drone',
    category: 'DRONE',
    manufacturer: null,
    model: null,
    serial_number: null,
    asset_number: null,
    purchase_date: null,
    purchase_value: null,
    warranty_until: '2020-01-01',
    supplier: null,
    invoice_number: null,
    cost_center_id: null,
    status: 'MAINTENANCE',
    location: 'Lab',
    responsible_user_id: null,
    responsible_name: 'A',
    usage_hours: 0,
    last_calibration_date: null,
    next_calibration_date: '2020-06-01',
    notes: null,
    photo_url: null,
    qr_payload: null,
    is_archived: false,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const alerts = computeEquipmentAlertsFromData({
    equipment,
    documents: [
      {
        id: 'd1',
        titulo: 'ANAC',
        valid_until: '2020-02-01',
        deleted_at: null,
      },
    ],
    maintenance: [
      {
        id: 'm1',
        tipo: 'PREVENTIVE',
        status: 'PLANNED',
        scheduled_at: '2020-03-01',
        next_review_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        is_archived: false,
      },
    ],
    now: '2026-07-31',
    horizon: '2026-08-30',
  });

  const codes = alerts.map((a) => a.code);
  assert(codes.includes('WARRANTY_EXPIRED'), 'garantia vencida');
  assert(codes.includes('CALIBRATION_OVERDUE'), 'calibração vencida');
  assert(codes.includes('DOCUMENT_EXPIRED'), 'documento vencido');
  assert(codes.includes('MAINTENANCE_DUE'), 'manutenção devida');
  assert(codes.includes('MAINTENANCE_STUCK'), 'stuck manutenção');

  console.log('OK testAlerts');
}

function testApisAndUiContracts() {
  assert(exists('app/api/master/topography/equipment/[id]/documents/route.ts'), 'docs API');
  assert(
    exists('app/api/master/topography/equipment/[id]/documents/[docId]/route.ts'),
    'doc id API',
  );
  assert(
    exists('app/api/master/topography/equipment/[id]/maintenance/route.ts'),
    'maint API',
  );
  assert(
    exists('app/api/master/topography/equipment/[id]/maintenance/[maintId]/route.ts'),
    'maint id API',
  );
  assert(
    exists('app/api/master/topography/equipment/[id]/assignments/route.ts'),
    'assign API',
  );
  assert(exists('app/api/master/topography/equipment/[id]/timeline/route.ts'), 'timeline API');
  assert(exists('app/api/master/topography/equipment/[id]/alerts/route.ts'), 'alerts API');

  for (const rel of [
    'app/api/master/topography/equipment/[id]/documents/route.ts',
    'app/api/master/topography/equipment/[id]/maintenance/route.ts',
    'app/api/master/topography/equipment/[id]/assignments/route.ts',
    'app/api/master/topography/equipment/[id]/timeline/route.ts',
    'app/api/master/topography/equipment/[id]/alerts/route.ts',
  ]) {
    const src = read(rel);
    assert(src.includes('assertSuperAdmin'), `${rel} assertSuperAdmin`);
  }

  const docsApi = read('app/api/master/topography/equipment/[id]/documents/route.ts');
  assert(docsApi.includes('uploadEquipmentDocument'), 'upload service');
  const docIdApi = read(
    'app/api/master/topography/equipment/[id]/documents/[docId]/route.ts',
  );
  assert(docIdApi.includes('softDeleteEquipmentDocument'), 'soft delete');
  assert(docIdApi.includes('createEquipmentDocumentSignedUrl'), 'download signed');

  assert(exists('components/master/topography/equipment/EquipmentDocumentsPanel.tsx'), 'UI docs');
  assert(
    exists('components/master/topography/equipment/EquipmentMaintenancePanel.tsx'),
    'UI maint',
  );
  assert(
    exists('components/master/topography/equipment/EquipmentAssignmentsPanel.tsx'),
    'UI assign',
  );
  assert(
    exists('components/master/topography/equipment/EquipmentTimelinePanel.tsx'),
    'UI timeline',
  );
  assert(
    exists('components/master/topography/equipment/EquipmentAlertsBanner.tsx'),
    'UI alerts',
  );

  const detail = read('components/master/topography/equipment/EquipmentDetailPage.tsx');
  assert(detail.includes('EquipmentDocumentsPanel'), 'detail docs');
  assert(detail.includes('EquipmentMaintenancePanel'), 'detail maint');
  assert(detail.includes('EquipmentTimelinePanel'), 'detail timeline');
  assert(!detail.includes('Documentos — Em breve'), 'sem placeholder docs');

  const kpi = read('components/master/topography/equipment/EquipmentKpiRow.tsx');
  assert(kpi.includes('calibrationDueSoon'), 'KPI calibração');

  // Bloqueio de rota fora do master
  assert(!exists('app/api/topography/equipment/documents/route.ts'), 'sem API fora master');

  console.log('OK testApisAndUiContracts');
}

function testPhase1Regression() {
  const input = validateTopographyEquipmentInput({
    name: 'Estação Total',
    category: 'TOTAL_STATION',
    status: 'AVAILABLE',
  });
  assert(input.name === 'Estação Total', 'validação Fase 1');

  assert(exists('lib/master/topography/equipmentService.ts'), 'service Fase 1');
  assert(exists('app/api/master/topography/equipment/route.ts'), 'list API Fase 1');
  assert(exists('supabase/migrations/20260902120000_master_topography_equipment.sql'), 'mig 1A');

  const listApi = read('app/api/master/topography/equipment/route.ts');
  assert(listApi.includes('assertSuperAdmin'), 'list assertSuperAdmin');

  console.log('OK testPhase1Regression');
}

function main() {
  testMigrationFase2();
  testDocumentValidation();
  testMaintenanceValidation();
  testAssignmentValidation();
  testAlerts();
  testApisAndUiContracts();
  testPhase1Regression();
  console.log('\nmandatory-master-topography-equipment-fase2-tests: all passed');
}

main();
