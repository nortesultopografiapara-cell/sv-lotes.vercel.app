/**
 * Testes — resolução do nome da Loteadora no Portal do Cliente.
 * Executar: npx tsx scripts/mandatory-client-portal-sale-loteadora-tests.ts
 */

import fs from 'fs';
import path from 'path';
import { getCompanyDisplayName } from '../lib/contractCompanyDisplay';
import {
  extractLoteadoraNameFromContractHtml,
  resolveSaleLoteadoraDisplayName,
  resolveVendorDisplayNameFromCompany,
} from '../lib/portal-cliente/saleLoteadora';

const root = path.join(__dirname, '..');

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function read(file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function classicContractHtml(vendorName: string): string {
  return `
    <div class="contract-clause">
      <p>
        <strong>Promitente Proprietário Vendedor:</strong> <strong>${vendorName}</strong>, CNPJ n° 12.345.678/0001-99, Empresa Constituída...
      </p>
    </div>
  `;
}

function testExtractFromClassicHtml(): void {
  const name = 'S.V Topografia e Projeto LTDA';
  const extracted = extractLoteadoraNameFromContractHtml(classicContractHtml(name));
  assert(extracted === name, 'extrai Promitente Proprietário Vendedor');
}

function testExtractFromSv2Style(): void {
  const html = `<p>PROMITENTE VENDEDOR(A): <strong>Ivanilde Silva Moreira</strong>, CPF...</p>`;
  assert(
    extractLoteadoraNameFromContractHtml(html) === 'Ivanilde Silva Moreira',
    'extrai PROMITENTE VENDEDOR(A) PF',
  );
}

function testPjSvTopografia(): void {
  const company = {
    name: 'Empresa',
    fantasy_name: '',
    razao_social: 'S.V Topografia e Projeto LTDA',
  };
  const resolved = resolveSaleLoteadoraDisplayName({ company });
  assert(resolved.toLowerCase().includes('s.v topografia'), 'PJ SV via razão social (ignora name Empresa)');
  assert(resolved !== 'Empresa', 'PJ SV não retorna Empresa');
  assert(
    resolveSaleLoteadoraDisplayName({
      company: { name: 'Empresa' },
      contractHtml: classicContractHtml('S.V Topografia e Projeto LTDA'),
    }) === 'S.V Topografia e Projeto LTDA',
    'PJ SV via HTML do contrato quando cadastro genérico',
  );
}

function testPjMeneses(): void {
  const company = {
    name: 'Meneses Imobiliária LTDA',
    fantasy_name: 'Meneses Imobiliária LTDA',
    razao_social: 'Meneses Imobiliária LTDA',
  };
  const resolved = resolveSaleLoteadoraDisplayName({ company });
  assert(resolved === getCompanyDisplayName(company), 'PJ Meneses alinhado ao contrato');
  assert(resolved.toLowerCase().includes('meneses'), 'PJ Meneses contém nome');
}

function testPfIvanilde(): void {
  const company = {
    name: 'Ivanilde Silva Moreira',
    fantasy_name: '',
    razao_social: '',
    cnpj: '12345678901',
  };
  const resolved = resolveSaleLoteadoraDisplayName({ company });
  assert(resolved === getCompanyDisplayName(company), 'PF alinhado ao contrato getCompanyDisplayName');
  assert(resolved.toLowerCase().includes('ivanilde'), 'PF nome completo');
  assert(!/^empresa$/i.test(resolved), 'PF sem prefixo Empresa');
}

function testExplicitSellerAndContractParty(): void {
  assert(
    resolveSaleLoteadoraDisplayName({
      explicitSellerName: 'Ivanilde Silva Moreira',
      company: { name: 'Empresa' },
      contractHtml: classicContractHtml('S.V Topografia e Projeto LTDA'),
    }) === 'Ivanilde Silva Moreira',
    'vendedor explícito tem prioridade',
  );
}

function testLegacyFallbackAndEmpty(): void {
  const tenantCompany = {
    name: 'S.V Topografia e Projeto LTDA',
    fantasy_name: '',
  };
  assert(
    resolveSaleLoteadoraDisplayName({
      company: { name: 'Empresa', fantasy_name: '', razao_social: '' },
      tenantCompany,
    }) === getCompanyDisplayName(tenantCompany),
    'fallback tenant quando sale company genérica',
  );
  assert(
    resolveSaleLoteadoraDisplayName({}) === 'Não informado',
    'ausência total → Não informado',
  );
  assert(
    resolveSaleLoteadoraDisplayName({ company: null, contractHtml: null }) === 'Não informado',
    'nulls → Não informado',
  );
}

function testNeverReturnsEmpresa(): void {
  const cases = [
    resolveSaleLoteadoraDisplayName({ company: { name: 'Empresa' } }),
    resolveSaleLoteadoraDisplayName({ company: { name: '', fantasy_name: 'Empresa' } }),
    resolveVendorDisplayNameFromCompany({ name: 'Empresa' }),
    resolveSaleLoteadoraDisplayName({ contractHtml: classicContractHtml('Empresa') }),
  ];
  for (const value of cases) {
    assert(value !== 'Empresa', `nunca Empresa: got ${value}`);
    assert(!/^empresa$/i.test(value), `nunca Empresa case: ${value}`);
  }
}

function testPortalEqualsContractSource(): void {
  const vendor = 'S.V Topografia e Projeto LTDA';
  const html = classicContractHtml(vendor);
  const portalName = resolveSaleLoteadoraDisplayName({
    company: { name: 'Empresa' },
    contractHtml: html,
  });
  const fromHtml = extractLoteadoraNameFromContractHtml(html);
  assert(portalName === fromHtml, 'Portal = nome do HTML do contrato');
  assert(portalName === vendor, 'Portal = Promitente Proprietário Vendedor');
}

function testUiAndWiring(): void {
  const ui = read('components/portal-cliente/ClientPortalDashboard.tsx');
  assert(ui.includes('>Loteadora<'), 'rótulo Loteadora no card');
  assert(!ui.includes('>Imobiliária<'), 'sem rótulo Imobiliária');

  const dashboard = read('lib/portal-cliente/dashboard.ts');
  assert(dashboard.includes('resolveSaleLoteadoraDisplayName'), 'dashboard usa resolver único');
  assert(dashboard.includes('readStoredContractHtml'), 'lê HTML persistido');
  assert(!dashboard.includes("companyName: resolveCompanyDisplayName"), 'não usa só company lookup antigo');

  const helper = read('lib/portal-cliente/saleLoteadora.ts');
  assert(helper.includes('getCompanyDisplayName'), 'reutiliza helper do contrato');
  assert(helper.includes('Não informado'), 'fallback Não informado');
}

function main(): void {
  testExtractFromClassicHtml();
  testExtractFromSv2Style();
  testPjSvTopografia();
  testPjMeneses();
  testPfIvanilde();
  testExplicitSellerAndContractParty();
  testLegacyFallbackAndEmpty();
  testNeverReturnsEmpresa();
  testPortalEqualsContractSource();
  testUiAndWiring();
  console.log('OK mandatory-client-portal-sale-loteadora-tests');
}

main();
