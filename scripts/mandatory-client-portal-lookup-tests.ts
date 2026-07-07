/**
 * Testes obrigatórios — Portal do Cliente Etapa 2 (lookup seguro).
 * Executar: npx tsx scripts/mandatory-client-portal-lookup-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  assertNoSensitiveLookupFields,
  buildMaskedResultsFromData,
  resolveCompanyDisplayName,
  resolveQuadraLote,
  sanitizeClientPortalLookupResponse,
} from '../lib/clientPortalLookup';
import { maskCustomerName, maskPhone } from '../lib/portal-cliente/masking';
import type { ClientPortalLookupResponse } from '../lib/portal-cliente/types';

const root = path.join(__dirname, '..');

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function read(file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function testMasking(): void {
  assert(maskCustomerName('João Silva') === 'JO*** SI***', 'mask name');
  assert(maskPhone('94999123418') === '(94) 99***-**18', 'mask phone mobile');
  assert(maskPhone('123') === null, 'mask phone invalid');
}

function testNotFoundResponse(): void {
  const response: ClientPortalLookupResponse = { found: false };
  assertNoSensitiveLookupFields(response);
  assert(response.found === false, 'not found shape');
}

function testSingleCompanyResult(): void {
  const response = buildMaskedResultsFromData({
    customers: [
      {
        id: 'cust-1',
        name: 'João Silva',
        phone: '94999123418',
        email: 'joao@email.com',
        tenant_id: 'comp-1',
        company_id: 'comp-1',
      },
    ],
    sales: [
      {
        id: 'sale-1',
        customer_id: 'cust-1',
        company_id: 'comp-1',
        tenant_id: 'comp-1',
        project_id: 'proj-1',
        block_id: 'block-1',
        block_number: '02',
        lot_number: '12',
        status: 'ativo',
      },
    ],
    companies: [
      {
        id: 'comp-1',
        fantasy_name: 'Meneses Imobiliária',
        name: 'Meneses',
      },
    ],
    projects: [{ id: 'proj-1', name: 'Chácaras Castanheira III' }],
    blocks: [{ id: 'block-1', block_name: '02', lot_number: '12' }],
    saasCompanies: [],
    saasSubscriptions: [],
  });

  assert(response.length === 1, 'single result');
  assert(resultHasNoUuid(response[0]), 'no uuid in result object keys values');
  assert(response[0].companyName === 'Meneses Imobiliária', 'company name');
  assert(response[0].projectName === 'Chácaras Castanheira III', 'project name');
  assert(response[0].customerNameMasked === 'JO*** SI***', 'masked customer name');
  assert(response[0].phoneMasked === '(94) 99***-**18', 'masked phone');
  assert(response[0].quadraLote === 'QD 02 LT 12', 'quadra lote');

  const apiShape = sanitizeClientPortalLookupResponse({ found: true, maskedResults: response });
  assertNoSensitiveLookupFields(apiShape);
}

function testMultipleCompaniesResult(): void {
  const response = buildMaskedResultsFromData({
    customers: [
      {
        id: 'cust-1',
        name: 'Maria Souza',
        phone: '94988887777',
        tenant_id: 'comp-1',
        company_id: 'comp-1',
      },
      {
        id: 'cust-2',
        name: 'Maria Souza',
        phone: '94988887777',
        tenant_id: 'comp-2',
        company_id: 'comp-2',
      },
    ],
    sales: [
      {
        id: 'sale-1',
        customer_id: 'cust-1',
        company_id: 'comp-1',
        project_id: 'proj-1',
        status: 'ativo',
      },
      {
        id: 'sale-2',
        customer_id: 'cust-2',
        company_id: 'comp-2',
        project_id: 'proj-2',
        status: 'ativo',
      },
    ],
    companies: [
      { id: 'comp-1', name: 'Meneses Imobiliária' },
      { id: 'comp-2', name: 'Recanto Primavera' },
    ],
    projects: [
      { id: 'proj-1', name: 'Chácaras Castanheira III' },
      { id: 'proj-2', name: 'Recanto Primavera' },
    ],
    blocks: [],
    saasCompanies: [],
    saasSubscriptions: [],
  });

  assert(response.length === 2, 'two companies');
  const companies = new Set(response.map((r) => r.companyName));
  assert(companies.has('Meneses Imobiliária'), 'meneses');
  assert(companies.has('Recanto Primavera'), 'recanto');
  assertNoSensitiveLookupFields({ found: true, maskedResults: response });
}

function testSaasContractResult(): void {
  const response = buildMaskedResultsFromData({
    customers: [],
    sales: [],
    companies: [{ id: 'comp-sv', name: 'SV Topografia' }],
    projects: [],
    blocks: [],
    saasCompanies: [{ id: 'comp-sv', name: 'SV Topografia' }],
    saasSubscriptions: [{ company_id: 'comp-sv', contract_status: 'active' }],
  });

  assert(response.length === 1, 'saas result');
  assert(response[0].linkLabel === 'Contrato SaaS', 'saas label');
  assert(response[0].companyName === 'SV Topografia', 'saas company');
  assertNoSensitiveLookupFields({ found: true, maskedResults: response });
}

function testCancelledSaleExcluded(): void {
  const response = buildMaskedResultsFromData({
    customers: [
      {
        id: 'cust-1',
        name: 'Cliente Teste',
        tenant_id: 'comp-1',
        company_id: 'comp-1',
      },
    ],
    sales: [
      {
        id: 'sale-1',
        customer_id: 'cust-1',
        company_id: 'comp-1',
        status: 'cancelado',
      },
    ],
    companies: [{ id: 'comp-1', name: 'Empresa Teste' }],
    projects: [],
    blocks: [],
    saasCompanies: [],
    saasSubscriptions: [],
  });

  assert(response.length === 1, 'falls back to customer record');
  assert(response[0].linkType === 'customer_record', 'customer only');
}

function testResolveHelpers(): void {
  assert(
    resolveCompanyDisplayName({ fantasy_name: 'Fantasia', name: 'Razão' }) === 'Fantasia',
    'fantasy name',
  );
  assert(
    resolveQuadraLote({ block_number: '03', lot_number: '08' }, null) === 'QD 03 LT 08',
    'quadra lote from sale',
  );
}

function testApiRouteExists(): void {
  const route = read('app/api/portal-cliente/lookup/route.ts');
  assert(route.includes('isClientPortalEnabled'), 'feature flag gate');
  assert(route.includes('lookupClientPortalByDocument'), 'lookup service');
  assert(route.includes('sanitizeClientPortalLookupResponse'), 'sanitize response');
}

function testIsolatedModule(): void {
  const lookup = read('lib/clientPortalLookup.ts');
  assert(!lookup.includes('asaasCompanyChargeService'), 'no asaas import');
  assert(!lookup.includes('saleContractSignatureService'), 'no signature import');
  assert(!lookup.includes('finance_receipts'), 'no finance receipts');
  assert(lookup.includes('buildMaskedResultsFromData'), 'own builder');
}

function testStage1ApiExists(): void {
  assert(fs.existsSync(path.join(root, 'app/api/portal-cliente/lookup/route.ts')), 'lookup route');
}

function resultHasNoUuid(value: unknown): boolean {
  const json = JSON.stringify(value);
  return !/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(json);
}

function main(): void {
  testMasking();
  testNotFoundResponse();
  testSingleCompanyResult();
  testMultipleCompaniesResult();
  testSaasContractResult();
  testCancelledSaleExcluded();
  testResolveHelpers();
  testApiRouteExists();
  testIsolatedModule();
  testStage1ApiExists();
  console.log('mandatory-client-portal-lookup-tests: OK');
}

main();
