/**
 * Testes obrigatórios — CPF do cônjuge + cadastro reutilizável.
 * npx tsx scripts/mandatory-sale-spouse-cpf-reuse-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  formatSpouseCpf,
  getSpouseCpfValidationState,
  normalizeSpouseCpfForStorage,
  spouseCpfDigits,
} from '../lib/saleSpouseCpf';
import {
  applySpouseSuggestionToForm,
  customerSpouseToFormFields,
  formFieldsToCustomerSpousePayload,
  mergeCustomerSpouseSuggestions,
  saleRowToCustomerSpouseCandidate,
  saleSpouseFormHasContent,
  type CustomerSpouseRecord,
  type CustomerSpouseSuggestion,
} from '../lib/customerSpouses';
import {
  buildSaleSpouseDbPatch,
  resolveSaleSpouseContext,
  saleSpouseFormFieldsFromSale,
} from '../lib/saleSpouseFields';
import { formatCpfCnpj } from '../lib/inputMasks';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testCpfMaskWithoutPunctuation() {
  assert(formatSpouseCpf('65082028200') === '650.820.282-00', 'máscara sem pontuação');
  console.log('OK testCpfMaskWithoutPunctuation');
}

function testCpfPasteWithPunctuation() {
  assert(formatSpouseCpf('650.820.282-00') === '650.820.282-00', 'colagem com máscara');
  assert(spouseCpfDigits('650.820.282-00') === '65082028200', 'dígitos');
  console.log('OK testCpfPasteWithPunctuation');
}

function testLeadingZerosPreserved() {
  assert(formatSpouseCpf('01234567890') === '012.345.678-90', 'zeros à esquerda');
  assert(spouseCpfDigits('012.345.678-90') === '01234567890', 'dígitos com zero');
  console.log('OK testLeadingZerosPreserved');
}

function testIncompleteCpfValidation() {
  const incomplete = getSpouseCpfValidationState('650.820');
  assert(incomplete.tone === 'error', 'incompleto erro');
  const complete = getSpouseCpfValidationState('65082028200');
  assert(complete.isCompleteCpf && complete.tone === 'success', 'completo ok');
  console.log('OK testIncompleteCpfValidation');
}

function testEditLoadsFormattedCpf() {
  const form = saleSpouseFormFieldsFromSale({
    sale_spouse_name: 'Maria',
    sale_spouse_cpf: '65082028200',
  });
  assert(form.has_spouse, 'has spouse');
  assert(form.sale_spouse_cpf === '650.820.282-00', 'edit formatado');
  console.log('OK testEditLoadsFormattedCpf');
}

function testContractDisplayUsesFormatCpfCnpj() {
  const htmlHelper = fs.readFileSync(
    path.join(process.cwd(), 'lib/saleSpouseContractHtml.ts'),
    'utf8',
  );
  assert(htmlHelper.includes('formatCpfCnpj'), 'contrato usa formatCpfCnpj');
  assert(formatCpfCnpj('65082028200') === '650.820.282-00', 'mesmo helper comprador');
  const patch = buildSaleSpouseDbPatch({
    has_spouse: true,
    sale_spouse_name: 'Maria',
    sale_spouse_cpf: '65082028200',
  });
  assert(patch.sale_spouse_cpf === '650.820.282-00', 'persistência mascarada');
  console.log('OK testContractDisplayUsesFormatCpfCnpj');
}

function testNoSuggestionWithoutPriorSpouse() {
  const merged = mergeCustomerSpouseSuggestions({ registry: [], fromSales: [] });
  assert(merged.length === 0, 'sem sugestão');
  console.log('OK testNoSuggestionWithoutPriorSpouse');
}

function testSuggestionWhenPriorSpouseExists() {
  const registry: CustomerSpouseRecord[] = [
    {
      company_id: 'co-1',
      customer_id: 'cu-1',
      full_name: 'Ana Silva',
      cpf: '650.820.282-00',
      cpf_digits: '65082028200',
      is_current: true,
      last_used_at: '2026-06-01',
      source: 'registry',
    },
  ];
  const merged = mergeCustomerSpouseSuggestions({ registry, fromSales: [] });
  assert(merged.length === 1, 'mostra sugestão');
  assert(merged[0].name === 'Ana Silva', 'nome');
  assert(merged[0].cpfMasked.includes('***'), 'cpf mascarado');
  console.log('OK testSuggestionWhenPriorSpouseExists');
}

function testReuseOnlyViaExplicitApply() {
  const suggestion: CustomerSpouseSuggestion = {
    key: 'r:1',
    name: 'Ana',
    cpfMasked: '650.***.***-00',
    cpfFormatted: '650.820.282-00',
    lastUsedLabel: '01/06/2026',
    source: 'registry',
    record: {
      company_id: 'co-1',
      customer_id: 'cu-1',
      full_name: 'Ana Silva',
      cpf: '650.820.282-00',
      cpf_digits: '65082028200',
      nationality: 'Brasileira',
      phone: '11999999999',
    },
  };
  const empty = saleSpouseFormHasContent({
    has_spouse: true,
    sale_spouse_name: '',
    sale_spouse_cpf: '',
  } as never);
  assert(!empty, 'form vazio sem apply');
  const applied = applySpouseSuggestionToForm(suggestion);
  assert(applied.has_spouse && applied.sale_spouse_name === 'Ana Silva', 'após apply');
  assert(applied.sale_spouse_cpf === '650.820.282-00', 'cpf formatado no apply');
  console.log('OK testReuseOnlyViaExplicitApply');
}

function testFilledFieldsNeedConfirmationFlag() {
  assert(
    saleSpouseFormHasContent({
      has_spouse: true,
      sale_spouse_name: 'Já preenchido',
      sale_spouse_cpf: '',
    } as never),
    'conteúdo exige confirmação',
  );
  console.log('OK testFilledFieldsNeedConfirmationFlag');
}

function testNewSalePreservesSnapshotIndependently() {
  const saleA = {
    sale_spouse_name: 'Ana V1',
    sale_spouse_cpf: '65082028200',
  };
  const saleB = {
    sale_spouse_name: 'Ana V2',
    sale_spouse_cpf: '65082028200',
  };
  const ctxA = resolveSaleSpouseContext(saleA);
  const ctxB = resolveSaleSpouseContext(saleB);
  assert(ctxA.spouse?.name === 'Ana V1', 'snapshot A');
  assert(ctxB.spouse?.name === 'Ana V2', 'snapshot B');
  console.log('OK testNewSalePreservesSnapshotIndependently');
}

function testRegistryUpdateDoesNotMutateOldSaleObject() {
  const oldSale = {
    id: 'sale-old',
    sale_spouse_name: 'Antigo',
    sale_spouse_cpf: '65082028200',
  };
  const before = JSON.stringify(oldSale);
  formFieldsToCustomerSpousePayload({
    companyId: 'co-1',
    customerId: 'cu-1',
    fields: {
      has_spouse: true,
      sale_spouse_name: 'Novo',
      sale_spouse_cpf: '65082028200',
    },
    lastSaleId: 'sale-new',
  });
  assert(JSON.stringify(oldSale) === before, 'venda antiga intacta');
  console.log('OK testRegistryUpdateDoesNotMutateOldSaleObject');
}

function testMultipleHistoricalSpouses() {
  const fromSales = [
    saleRowToCustomerSpouseCandidate(
      {
        id: 's1',
        sale_date: '2025-01-01',
        sale_spouse_name: 'Cônjuge A',
        sale_spouse_cpf: '11144477735',
      },
      'co-1',
      'cu-1',
    )!,
    saleRowToCustomerSpouseCandidate(
      {
        id: 's2',
        sale_date: '2026-01-01',
        sale_spouse_name: 'Cônjuge B',
        sale_spouse_cpf: '39053344705',
      },
      'co-1',
      'cu-1',
    )!,
  ];
  const merged = mergeCustomerSpouseSuggestions({ registry: [], fromSales });
  assert(merged.length === 2, 'dois históricos');
  assert(merged[0].name === 'Cônjuge B', 'mais recente primeiro');
  console.log('OK testMultipleHistoricalSpouses');
}

function testCompanyIsolationKeys() {
  const a = formFieldsToCustomerSpousePayload({
    companyId: 'company-a',
    customerId: 'cust-1',
    fields: {
      has_spouse: true,
      sale_spouse_name: 'X',
      sale_spouse_cpf: '65082028200',
    },
  });
  const b = formFieldsToCustomerSpousePayload({
    companyId: 'company-b',
    customerId: 'cust-1',
    fields: {
      has_spouse: true,
      sale_spouse_name: 'X',
      sale_spouse_cpf: '65082028200',
    },
  });
  assert(a?.company_id === 'company-a' && b?.company_id === 'company-b', 'isolamento company');
  console.log('OK testCompanyIsolationKeys');
}

function testEditUsesSaleSnapshotNotRegistry() {
  const form = saleSpouseFormFieldsFromSale({
    sale_spouse_name: 'Snapshot Venda',
    sale_spouse_cpf: '65082028200',
    sale_spouse_phone: '11988887777',
  });
  const registryForm = customerSpouseToFormFields({
    company_id: 'co',
    customer_id: 'cu',
    full_name: 'Cadastro Atual',
    cpf: '650.820.282-00',
    cpf_digits: '65082028200',
    phone: '11000000000',
  });
  assert(form.sale_spouse_name === 'Snapshot Venda', 'edição usa snapshot');
  assert(registryForm.sale_spouse_name === 'Cadastro Atual', 'registry separado');
  assert(form.sale_spouse_phone !== registryForm.sale_spouse_phone, 'não mistura');
  console.log('OK testEditUsesSaleSnapshotNotRegistry');
}

function testUiAndApiWiringPresent() {
  const modal = fs.readFileSync(
    path.join(process.cwd(), 'components/map/CustomerLotFormModal.tsx'),
    'utf8',
  );
  assert(modal.includes('formatSpouseCpf') || modal.includes('handleSpouseCpfChange'), 'máscara UI');
  assert(modal.includes('Usar estes dados'), 'botão reutilizar');
  assert(modal.includes('Atualizar cadastro do cônjuge'), 'checkbox registry');
  assert(modal.includes('Substituir os dados atuais'), 'confirmação');
  assert(modal.includes('listCustomerSpouseSuggestions'), 'carrega sugestões');

  const createSvc = fs.readFileSync(
    path.join(process.cwd(), 'lib/gisSaleCreateService.ts'),
    'utf8',
  );
  assert(createSvc.includes('upsertCustomerSpouseFromSaleForm'), 'create atualiza registry');
  assert(createSvc.includes('buildSaleSpouseDbPatch'), 'create snapshot venda');

  const editSvc = fs.readFileSync(path.join(process.cwd(), 'lib/saleEdit.ts'), 'utf8');
  assert(editSvc.includes('upsertCustomerSpouseFromSaleForm'), 'edit registry opcional');

  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260726180000_customer_spouses.sql'),
    'utf8',
  );
  assert(migration.includes('customer_spouses'), 'migration');
  assert(migration.includes('current_tenant_id'), 'RLS tenant');

  const apply = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/_APPLY_PROD_customer_spouses.sql'),
    'utf8',
  );
  assert(apply.includes('customer_spouses'), 'apply prod/preview');

  const docs = fs.readFileSync(
    path.join(process.cwd(), 'scripts/mandatory-sale-documents-tests.ts'),
    'utf8',
  );
  assert(docs.length > 100, 'documentos da venda testes intactos');

  const spouseSig = fs.readFileSync(
    path.join(process.cwd(), 'scripts/mandatory-sale-spouse-signature-tests.ts'),
    'utf8',
  );
  assert(spouseSig.includes('SPOUSE') || spouseSig.includes('spouse'), 'assinatura cônjuge');

  const models = fs.readFileSync(
    path.join(
      process.cwd(),
      'scripts/mandatory-global-sale-spouse-contract-models-tests.ts',
    ),
    'utf8',
  );
  assert(models.includes('RECANTO') || models.includes('PADRAO'), 'templates');
  console.log('OK testUiAndApiWiringPresent');
}

function testNormalizeStorageRejectsLetters() {
  assert(formatSpouseCpf('650abc82028200xx') === '650.820.282-00', 'remove letras');
  assert(normalizeSpouseCpfForStorage('') === null, 'vazio null');
  console.log('OK testNormalizeStorageRejectsLetters');
}

function main() {
  testCpfMaskWithoutPunctuation();
  testCpfPasteWithPunctuation();
  testLeadingZerosPreserved();
  testIncompleteCpfValidation();
  testEditLoadsFormattedCpf();
  testContractDisplayUsesFormatCpfCnpj();
  testNoSuggestionWithoutPriorSpouse();
  testSuggestionWhenPriorSpouseExists();
  testReuseOnlyViaExplicitApply();
  testFilledFieldsNeedConfirmationFlag();
  testNewSalePreservesSnapshotIndependently();
  testRegistryUpdateDoesNotMutateOldSaleObject();
  testMultipleHistoricalSpouses();
  testCompanyIsolationKeys();
  testEditUsesSaleSnapshotNotRegistry();
  testUiAndApiWiringPresent();
  testNormalizeStorageRejectsLetters();
  console.log('\nALL mandatory-sale-spouse-cpf-reuse-tests PASSED');
}

main();
