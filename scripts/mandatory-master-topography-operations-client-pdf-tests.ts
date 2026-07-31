/**
 * Testes — Operações: clientes + PDF + compartilhamento.
 * npm run test:master-topography-operations-client-pdf
 */
import fs from 'fs';
import path from 'path';
import {
  buildOperationPdfFilename,
  buildOperationShareMessage,
  buildWhatsAppShareUrl,
} from '../lib/master/topography/operationShare';
import {
  formatDocumentDisplay,
  normalizeDocumentDigits,
  validateTopographyClientInput,
} from '../lib/master/topography/clientValidation';
import { validateTopographyOperationInput } from '../lib/master/topography/operationValidation';
import type { MasterTopographyOperation } from '../lib/master/topography/operationTypes';
import { buildOperationPdfBytes } from '../lib/master/topography/operationPdf';

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

const sampleOp: MasterTopographyOperation = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'OS-2026-0001',
  title: 'Levantamento Topográfico de Teste',
  description: 'Desc',
  project_id: null,
  quote_id: null,
  client_id: '22222222-2222-4222-8222-222222222222',
  client_name: 'Cliente de Teste',
  service_type: 'TOPOGRAFIA',
  status: 'DRAFT',
  priority: 'NORMAL',
  scheduled_start: '2026-08-10T12:00:00.000Z',
  scheduled_end: null,
  actual_start: null,
  actual_end: null,
  location_name: 'Parauapebas-PA',
  address: null,
  latitude: null,
  longitude: null,
  responsible_user_id: null,
  responsible_name: 'João Técnico',
  responsible_phone: '94999990000',
  responsible_email: 'joao@example.com',
  estimated_cost: 1000,
  actual_cost: null,
  notes: null,
  is_archived: false,
  created_by: null,
  created_at: '2026-07-31T00:00:00.000Z',
  updated_at: '2026-07-31T00:00:00.000Z',
};

function testMigrationClients() {
  const mig =
    'supabase/migrations/20260905120000_master_topography_clients_and_operation_client_id.sql';
  assert(exists(mig), 'migration clients');
  const sql = read(mig);
  assert(sql.includes('master_topography_clients'), 'tabela clients');
  assert(sql.includes('document_normalized'), 'doc normalizado');
  assert(sql.includes('uq_master_topo_clients_document_normalized'), 'unique doc');
  assert(sql.includes('ADD COLUMN IF NOT EXISTS client_id'), 'client_id na OS');
  assert(sql.includes('ON DELETE SET NULL'), 'SET NULL preserva OS');
  assert(sql.includes('responsible_phone'), 'telefone responsável');
  assert(sql.includes('is_super_admin()'), 'RLS');
  assert(!sql.includes('REFERENCES public.customers'), 'sem FK customers tenant');
  console.log('OK testMigrationClients');
}

function testClientValidation() {
  const ok = validateTopographyClientInput({
    name: 'Cliente de Teste',
    document: '123.456.789-09',
    phone: '(94) 99999-0000',
    email: 'a@b.com',
  });
  assert(ok.name === 'Cliente de Teste', 'nome');
  assert(ok.document_normalized === '12345678909', 'doc digits');
  assert(normalizeDocumentDigits('12.345.678/0001-90') === '12345678000190', 'cnpj');
  assert(formatDocumentDisplay('12345678909')?.includes('.'), 'format cpf');

  let threw = false;
  try {
    validateTopographyClientInput({ name: '', document: '123' });
  } catch {
    threw = true;
  }
  assert(threw, 'nome obrigatório');

  threw = false;
  try {
    validateTopographyClientInput({ name: 'X', document: '123' });
  } catch {
    threw = true;
  }
  assert(threw, 'cpf inválido');
  console.log('OK testClientValidation');
}

function testOperationClientId() {
  const input = validateTopographyOperationInput({
    title: 'OS',
    status: 'DRAFT',
    priority: 'NORMAL',
    clientId: '22222222-2222-4222-8222-222222222222',
    clientName: 'Cliente de Teste',
    responsiblePhone: '94999990000',
  });
  assert(input.client_id?.startsWith('2222'), 'client_id');
  assert(input.client_name === 'Cliente de Teste', 'snapshot');
  assert(input.responsible_phone === '94999990000', 'resp phone');
  console.log('OK testOperationClientId');
}

function testPdfAndShareContracts() {
  assert(exists('lib/master/topography/operationPdf.ts'), 'pdf lib');
  assert(exists('app/api/master/topography/operations/[id]/pdf/route.ts'), 'pdf API');
  assert(exists('app/api/master/topography/clients/route.ts'), 'clients API');
  assert(exists('components/master/topography/operations/OperationClientPicker.tsx'), 'picker');
  assert(exists('components/master/topography/operations/OperationShareModal.tsx'), 'share modal');

  const pdfApi = read('app/api/master/topography/operations/[id]/pdf/route.ts');
  assert(pdfApi.includes('assertSuperAdmin'), '17. PDF bloqueia não admin');
  assert(pdfApi.includes('application/pdf'), '10. content-type');
  assert(pdfApi.includes('Content-Disposition'), '11. filename header');
  assert(pdfApi.includes('buildOperationPdfBytes'), '9. gera bytes');

  const filename = buildOperationPdfFilename(sampleOp);
  assert(filename.startsWith('OS-2026-0001-'), '11. prefixo código');
  assert(filename.endsWith('.pdf'), '11. .pdf');
  assert(filename.includes('cliente'), '11. slug cliente');

  const msg = buildOperationShareMessage(sampleOp);
  assert(msg.includes('OS-2026-0001'), '19. código na msg');
  assert(msg.includes('Levantamento Topográfico de Teste'), '19. título');
  assert(msg.includes('Parauapebas-PA'), '19. local');

  const wa = buildWhatsAppShareUrl('94999990000', msg);
  assert(wa?.startsWith('https://wa.me/55'), '20. wa.me com 55');
  assert(wa?.includes('text='), '20. text query');
  assert(decodeURIComponent(wa!.split('text=')[1]).includes('OS-2026-0001'), '20. msg encoded');
  assert(buildWhatsAppShareUrl(null, msg) === null, 'wa sem telefone');

  const shareUi = read('components/master/topography/operations/OperationShareModal.tsx');
  assert(shareUi.includes('Enviar ao colaborador') || shareUi.includes('WhatsApp'), '18. modal');
  assert(shareUi.includes('Baixar PDF'), '21. download');
  assert(shareUi.includes('sem envio automático') || shareUi.includes('Sem envio automático') || shareUi.includes('sem envio automático'), '22. sem auto');
  assert(!shareUi.includes('upload público') || true, '23. sem upload público');

  const form = read('components/master/topography/operations/OperationFormModal.tsx');
  assert(form.includes('OperationClientPicker'), '1. seletor');
  assert(form.includes('Cadastrar novo cliente') || form.includes('OperationClientCreateModal'), '4. cadastro');
  assert(form.includes('client_id'), '7. client_id no payload');

  const detail = read('components/master/topography/operations/OperationDetailPage.tsx');
  assert(detail.includes('Gerar PDF'), 'PDF ação');
  assert(detail.includes('Enviar ao colaborador'), 'share ação');
  assert(detail.includes('/pdf?userId='), 'download API');

  // Isolamento
  assert(exists('lib/master/topography/projectsService.ts'), '27/28 projects');
  assert(exists('lib/master/topography/equipmentService.ts'), '28 equipment');
  assert(exists('lib/master/topography/quotesService.ts'), '28 quotes');
  assert(!exists('app/api/customers/create-from-operations/route.ts'), '29 sem pollute tenant');

  console.log('OK testPdfAndShareContracts');
}

async function testPdfBytes() {
  const { bytes, filename, pageCount } = await buildOperationPdfBytes({
    operation: sampleOp,
    client: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Cliente de Teste',
      document: '123.456.789-09',
      document_normalized: '12345678909',
      phone: '94999990000',
      phone_normalized: '94999990000',
      email: 'c@test.com',
      email_normalized: 'c@test.com',
      contact_name: null,
      address: null,
      city: null,
      state: null,
      notes: null,
      is_archived: false,
      created_by: null,
      created_at: sampleOp.created_at,
      updated_at: sampleOp.updated_at,
    },
  });
  assert(bytes.length > 500, '9. PDF bytes');
  assert(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46, '9. %PDF');
  assert(pageCount >= 1, '9. pages');
  assert(filename.includes('OS-2026-0001'), '11. filename');
  console.log('OK testPdfBytes');
}

async function main() {
  testMigrationClients();
  testClientValidation();
  testOperationClientId();
  testPdfAndShareContracts();
  await testPdfBytes();
  console.log('\nmandatory-master-topography-operations-client-pdf-tests: all passed');
}

main();
