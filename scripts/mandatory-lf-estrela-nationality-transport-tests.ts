/**
 * Transporte da nacionalidade do formulário → LF ESTRELA + RG vendedor 2.
 * npx tsx scripts/mandatory-lf-estrela-nationality-transport-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  composeLfEstrelaContractHtml,
  formatLfEstrelaMissingMessage,
} from '../lib/lfEstrelaEmission';
import { resolveCustomPreviewValues } from '../lib/customContractPreviewResolver';
import {
  customerPatchFromForm,
  mergeCustomerData,
  omitUnsupportedCustomerColumns,
  resolveBuyerNationality,
} from '../lib/customerIdentity';
import { resolveLfSecondVendor } from '../lib/lfImoveisContractConfig';
import { mergeContractSecondVendorFields } from '../lib/contractSecondVendor';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

const TENANT = '3052a000-e8b9-43a4-b8ab-91a4392ffcbc';

function testFormWinsOverEmptyCustomer() {
  const form = { nationality: 'Brasileira' };
  const customer = { name: 'SEVERINO', nationality: '', nacionalidade: null };
  const resolved = resolveBuyerNationality({ form, customer });
  assert(resolved === 'Brasileira', `A: form preenche, got ${resolved}`);

  const merged = mergeCustomerData(customerPatchFromForm(form), customer);
  const values = resolveCustomPreviewValues({
    tenantId: TENANT,
    customer: merged,
    sale: { company_id: TENANT },
  });
  assert(values.CLIENT_NATIONALITY === 'Brasileira', 'A: contrato recebe Brasileira');
  console.log('OK A form Brasileira + customer vazio');
}

function testCustomerPersisted() {
  const resolved = resolveBuyerNationality({
    form: { nationality: '' },
    customer: { nationality: 'Brasileira' },
  });
  assert(resolved === 'Brasileira', 'B: customer persistido');
  const values = resolveCustomPreviewValues({
    tenantId: TENANT,
    customer: { nationality: 'Brasileira' },
    sale: { company_id: TENANT },
  });
  assert(values.CLIENT_NATIONALITY === 'Brasileira', 'B: resolver lê customers.nationality');
  console.log('OK B customer Brasileira');
}

function testEmptyFormUsesCustomer() {
  const resolved = resolveBuyerNationality({
    form: { nationality: '   ' },
    customer: { nationality: 'Portuguesa' },
  });
  assert(resolved === 'Portuguesa', 'C: form vazio usa customer');
  console.log('OK C form vazio + customer preenchido');
}

function testAllEmptyBlocks() {
  const resolved = resolveBuyerNationality({
    form: {},
    customer: { nationality: '', nacionalidade: null },
    client: {},
    sale: {},
  });
  assert(resolved === '', 'D: todas vazias');
  const composed = composeLfEstrelaContractHtml(
    '<p>{{CLIENT_NATIONALITY}}</p>',
    { CLIENT_NATIONALITY: resolved, CLIENT_NAME: 'X', SELLER_2_NAME: 'Y', SELLER_2_CPF_CNPJ: '1' },
    { mode: 'final', sale: { has_spouse: false }, requireComplete: false },
  );
  assert(
    composed.missing.includes('Nacionalidade do comprador'),
    'D: bloqueia nacionalidade',
  );
  console.log('OK D todas as fontes vazias bloqueiam');
}

function testRetryDoesNotDropNationality() {
  const payload = {
    name: 'SEVERINO',
    nationality: 'Brasileira',
    nacionalidade: 'Brasileira',
  };
  const stripped = omitUnsupportedCustomerColumns(
    payload,
    `Could not find the 'nacionalidade' column of 'customers' in the schema cache`,
  );
  assert(stripped.nationality === 'Brasileira', 'retry mantém nationality');
  assert(!('nacionalidade' in stripped), 'retry remove só nacionalidade');
  const patch = customerPatchFromForm({ nationality: 'Brasileira', name: 'X' });
  assert(patch.nationality === 'Brasileira', 'form grava nationality');
  assert(patch.nacionalidade === undefined, 'customers não recebe coluna nacionalidade');
  console.log('OK persistência nationality vs nacionalidade');
}

function testSeller2RgFromConfig() {
  const resolved = resolveLfSecondVendor({
    project: {
      lf_contract_config_json: {
        secondVendor: {
          name: 'ANTONIO FERREIRA SILVA',
          cpf: '718.773.122-15',
          rg: '9988776',
          nationality: 'Brasileiro',
          maritalStatus: 'Casado(a)',
          profession: 'Empresário',
          address: 'Parauapebas/PA',
        },
      },
    },
  });
  assert(resolved.vendor.rg === '9988776', 'E: RG da config do empreendimento');
  const values = resolveCustomPreviewValues({
    tenantId: TENANT,
    company: { razao_social: 'L.F. IMÓVEIS LTDA' },
    project: {
      lf_contract_config_json: {
        secondVendor: {
          name: 'ANTONIO FERREIRA SILVA',
          cpf: '718.773.122-15',
          rg: '9988776',
        },
        participation: { firstVendorPercent: 40, secondVendorPercent: 60 },
      },
    },
    sale: { company_id: TENANT, contract_model: 'ESTRELA_DO_SUL' },
  });
  assert(values.SELLER_2_RG === '9988776', 'E: resolver recebe RG');
  console.log('OK E vendedor 2 RG preenchido na configuração');
}

function testSeller2RgEmptyBlocks() {
  const resolved = resolveLfSecondVendor({
    project: {
      lf_contract_config_json: {
        secondVendor: {
          name: 'ANTONIO FERREIRA SILVA',
          cpf: '718.773.122-15',
          rg: '',
        },
      },
    },
  });
  assert(resolved.vendor.rg === '', 'F: RG realmente vazio');
  const composed = composeLfEstrelaContractHtml(
    '<p>{{SELLER_2_RG}}</p>',
    {
      SELLER_2_NAME: 'ANTONIO FERREIRA SILVA',
      SELLER_2_CPF_CNPJ: '718.773.122-15',
      SELLER_2_RG: resolved.vendor.rg,
    },
    { mode: 'final', sale: { has_spouse: false }, requireComplete: false },
  );
  assert(composed.missing.includes('RG do vendedor 2'), 'F: bloqueia RG vendedor 2');
  const msg = formatLfEstrelaMissingMessage(composed.missing);
  assert(msg.includes('• RG do vendedor 2'), 'F: mensagem aponta o campo');
  console.log('OK F vendedor 2 RG vazio bloqueia');
}

function testSeller2EmptyDoesNotOverrideFilled() {
  const merged = mergeContractSecondVendorFields(
    { name: 'ANTONIO FERREIRA SILVA', cpf: '718.773.122-15', rg: '', rgIssuer: '', rgUf: '', nationality: '', maritalStatus: '', profession: '', email: '', phone: '', address: '' },
    { name: '', cpf: '', rg: '9988776', rgIssuer: '', rgUf: '', nationality: '', maritalStatus: '', profession: '', email: '', phone: '', address: '' },
  );
  assert(merged.rg === '9988776', 'objeto vazio não apaga RG preenchido');
  const fromParties = resolveLfSecondVendor({
    sale: {
      lf_contract_snapshot_json: {
        version: 1,
        hasSecondVendor: true,
        secondVendor: {
          name: 'ANTONIO FERREIRA SILVA',
          cpf: '718.773.122-15',
          rg: '',
        },
      },
    },
    project: {
      seller_parties_json: [
        { name: 'LF' },
        { name: 'ANTONIO FERREIRA SILVA', cpf: '718.773.122-15', rg: '1234567' },
      ],
    },
  });
  assert(fromParties.vendor.rg === '1234567', 'snapshot sem RG não apaga seller_parties');
  console.log('OK merge RG vendedor 2');
}

function testNoSpouse() {
  const composed = composeLfEstrelaContractHtml(
    '<div data-sv-if="spouse">COMPRADOR 2 {{SPOUSE_NAME}}</div><p>{{CLIENT_NATIONALITY}}</p>',
    { CLIENT_NATIONALITY: 'Brasileira', SPOUSE_NAME: '', SPOUSE_CPF: '' },
    {
      mode: 'final',
      sale: { has_spouse: false, sale_spouse_name: '', sale_spouse_cpf: '' },
      requireComplete: false,
    },
  );
  assert(!composed.missing.includes('Nome do cônjuge'), 'G: sem cônjuge não exige spouse');
  assert(!/COMPRADOR 2/i.test(composed.html), 'G: não renderiza COMPRADOR 2');
  console.log('OK G sem cônjuge');
}

function testSourceWiring() {
  const identity = read('lib/customerIdentity.ts');
  const create = read('lib/gisSaleCreateService.ts');
  const saleContract = read('lib/lfEstrelaSaleContract.ts');
  const regen = read('lib/contractRegeneration.ts');
  assert(identity.includes('resolveBuyerNationality'), 'helper de precedência');
  assert(identity.includes('omitUnsupportedCustomerColumns'), 'retry não descarta nationality');
  assert(!identity.includes('patch.nacionalidade = form.nationality'), 'não grava nacionalidade em customers');
  assert(create.includes('customerFormOverlay'), 'GIS envia overlay do formulário');
  assert(create.includes('customerPatchFromForm'), 'overlay sai do form confirmado');
  assert(saleContract.includes('[LF ESTRELA NATIONALITY TRACE]'), 'trace DEVELOP');
  assert(regen.includes('customerFormOverlay'), 'regeneração aplica overlay');
  assert(!saleContract.includes('CLIENT_NATIONALITY = \'Brasileira\''), 'sem hardcode');
  console.log('OK wiring');
}

function main() {
  testFormWinsOverEmptyCustomer();
  testCustomerPersisted();
  testEmptyFormUsesCustomer();
  testAllEmptyBlocks();
  testRetryDoesNotDropNationality();
  testSeller2RgFromConfig();
  testSeller2RgEmptyBlocks();
  testSeller2EmptyDoesNotOverrideFilled();
  testNoSpouse();
  testSourceWiring();
  console.log('OK — mandatory-lf-estrela-nationality-transport-tests passed');
}

main();
