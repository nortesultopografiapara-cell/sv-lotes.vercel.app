/**
 * Testes obrigatórios — PF vs PJ no contrato SaaS.
 * npx tsx scripts/mandatory-saas-contract-person-type-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildSaasContractDocumentText,
  buildSaasContractSections,
  menesesSaasContractFixture,
  resolveSaasContractContext,
  SAAS_CONTRACT_CONTENT_VERSION,
} from '../lib/saasContractContent';
import { buildSaasContractPdfWithMeta } from '../lib/saasContractPdf';
import {
  formatContractPartyDocument,
  resolveSaasContractPartyType,
  resolveSaasContractorParty,
} from '../lib/saasContractParty';
import { roughSaasContractPdfText } from '../lib/saasContractPdfContentDetect';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function ivanildeFixture() {
  return {
    company: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Ivanilde de Moura Silva',
      cnpj: '32641281104',
      email: 'ivanilde@example.com',
      phone: '94999999999',
      address: 'Rua Teste, 1',
      city: 'Parauapebas',
      state: 'PA',
      cep: '68515000',
      plan: 'basic',
      plan_type: 'basic',
      custom_price_enabled: true,
      custom_monthly_price: 300,
      custom_price_badge: 'desconto_especial',
      subscription_due_day: 15,
      subscription_start_date: '2026-06-15',
      responsible_name: 'Representante legal',
      legal_representative: 'Representante legal',
      active: true,
      status_operacional: 'Ativa',
      is_test_company: false,
    },
    subscription: {
      contract_number: '00099/2026',
      plan_type: 'basic',
      monthly_price: 300,
      start_date: '2026-06-15',
      first_payment_date: '2026-06-15',
      next_due_date: '2026-07-15',
    },
  };
}

function testDetectCpfAndCnpj() {
  assert(resolveSaasContractPartyType('326.412.811-04') === 'PF', 'CPF mascarado');
  assert(resolveSaasContractPartyType('32641281104') === 'PF', 'CPF digits');
  assert(resolveSaasContractPartyType('64.435.850/0001-03') === 'PJ', 'CNPJ mascarado');
  assert(formatContractPartyDocument('32641281104') === '326.412.811-04', 'formata CPF');
  console.log('OK testDetectCpfAndCnpj');
}

function testNaturalPersonQualification() {
  const input = ivanildeFixture();
  const ctx = resolveSaasContractContext(input);
  const sections = buildSaasContractSections(ctx, SAAS_CONTRACT_CONTENT_VERSION);
  const clause1 = sections.find((s) => s.number === 1)?.paragraphs.join(' ') || '';

  assert(ctx.contractor.partyType === 'PF', 'Ivanilde é PF');
  assert(ctx.contractor.documentLabel === 'CPF', 'label CPF');
  assert(ctx.contractor.document === '326.412.811-04', 'CPF formatado');
  assert(!ctx.contractor.showRepresentative, 'PF sem representante');
  assert(clause1.includes('inscrito(a) no CPF'), 'cláusula 1 CPF');
  assert(clause1.includes('326.412.811-04'), 'cláusula 1 número CPF');
  assert(!clause1.includes('CNPJ 326'), 'cláusula 1 sem CNPJ errado');
  assert(!clause1.includes('representada por'), 'cláusula 1 sem representada por');
  assert(!clause1.includes('Representante legal'), 'cláusula 1 sem representante legal');
  console.log('OK testNaturalPersonQualification');
}

function testLegalEntityQualification() {
  const input = menesesSaasContractFixture();
  const ctx = resolveSaasContractContext(input);
  const sections = buildSaasContractSections(ctx, SAAS_CONTRACT_CONTENT_VERSION);
  const clause1 = sections.find((s) => s.number === 1)?.paragraphs.join(' ') || '';

  assert(ctx.contractor.partyType === 'PJ', 'Meneses é PJ');
  assert(ctx.contractor.documentLabel === 'CNPJ', 'label CNPJ');
  assert(ctx.contractor.showRepresentative, 'PJ com representante');
  assert(clause1.includes('inscrita no CNPJ'), 'cláusula 1 CNPJ');
  assert(clause1.includes('representada por'), 'cláusula 1 representada por');
  assert(clause1.includes('Carlos Daniel Araujo Meneses'), 'representante Meneses');
  console.log('OK testLegalEntityQualification');
}

function testIvanildeBillingCycle() {
  const ctx = resolveSaasContractContext(ivanildeFixture());
  assert(ctx.plan.name === 'BÁSICO', 'plano Básico');
  assert(ctx.plan.monthlyPrice.includes('300'), 'R$ 300,00');
  assert(ctx.plan.dueDay === 15, 'dia vencimento 15');
  assert(ctx.plan.startDate === '15/06/2026', 'início 15/06/2026');
  assert(ctx.plan.firstPaymentDate === '15/06/2026', 'primeira cobrança 15/06/2026');
  assert(ctx.plan.nextDueDate === '15/07/2026', 'próximo vencimento 15/07/2026');
  assert(ctx.plan.noAnnualAdjustment === true, 'sem reajuste anual');
  console.log('OK testIvanildeBillingCycle');
}

function testIvanildePdfSignaturePage() {
  const built = buildSaasContractPdfWithMeta(ivanildeFixture(), {
    contentVersion: SAAS_CONTRACT_CONTENT_VERSION,
  });
  const rough = roughSaasContractPdfText(built.pdf);
  assert(rough.includes('326.412.811-04') || rough.includes('32641281104'), 'PDF CPF Ivanilde');
  assert(!rough.includes('CNPJ 326.412.811-04'), 'PDF não CNPJ errado');
  console.log('OK testIvanildePdfSignaturePage');
}

function testMenesesPdfKeepsCnpj() {
  const built = buildSaasContractPdfWithMeta(menesesSaasContractFixture(), {
    contentVersion: SAAS_CONTRACT_CONTENT_VERSION,
  });
  const rough = roughSaasContractPdfText(built.pdf);
  assert(rough.includes('64.435.850/0001-03') || rough.includes('64435850000103'), 'PDF CNPJ Meneses');
  assert(rough.toLowerCase().includes('representante legal'), 'PDF PJ com representante legal');
  console.log('OK testMenesesPdfKeepsCnpj');
}

function testDocumentTextHeader() {
  const pfText = buildSaasContractDocumentText(ivanildeFixture());
  assert(pfText.includes('CPF 326.412.811-04'), 'texto integral PF');
  assert(!pfText.includes('CNPJ 326'), 'texto integral sem CNPJ PF');

  const pjText = buildSaasContractDocumentText(menesesSaasContractFixture());
  assert(pjText.includes('CNPJ 64.435.850/0001-03'), 'texto integral PJ');
  console.log('OK testDocumentTextHeader');
}

function testPartyResolverFlags() {
  const pf = resolveSaasContractorParty({ cnpj: '32641281104', name: 'Ivanilde' });
  assert(pf.isNaturalPerson, 'resolver PF');
  assert(pf.nameLabel === 'Nome', 'label nome PF');

  const pj = resolveSaasContractorParty({ cnpj: '64435850000103', name: 'Meneses' });
  assert(!pj.isNaturalPerson, 'resolver PJ');
  assert(pj.nameLabel === 'Empresa', 'label empresa PJ');
  console.log('OK testPartyResolverFlags');
}

async function writeIvanildeSamplePdf() {
  const built = buildSaasContractPdfWithMeta(ivanildeFixture(), {
    contentVersion: SAAS_CONTRACT_CONTENT_VERSION,
  });
  const outDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'contrato-saas-ivanilde-cpf-corrigido.pdf');
  fs.writeFileSync(outPath, built.pdf);
  console.log('OK writeIvanildeSamplePdf', outPath);
}

async function main() {
  testDetectCpfAndCnpj();
  testNaturalPersonQualification();
  testLegalEntityQualification();
  testIvanildeBillingCycle();
  testIvanildePdfSignaturePage();
  testMenesesPdfKeepsCnpj();
  testDocumentTextHeader();
  testPartyResolverFlags();
  await writeIvanildeSamplePdf();
  console.log('\nTodos os testes mandatory-saas-contract-person-type passaram.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
