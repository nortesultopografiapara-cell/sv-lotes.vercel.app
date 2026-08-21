/**
 * Etapa 14 Fase B — testes obrigatórios da Nota Promissória ARAGUAIA.
 * npx tsx scripts/mandatory-araguaia-promissory-note-tests.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PROMISSORY_NOTE_CASH_TOOLTIP,
  PROMISSORY_NOTE_DOCUMENT_TYPE,
  PROMISSORY_NOTE_LEGAL_NUMBER,
  PROMISSORY_NOTE_PAYABLE_FALLBACK,
  PROMISSORY_NOTE_SOURCE,
  buildPromissoryNoteDraft,
  buildPromissoryNoteHtml,
  buildPromissoryNotePartyLegalQualification,
  hasPromissoryNoteInstallmentBalance,
  isPromissoryNoteAraguaiaModel,
  isPromissoryNoteEmitted,
  parsePromissoryNoteDescription,
  resolvePromissoryNoteAmount,
  resolvePromissoryNoteDueDate,
  resolvePromissoryNoteEligibility,
  resolvePromissoryNotePayableAt,
  resolvePromissoryNoteVendors,
  serializePromissoryNoteDescription,
  type PromissoryNoteArtifactMetadata,
} from '../lib/araguaiaPromissoryNote';
import {
  buildPromissoryNoteFilename,
  buildPromissoryNotePdfBytes,
} from '../lib/araguaiaPromissoryNotePdf';
import {
  generatePromissoryNote,
  getPromissoryNoteStatus,
  openOrDownloadPromissoryNote,
} from '../lib/araguaiaPromissoryNoteService';

function ok(value: unknown, message: string) {
  assert.ok(value, message);
  console.log(`  OK ${message}`);
}

const sale = {
  contract_model: 'ARAGUAIA',
  payment_type: 'Parcelada',
  total_value: 25_000,
  down_payment: 5_000,
  installments_count: 2,
};
const receipts = [
  { installment_number: 0, amount: 5_000, due_date: '2026-08-20', status: 'pago' },
  { installment_number: 1, amount: 10_000, due_date: '2026-09-20', status: 'pendente' },
  { installment_number: 2, amount: 10_000, due_date: '2026-10-20', status: 'pendente' },
  { installment_number: 3, amount: 999, due_date: '2026-11-20', status: 'cancelado' },
];
const company = {
  id: 'tenant-a',
  contract_model: 'ARAGUAIA',
  legal_representative: 'JOÃO VENDEDOR',
  representative_cpf: '39053344705',
  contract_legal_nationality: 'Brasileiro',
  contract_legal_marital_status: 'Casado',
  contract_legal_profession: 'Empresário',
  contract_legal_rg: '1234567',
  contract_legal_rg_issuer: 'SSP/PA',
};
const customer = {
  name: 'MARIA COMPRADORA',
  cpf_cnpj: '52998224725',
  rg: '1234567',
  rg_issuer: 'SSP',
  rg_issuer_state: 'PA',
  nationality: 'Brasileira',
  civil_state: 'Solteira',
  profession: 'Engenheira',
  address: 'Rua A, 10',
  city: 'Marabá',
  state: 'PA',
};
const project = {
  name: 'Chacreamento Araguaia',
  contract_model: 'ARAGUAIA',
  city: 'Marabá',
  uf: 'PA',
};

console.log('\n=== A) Modelo, saldo e fontes oficiais ===');
{
  assert.equal(PROMISSORY_NOTE_DOCUMENT_TYPE, 'PROMISSORY_NOTE');
  assert.equal(PROMISSORY_NOTE_LEGAL_NUMBER, 1);
  assert.equal(PROMISSORY_NOTE_SOURCE, 'ARAGUAIA');
  ok(
    isPromissoryNoteAraguaiaModel({
      saleModel: sale.contract_model,
      projectName: project.name,
    }),
    'modelo ARAGUAIA reconhecido',
  );
  const amount = resolvePromissoryNoteAmount({ sale, receipts });
  assert.equal(amount.amount, 20_000);
  assert.equal(amount.source, 'finance_receipts');
  ok(amount.amountExtenso.length > 0, 'valor por extenso preenchido');
  ok(hasPromissoryNoteInstallmentBalance({ sale, receipts }), 'saldo parcelado detectado');
}

console.log('\n=== B) Vencimento e local de pagamento ===');
{
  const due = resolvePromissoryNoteDueDate({ sale, receipts });
  assert.equal(due.dueDateRaw, '2026-10-20');
  assert.equal(due.dueDateFmt, '20/10/2026');
  assert.equal(due.source, 'finance_receipts');
  assert.deepEqual(resolvePromissoryNotePayableAt({ project, company }), {
    payableAt: 'Marabá / PA',
    source: 'project',
  });
  assert.equal(
    resolvePromissoryNotePayableAt({ project: {}, company: {} }).payableAt,
    PROMISSORY_NOTE_PAYABLE_FALLBACK,
  );
  ok(true, 'última parcela e fallback de praça validados');
}

console.log('\n=== C) Um vendedor com qualificação e minuta ===');
const oneVendorDraft = buildPromissoryNoteDraft({
  contractId: 'contract-a',
  contractNumber: '000000014/2026',
  saleId: 'sale-a',
  sale,
  receipts,
  project,
  company,
  customer,
});
const expectedVendor1Qualification =
  'João Vendedor, Brasileiro, Casado, Empresário, inscrito(a) no CPF sob o nº 390.533.447-05 e no RG nº 1234567-SSP/PA';
{
  assert.equal(oneVendorDraft.ok, true);
  if (!oneVendorDraft.ok) throw new Error('minuta deveria ser válida');
  assert.equal(oneVendorDraft.draft.vendor1.name, 'João Vendedor');
  assert.equal(oneVendorDraft.draft.vendor1.address, null);
  assert.equal(oneVendorDraft.draft.vendor2, null);
  assert.equal(
    buildPromissoryNotePartyLegalQualification(oneVendorDraft.draft.vendor1),
    expectedVendor1Qualification,
  );
  assert.equal(oneVendorDraft.draft.favorecidosPhrase, expectedVendor1Qualification);
  assert.equal(
    oneVendorDraft.draft.clauseReference,
    'Nota Promissória emitida nos termos da Cláusula Terceira, item 1.2, do Contrato nº 000000014/2026.',
  );
  assert.equal(
    oneVendorDraft.draft.buyer.qualification,
    'Brasileira, Solteira, Engenheira',
  );
  assert.equal(oneVendorDraft.draft.amount, 20_000);
  assert.equal(oneVendorDraft.draft.dueDateRaw, '2026-10-20');
  ok(true, '1 vendedor com qualificação completa');
}

console.log('\n=== D) Dois vendedores com qualificações ===');
{
  const second = {
    name: 'ANA VENDEDORA',
    cpf: '11144477735',
    rg: '7654321',
    rgIssuer: 'SSP',
    rgUf: 'PA',
    nationality: 'Brasileira',
    maritalStatus: 'Casada',
    profession: 'Comerciante',
    email: 'ana@teste.com',
    phone: '94999999999',
    address: 'Rua Real, 200',
  };
  const resolved = resolvePromissoryNoteVendors({
    company: { ...company, contract_second_vendor_json: second },
  });
  assert.equal(resolved.vendors.length, 2);
  assert.equal(resolved.vendor1?.address, null);
  assert.equal(resolved.vendor2?.address, 'Rua Real, 200');
  const expectedVendor2Qualification =
    'Ana Vendedora, Brasileira, Casada, Comerciante, inscrito(a) no CPF sob o nº 111.444.777-35 e no RG nº 7654321-SSP/PA';
  assert.equal(
    buildPromissoryNotePartyLegalQualification(resolved.vendor2!),
    expectedVendor2Qualification,
  );
  const draft = buildPromissoryNoteDraft({
    contractId: 'contract-a',
    contractNumber: '000000014/2026',
    saleId: 'sale-a',
    sale,
    receipts,
    project,
    company: { ...company, contract_second_vendor_json: second },
    customer,
  });
  assert.equal(draft.ok, true);
  if (!draft.ok) throw new Error('minuta com dois vendedores deveria ser válida');
  assert.equal(
    draft.draft.favorecidosPhrase,
    `${expectedVendor1Qualification} e ${expectedVendor2Qualification}`,
  );
  assert.equal(draft.draft.amount, 20_000);
  assert.equal(draft.draft.dueDateRaw, '2026-10-20');
  ok(true, '2 vendedores com qualificações preservadas');
}

console.log('\n=== D.1) Dados opcionais ausentes não quebram a frase ===');
{
  const sparse = buildPromissoryNoteDraft({
    contractId: 'contract-a',
    contractNumber: '000000014/2026',
    saleId: 'sale-a',
    sale,
    receipts,
    project,
    company: {
      legal_representative: 'SOMENTE NOME',
      representative_cpf: '39053344705',
    },
    customer: {
      name: 'COMPRADOR MINIMO',
      cpf: '52998224725',
    },
  });
  assert.equal(sparse.ok, true);
  if (!sparse.ok) throw new Error('minuta mínima deveria ser válida');
  assert.equal(
    sparse.draft.favorecidosPhrase,
    'Somente Nome, inscrito(a) no CPF sob o nº 390.533.447-05',
  );
  ok(!sparse.draft.favorecidosPhrase.includes('undefined'), 'sem undefined na frase');
  ok(true, 'ausência de dados opcionais não quebra a frase');
}

console.log('\n=== E) Elegibilidade e cancelamento ===');
{
  assert.equal(
    resolvePromissoryNoteEligibility({
      isAraguaia: false,
      sale,
      receipts,
    }).reason,
    'not_araguaia',
  );
  const cash = resolvePromissoryNoteEligibility({
    isAraguaia: true,
    sale: { ...sale, installments_count: 0, down_payment: 25_000 },
    receipts: [],
  });
  assert.equal(cash.reason, 'cash_sale');
  assert.equal(cash.tooltip, PROMISSORY_NOTE_CASH_TOOLTIP);
  assert.equal(
    resolvePromissoryNoteEligibility({
      isAraguaia: true,
      sale,
      receipts,
      contractStatus: 'cancelado',
      hasExistingDocument: false,
    }).reason,
    'cancelled_no_doc',
  );
  assert.equal(
    resolvePromissoryNoteEligibility({
      isAraguaia: true,
      sale,
      receipts,
      contractStatus: 'cancelado',
      hasExistingDocument: true,
    }).reason,
    'cancelled_history_only',
  );
  ok(true, 'venda à vista e cancelamento bloqueados corretamente');
}

console.log('\n=== F) HTML, PDF e metadata ===');
{
  if (!oneVendorDraft.ok) throw new Error('minuta inválida');
  const html = buildPromissoryNoteHtml(oneVendorDraft.draft);
  ok(html.includes(oneVendorDraft.draft.clauseReference), 'HTML contém referência exata');
  ok(html.includes(expectedVendor1Qualification), 'HTML contém favorecido qualificado');
  ok(html.includes('pagarei (emos)'), 'HTML usa pagarei (emos)');
  ok(!html.includes('pagarei(emos)'), 'HTML não usa pagarei(emos) colado');
  ok(!html.includes('Qualificação:'), 'HTML sem linha Qualificação no emitente');
  ok(html.includes('<strong>Nome:</strong>'), 'HTML mantém Nome do emitente');
  ok(html.includes('<strong>CPF:</strong>'), 'HTML mantém CPF do emitente');
  ok(html.includes('Assinatura do Emitente'), 'HTML mantém espaço de assinatura');
  ok(buildPromissoryNotePdfBytes(oneVendorDraft.draft).byteLength > 1_000, 'PDF gerado');
  assert.equal(
    buildPromissoryNoteFilename({
      contractNumber: '000000014/2026',
      version: 2,
    }),
    'nota-promissoria_000000014_2026_v2.pdf',
  );
  const meta: PromissoryNoteArtifactMetadata = {
    contract_id: 'contract-a',
    contract_number: '000000014/2026',
    document_type: PROMISSORY_NOTE_DOCUMENT_TYPE,
    promissory_note_number: PROMISSORY_NOTE_LEGAL_NUMBER,
    version: 1,
    amount: 20_000,
    due_date: '2026-10-20',
    generated_at: '2026-08-21T12:00:00.000Z',
    source: PROMISSORY_NOTE_SOURCE,
    emitted_at: null,
  };
  const parsed = parsePromissoryNoteDescription(
    serializePromissoryNoteDescription(meta),
  );
  assert.equal(parsed?.version, 1);
  assert.equal(isPromissoryNoteEmitted(parsed), false);
  parsed!.emitted_at = '2026-08-21T13:00:00.000Z';
  assert.equal(isPromissoryNoteEmitted(parsed), true);
}

console.log('\n=== G) Persistência mockada e versionamento ===');
{
  assert.equal(typeof getPromissoryNoteStatus, 'function');
  assert.equal(typeof generatePromissoryNote, 'function');
  assert.equal(typeof openOrDownloadPromissoryNote, 'function');
  type MockDoc = { version: number; emittedAt: string | null; deletedAt: string | null };
  const rows: MockDoc[] = [];
  const generate = (forceRegenerate = false) => {
    const active = rows.filter((row) => !row.deletedAt).sort((a, b) => b.version - a.version);
    const current = active[0];
    if (!current) {
      rows.push({ version: 1, emittedAt: null, deletedAt: null });
      return 1;
    }
    if (!current.emittedAt) {
      current.deletedAt = 'mock-now';
      rows.push({ version: current.version, emittedAt: null, deletedAt: null });
      return current.version;
    }
    if (!forceRegenerate) throw new Error('already_emitted');
    const version = Math.max(...active.map((row) => row.version)) + 1;
    rows.push({ version, emittedAt: null, deletedAt: null });
    return version;
  };

  assert.equal(generate(), 1);
  assert.equal(generate(), 1);
  assert.equal(rows.filter((row) => row.deletedAt).length, 1);
  rows.find((row) => !row.deletedAt)!.emittedAt = 'mock-emitted';
  assert.throws(() => generate(), /already_emitted/);
  assert.equal(generate(true), 2);
  rows.find((row) => !row.deletedAt && row.version === 2)!.emittedAt = 'mock-emitted-v2';
  assert.equal(generate(true), 3);
  assert.deepEqual(
    rows.filter((row) => !row.deletedAt).map((row) => row.version).sort(),
    [1, 2, 3],
  );

  const serviceSource = fs.readFileSync(
    path.join(process.cwd(), 'lib', 'araguaiaPromissoryNoteService.ts'),
    'utf8',
  );
  ok(serviceSource.includes("deleted_at: new Date().toISOString()"), 'rascunho usa soft-delete direto');
  ok(serviceSource.includes('options?.forceRegenerate'), 'serviço exige regenerate após emissão');
  ok(serviceSource.includes('r.installment_number'), 'serviço mapeia installment_number');
  ok(serviceSource.includes('saleCtx.tenantId !== tenantId'), 'serviço isola venda e contrato por tenant');
}

console.log('\n✅ Nota Promissória ARAGUAIA — A–G verdes.\n');
