/**
 * Etapa 8.4 — Segundo Promitente Vendedor + resolução V1/V2.
 * npx tsx scripts/mandatory-araguaia-esign-v2-second-vendor-tests.ts
 */
import assert from 'node:assert/strict';
import { buildAraguaiaContractContext } from '../lib/araguaiaContractContext';
import {
  buildAraguaiaPartiesPreambleHtml,
} from '../lib/araguaiaContractClauses';
import {
  buildAraguaiaPhysicalSignaturesGridHtml,
} from '../lib/araguaiaContractParties';
import {
  ARAGUAIA_MISSING_LEGAL_REPRESENTATIVE_MESSAGE,
  assertAraguaiaEsignV2LegalRepresentativeReady,
  buildAraguaiaEsignExpectedPartyRoles,
  buildAraguaiaEsignVendorPartyInputs,
  buildAraguaiaIntervenientPartyInput,
} from '../lib/araguaiaContractEsign';
import {
  resolveAraguaiaPromitenteVendors,
  resolveCompanyContractVendors,
} from '../lib/araguaiaCompanyLegalRepresentative';
import {
  isContractSecondVendorComplete,
  normalizeContractSecondVendorForSave,
  parseContractSecondVendorJson,
} from '../lib/contractSecondVendor';
import { buildCompanySettingsSavePayload } from '../lib/companySettingsFields';
import { ARAGUAIA_ESIGN_V2_HOMOLOG_COMPANY_ID } from '../lib/araguaiaEsignV2Gate';

function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  console.log(`  OK ${msg}`);
}

function companyBase(extra: Record<string, unknown> = {}) {
  return {
    id: ARAGUAIA_ESIGN_V2_HOMOLOG_COMPANY_ID,
    razao_social: 'S.V TOPOGRAFIA E PROJETO LTDA',
    name: 'S.V TOPOGRAFIA E PROJETO LTDA',
    cnpj: '12.345.678/0001-90',
    legal_representative: 'JOÃO TESTE',
    representative_cpf: '390.533.447-05',
    legal_representative_email: 'joao.teste@example.com',
    legal_representative_phone: '94991110001',
    legal_representative_role: 'Sócio Administrador',
    address: 'Rua Teste, 100',
    contract_legal_nationality: 'Brasileira',
    contract_legal_marital_status: 'Casado',
    contract_legal_profession: 'Empresário',
    ...extra,
  };
}

const secondComplete = {
  name: 'MARIA SEGUNDA',
  cpf: '529.982.247-25',
  rg: '1234567',
  rgIssuer: 'SSP',
  rgUf: 'PA',
  nationality: 'Brasileira',
  maritalStatus: 'Casada',
  profession: 'Comerciante',
  email: 'maria.segunda@example.com',
  phone: '94992220002',
  address: 'Rua B, 200',
};

console.log('\n======== ETAPA 8.4 — SECOND VENDOR ========');

console.log('\n=== A) Representante Legal João => Vendedor 1 João ===');
{
  const company = companyBase();
  const resolved = resolveCompanyContractVendors({ company });
  ok(!resolved.error, 'A: sem erro');
  ok(resolved.vendors.length === 1, 'A: 1 vendor');
  ok(resolved.vendor1?.name === 'JOÃO TESTE', 'A: V1 João');
  const vendors = buildAraguaiaEsignVendorPartyInputs({
    company,
    mode: 'v2',
  });
  ok(vendors.length === 1 && vendors[0].name === 'JOÃO TESTE', 'A: esign V1 João');
}

console.log('\n=== B) Fixture Maria => novos contratos usam Maria ===');
{
  const company = companyBase({
    legal_representative: 'MARIA TESTE',
    representative_cpf: '529.982.247-25',
    legal_representative_email: 'maria.teste@example.com',
  });
  const vendors = buildAraguaiaEsignVendorPartyInputs({ company, mode: 'v2' });
  ok(vendors[0].name === 'MARIA TESTE', 'B: V1 Maria');
  ok(vendors[0].cpf === '52998224725', 'B: CPF Maria');
}

console.log('\n=== C) Vendedor 2 NULL => 1 VENDOR / 5 parties ===');
{
  const company = companyBase({ contract_second_vendor_json: null });
  const vendors = buildAraguaiaEsignVendorPartyInputs({ company, mode: 'v2' });
  const roles = buildAraguaiaEsignExpectedPartyRoles({ company, mode: 'v2' });
  ok(vendors.length === 1, 'C: 1 VENDOR');
  ok(roles.length === 5, 'C: 5 parties');
  ok(roles.filter((r) => r === 'VENDOR').length === 1, 'C: 1 role VENDOR');
  const ctx = buildAraguaiaContractContext({
    tenant: company,
    customer: { name: 'Comprador', cpf_cnpj: '11144477735' },
    project: { name: 'Araguaia', contract_model: 'ARAGUAIA', seller_parties_json: [] },
    block: { number: '1' },
    sale: { total_value: 100 },
    esignV2: true,
  });
  ok(ctx.sellers.length === 1, 'C: ctx 1 seller');
  const preamble = buildAraguaiaPartiesPreambleHtml(ctx);
  ok(/PROMITENTE VENDEDOR</.test(preamble) || /de <strong>PROMITENTE VENDEDOR<\/strong>/.test(preamble), 'C: denominação singular');
  ok(!/PROMITENTES VENDEDORES/.test(preamble), 'C: sem plural');
  const physical = buildAraguaiaPhysicalSignaturesGridHtml(ctx);
  ok((physical.match(/data-party-role="VENDOR"/g) || []).length === 1, 'C: 1 slot físico');
}

console.log('\n=== D) Vendedor 2 completo => 2 VENDOR / 6 parties ===');
{
  const company = companyBase({ contract_second_vendor_json: secondComplete });
  const vendors = buildAraguaiaEsignVendorPartyInputs({ company, mode: 'v2' });
  const roles = buildAraguaiaEsignExpectedPartyRoles({ company, mode: 'v2' });
  ok(vendors.length === 2, 'D: 2 VENDOR');
  ok(vendors[1].name === 'MARIA SEGUNDA', 'D: V2 Maria');
  ok(roles.length === 6, 'D: 6 parties');
  const ctx = buildAraguaiaContractContext({
    tenant: company,
    customer: { name: 'Comprador', cpf_cnpj: '11144477735' },
    project: { name: 'Araguaia', contract_model: 'ARAGUAIA' },
    block: { number: '1' },
    sale: { total_value: 100 },
    esignV2: true,
  });
  ok(ctx.sellers.length === 2, 'D: ctx 2 sellers');
  const preamble = buildAraguaiaPartiesPreambleHtml(ctx);
  ok(/PROMITENTES VENDEDORES/.test(preamble), 'D: denominação plural');
  const physical = buildAraguaiaPhysicalSignaturesGridHtml(ctx);
  ok((physical.match(/data-party-role="VENDOR"/g) || []).length === 2, 'D: 2 slots físicos');
}

console.log('\n=== E) Parcial => erro validação ===');
{
  const partial = normalizeContractSecondVendorForSave({
    name: 'Só Nome',
    cpf: '',
    email: '',
  });
  ok(!partial.ok, 'E: parcial rejeitado');
  const built = buildCompanySettingsSavePayload(
    companyBase({
      contract_second_vendor_json: { name: 'Só Nome', cpf: '123' },
    }),
    {
      name: '',
      title: '',
      crea: '',
      cau: '',
      cft: '',
      cpf: '',
      phone: '',
      email: '',
      signature_url: '',
      stamp_url: '',
    },
  );
  ok(!built.ok, 'E: save rejeita parcial');
}

console.log('\n=== F) CPF inválido (incompleto) => não salvar ===');
{
  const bad = normalizeContractSecondVendorForSave({
    name: 'Fulano',
    cpf: '1234567890',
  });
  ok(!bad.ok, 'F: CPF incompleto rejeitado');
  ok(!isContractSecondVendorComplete(parseContractSecondVendorJson({ name: 'X', cpf: '123' })), 'F: incomplete');
}

console.log('\n=== G) Sem Representante Legal => erro controlado ===');
{
  const company = companyBase({
    legal_representative: '',
    representative_cpf: '',
  });
  const resolved = resolveCompanyContractVendors({ company });
  ok(resolved.error === ARAGUAIA_MISSING_LEGAL_REPRESENTATIVE_MESSAGE, 'G: mensagem');
  ok(
    assertAraguaiaEsignV2LegalRepresentativeReady({ company }) ===
      ARAGUAIA_MISSING_LEGAL_REPRESENTATIVE_MESSAGE,
    'G: assert',
  );
}

console.log('\n=== H) INTERVENIENTE representada pelo Vendedor 1 ===');
{
  const company = companyBase({ contract_second_vendor_json: secondComplete });
  const intervenient = buildAraguaiaIntervenientPartyInput({
    company,
    mode: 'v2',
  });
  ok(intervenient.name === 'S.V TOPOGRAFIA E PROJETO LTDA', 'H: PJ company');
  ok(
    intervenient.signatureData.representative_name === 'JOÃO TESTE',
    'H: rep = V1',
  );
  ok(
    intervenient.signatureData.representative_name !== 'MARIA SEGUNDA',
    'H: rep ≠ V2',
  );
}

console.log('\n=== I) Path V2 sem Daniel/Aldenise/R R ===');
{
  const company = companyBase({ contract_second_vendor_json: secondComplete });
  const blob = JSON.stringify({
    vendors: buildAraguaiaEsignVendorPartyInputs({ company, mode: 'v2' }),
    intervenient: buildAraguaiaIntervenientPartyInput({ company, mode: 'v2' }),
    sellers: resolveAraguaiaPromitenteVendors({
      company,
      project: {
        seller_parties_json: [
          { name: 'Daniel Roberto Rivelino de Sousa', cpf: '820.912.262-20', order: 1 },
          { name: 'Aldenise Alves Sousa', cpf: '856.560.112-91', order: 2 },
        ],
      },
      contractModel: 'ARAGUAIA',
      mode: 'v2',
    }),
  });
  ok(!/Daniel Roberto Rivelino de Sousa/i.test(blob), 'I: sem Daniel');
  ok(!/Aldenise Alves Sousa/i.test(blob), 'I: sem Aldenise');
  ok(!/R R NEG[OÓ]CIOS/i.test(blob), 'I: sem R R');
  ok(blob.includes('JOÃO TESTE'), 'I: usa João');
  ok(blob.includes('MARIA SEGUNDA'), 'I: usa Maria V2');
}

console.log('\n=== J) seller_parties_json não sobrescreve V1 no V2 ===');
{
  const company = companyBase();
  const sellers = resolveAraguaiaPromitenteVendors({
    company,
    project: {
      seller_parties_json: [
        { name: 'OUTRO DO PROJETO', cpf: '111.444.777-35', order: 1 },
      ],
    },
    mode: 'v2',
  });
  ok(sellers[0].name === 'JOÃO TESTE', 'J: V1 = legal, não projeto');
}

console.log('\n=== K) Gate OFF / legacy permanece com fallback ===');
{
  const vendors = buildAraguaiaEsignVendorPartyInputs({ mode: 'legacy' });
  ok(vendors.length === 2, 'K: legacy 2 vendors');
  ok(/Daniel/i.test(vendors[0].name), 'K: Daniel legado');
}

console.log('\n=== L) Tudo vazio => NULL no save ===');
{
  const empty = normalizeContractSecondVendorForSave({
    name: '',
    cpf: '',
    rg: '',
    email: '',
  });
  ok(empty.ok && empty.value === null, 'L: empty → null');
}

console.log('\n======== ETAPA 8.4 SECOND VENDOR OK ========\n');
