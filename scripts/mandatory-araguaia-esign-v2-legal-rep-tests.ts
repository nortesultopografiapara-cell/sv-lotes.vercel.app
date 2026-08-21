/**
 * Etapa 8.1 — PROMITENTE VENDEDOR / Representante Legal dinâmico.
 * npx tsx scripts/mandatory-araguaia-esign-v2-legal-rep-tests.ts
 */
import assert from 'node:assert/strict';
import { buildAraguaiaContractContext } from '../lib/araguaiaContractContext';
import {
  buildAraguaiaPhysicalSignaturesGridHtml,
  buildAraguaiaSignaturesHtml,
} from '../lib/araguaiaContractParties';
import {
  buildAraguaiaEsignExpectedPartyRoles,
  buildAraguaiaEsignVendorPartyInputs,
  buildAraguaiaIntervenientPartyInput,
} from '../lib/araguaiaContractEsign';
import { buildAraguaiaElectronicSignatureSlotsFromParties } from '../lib/araguaiaContractElectronicSignatures';
import {
  resolveAraguaiaCompanyLegalRepresentative,
  resolveAraguaiaPromitenteVendors,
} from '../lib/araguaiaCompanyLegalRepresentative';
import { resolveAraguaiaIntervenientIdentity } from '../lib/araguaiaIntervenientIdentity';

function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  console.log(`  OK ${msg}`);
}

function companyWithLegalRep(input: {
  name: string;
  cpf: string;
  email?: string;
  phone?: string;
  role?: string;
  razao?: string;
  cnpj?: string;
}) {
  return {
    id: 'f26f2331-1885-4ac6-8d0e-4131cc8a8014',
    razao_social: input.razao || 'S.V TOPOGRAFIA E PROJETO LTDA',
    name: input.razao || 'S.V TOPOGRAFIA E PROJETO LTDA',
    cnpj: input.cnpj || '12.345.678/0001-90',
    legal_representative: input.name,
    representative_cpf: input.cpf,
    legal_representative_email: input.email || null,
    legal_representative_phone: input.phone || null,
    legal_representative_role: input.role || 'Sócio Administrador',
    address: 'Rua Teste, 100',
  };
}

console.log('\n======== ETAPA 8.1 — LEGAL REPRESENTATIVE ========');

console.log('\n=== A) JOÃO TESTE → VENDOR + INTERVENIENT rep ===');
{
  const company = companyWithLegalRep({
    name: 'JOÃO TESTE',
    cpf: '390.533.447-05',
    email: 'joao.teste@example.com',
    phone: '94991110001',
  });
  const legal = resolveAraguaiaCompanyLegalRepresentative(company);
  ok(legal.usedCompanySource, 'A: legal rep da company');
  ok(legal.name === 'JOÃO TESTE', 'A: nome João');
  ok(legal.cpfDigits === '39053344705', 'A: CPF João');
  ok(legal.email === 'joao.teste@example.com', 'A: e-mail João');

  const vendors = buildAraguaiaEsignVendorPartyInputs({ company });
  ok(vendors.length === 1, 'A: 1 VENDOR (representante legal)');
  ok(vendors[0].name === 'JOÃO TESTE', 'A: VENDOR = João');
  ok(vendors[0].cpf === '39053344705', 'A: VENDOR CPF João');
  ok(vendors[0].email === 'joao.teste@example.com', 'A: VENDOR e-mail');
  ok(!/Daniel/i.test(vendors[0].name), 'A: sem Daniel');
  ok(!/Aldenise/i.test(vendors.map((v) => v.name).join(' ')), 'A: sem Aldenise');

  const intervenient = buildAraguaiaIntervenientPartyInput({ company });
  ok(
    intervenient.name === 'S.V TOPOGRAFIA E PROJETO LTDA',
    'A: INTERVENIENT = company',
  );
  ok(
    intervenient.signatureData.representative_name === 'JOÃO TESTE',
    'A: rep INTERVENIENT = João',
  );
  ok(
    intervenient.signatureData.representative_cpf === '39053344705',
    'A: rep CPF = João',
  );
  ok(!/R\s*R\s*NEG/i.test(intervenient.name), 'A: INTERVENIENT sem R R');

  const ctx = buildAraguaiaContractContext({
    tenant: company,
    customer: { name: 'Comprador', cpf_cnpj: '11144477735' },
    project: { name: 'Araguaia', contract_model: 'ARAGUAIA' },
    block: { number: '1', block_name: '01' },
    sale: { total_value: 100 },
  });
  ok(ctx.sellers.length === 1, 'A: preâmbulo 1 promitente');
  ok(ctx.sellers[0].name === 'JOÃO TESTE', 'A: seller João');
  ok(ctx.intervenienteRepresentativeName === 'JOÃO TESTE', 'A: ctx rep João');
  const preambleHtml = buildAraguaiaSignaturesHtml(ctx);
  const physical = buildAraguaiaPhysicalSignaturesGridHtml(ctx);
  ok(physical.includes('JOÃO TESTE'), 'A: físico João');
  ok(physical.includes('S.V TOPOGRAFIA'), 'A: físico Topografia');
  ok(!/Daniel Roberto/i.test(physical), 'A: físico sem Daniel');
  ok(!/Aldenise/i.test(physical), 'A: físico sem Aldenise');
  ok(!/R\s*R\s*NEG/i.test(physical), 'A: físico sem R R');
  void preambleHtml;
}

console.log('\n=== B) MARIA TESTE — troca fixture sem mudar código ===');
{
  const company = companyWithLegalRep({
    name: 'MARIA TESTE',
    cpf: '529.982.247-25',
    email: 'maria.teste@example.com',
    phone: '94992220002',
    razao: 'EMPRESA MARIA LTDA',
    cnpj: '98.765.432/0001-10',
  });
  const vendors = buildAraguaiaEsignVendorPartyInputs({ company });
  const intervenient = buildAraguaiaIntervenientPartyInput({ company });
  const id = resolveAraguaiaIntervenientIdentity({ company });
  ok(vendors[0].name === 'MARIA TESTE', 'B: VENDOR Maria');
  ok(vendors[0].cpf === '52998224725', 'B: CPF Maria');
  ok(intervenient.name === 'EMPRESA MARIA LTDA', 'B: PJ Maria company');
  ok(
    intervenient.signatureData.representative_name === 'MARIA TESTE',
    'B: rep Maria',
  );
  ok(id.representativeName === 'MARIA TESTE', 'B: identity Maria');
  ok(!/JOÃO/i.test(vendors[0].name), 'B: não ficou João');
  ok(!/Daniel/i.test(vendors[0].name), 'B: sem Daniel');
}

console.log('\n=== C) Sem literal Daniel/Aldenise/R R com company própria ===');
{
  const company = companyWithLegalRep({
    name: 'CARLOS DINAMICO',
    cpf: '111.444.777-35',
  });
  const blob = JSON.stringify({
    vendors: buildAraguaiaEsignVendorPartyInputs({ company }),
    intervenient: buildAraguaiaIntervenientPartyInput({ company }),
    sellers: resolveAraguaiaPromitenteVendors({
      company,
      contractModel: 'ARAGUAIA',
    }),
    roles: buildAraguaiaEsignExpectedPartyRoles({ company }),
  });
  ok(!/Daniel Roberto Rivelino de Sousa/i.test(blob), 'C: sem Daniel literal');
  ok(!/Aldenise Alves Sousa/i.test(blob), 'C: sem Aldenise literal');
  ok(!/R R NEG[OÓ]CIOS/i.test(blob), 'C: sem R R literal');
  ok(blob.includes('CARLOS DINAMICO'), 'C: usa Carlos');
}

console.log('\n=== D) Fallback legado sem Representante Legal ===');
{
  const vendors = buildAraguaiaEsignVendorPartyInputs({});
  ok(vendors.length === 2, 'D: fallback 2 VENDOR legado');
  ok(/Daniel/i.test(vendors[0].name), 'D: Daniel no fallback');
  ok(/Aldenise/i.test(vendors[1].name), 'D: Aldenise no fallback');
}

console.log('\n=== E) ELECTRONIC_SIGNED coerente com João ===');
{
  const company = companyWithLegalRep({
    name: 'JOÃO TESTE',
    cpf: '390.533.447-05',
  });
  const vendor = buildAraguaiaEsignVendorPartyInputs({ company })[0];
  const intervenient = buildAraguaiaIntervenientPartyInput({ company });
  const parties = [
    {
      id: 'b',
      role: 'BUYER',
      signer_name: 'Comprador',
      signer_cpf: '11144477735',
      status: 'SIGNED',
      signed_at: '2026-08-21T12:00:00Z',
      signature_data: { signature_event_id: 'ev-b' },
    },
    {
      id: 'v1',
      role: 'VENDOR',
      signer_name: vendor.name,
      signer_cpf: vendor.cpf,
      status: 'SIGNED',
      signed_at: '2026-08-21T12:01:00Z',
      signature_data: { signature_event_id: 'ev-v1' },
    },
    {
      id: 'i',
      role: 'INTERVENIENT',
      signer_name: intervenient.name,
      signer_cpf: intervenient.cnpj,
      status: 'SIGNED',
      signed_at: '2026-08-21T12:02:00Z',
      signature_data: {
        ...intervenient.signatureData,
        signature_event_id: 'ev-i',
      },
    },
    {
      id: 'w1',
      role: 'WITNESS_1',
      signer_name: 'W1',
      signer_cpf: '39053344705',
      status: 'SIGNED',
      signed_at: '2026-08-21T12:03:00Z',
      signature_data: { signature_event_id: 'ev-w1' },
    },
    {
      id: 'w2',
      role: 'WITNESS_2',
      signer_name: 'W2',
      signer_cpf: '52998224725',
      status: 'SIGNED',
      signed_at: '2026-08-21T12:04:00Z',
      signature_data: { signature_event_id: 'ev-w2' },
    },
  ];
  const slots = buildAraguaiaElectronicSignatureSlotsFromParties(parties as never);
  const ctx = buildAraguaiaContractContext({
    tenant: company,
    customer: { name: 'Comprador', cpf_cnpj: '11144477735' },
    project: { name: 'Araguaia', contract_model: 'ARAGUAIA' },
    block: { number: '1', block_name: '01' },
    sale: { total_value: 100 },
  });
  const electronic = buildAraguaiaSignaturesHtml(ctx, {
    signatureMode: 'ELECTRONIC_SIGNED',
    electronicSlots: slots,
  });
  ok(electronic.includes('JOÃO TESTE'), 'E: João no resumo');
  ok(electronic.includes('S.V TOPOGRAFIA'), 'E: company no resumo');
  ok(!/Daniel Roberto/i.test(electronic), 'E: sem Daniel no eletrônico');
  ok(slots.some((s) => s.role === 'VENDOR' && s.name === 'JOÃO TESTE'), 'E: slot VENDOR');
  ok(
    slots.some(
      (s) =>
        s.role === 'INTERVENIENT' &&
        /JOÃO TESTE/.test(String(s.extraMeta?.join(' ') || '')),
    ),
    'E: slot INTERVENIENT rep João',
  );
}

console.log('\n✅ mandatory-araguaia-esign-v2-legal-rep-tests OK\n');
