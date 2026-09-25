/**
 * LF / ESTRELA_DO_SUL — VENDOR 1 interno + paridade de links WhatsApp.
 * npx tsx scripts/mandatory-lf-internal-vendor-share-tests.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildEstrelaDoSulEsignVendorPartyInputs,
  isEstrelaInternalCompanyVendorParty,
  toEstrelaDoSulVendorPartyCreateInputs,
} from '../lib/estrelaDoSulContractEsign';
import { toPublicPartyViews } from '../lib/saleContractSignatureParties';
import type { ContractSignaturePartyRow } from '../lib/saleContractSignaturePartyTypes';
import { computeAggregateSaleSignatureStatus } from '../lib/saleContractSignaturePartyStatus';
import { saleSignatureStatusLabel } from '../lib/saleContractSignatureStatus';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

function party(
  partial: Partial<ContractSignaturePartyRow> &
    Pick<ContractSignaturePartyRow, 'id' | 'role' | 'signer_name'>,
): ContractSignaturePartyRow {
  return {
    company_id: 'c',
    contract_signature_id: 's',
    contract_id: 'ct',
    sale_id: null,
    signer_cpf: null,
    signer_phone: null,
    signer_email: null,
    signature_token_hash: null,
    signature_url: null,
    status: 'PENDING',
    sent_at: null,
    viewed_at: null,
    signed_at: null,
    cancelled_at: null,
    expires_at: null,
    signature_data: {},
    ip_address: null,
    user_agent: null,
    signature_hash: null,
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

const lfCompany = {
  razao_social: 'LF IMÓVEIS LTDA',
  legal_representative: 'LUZIA FELIPE DE SOUSA',
  representative_cpf: '11144477735',
  contract_model: 'ESTRELA_DO_SUL',
  contract_second_vendor_json: {
    name: 'ANA VITORIA OLIVEIRA FRANÇA',
    cpf: '52998224725',
    email: 'ana@test.com',
    phone: '94991001122',
  },
};

function testCreateInputsHideCompanyVendorToken() {
  const vendors = buildEstrelaDoSulEsignVendorPartyInputs({ company: lfCompany });
  const inputs = toEstrelaDoSulVendorPartyCreateInputs(vendors);
  assert(inputs.length === 2, 'BUYER flow: 2 VENDOR (LF + segundo)');
  assert(inputs[0].withPublicToken === false, 'VENDOR 1 sem token público');
  assert(inputs[0].signatureData?.internalAdminSign === true, 'VENDOR 1 flag interna');
  assert(inputs[1].withPublicToken === true, 'VENDOR 2 com token público');
  assert(!inputs[1].signatureData?.internalAdminSign, 'VENDOR 2 não é interno');
}

function testIdentifyInternalVendorNewAndLegacy() {
  const luzia = party({
    id: 'v1',
    role: 'VENDOR',
    signer_name: 'LUZIA FELIPE DE SOUSA',
    signer_cpf: '11144477735',
    signature_url: 'https://preview.example/sign/sale/tok-luzia',
    signature_data: {},
  });
  const ana = party({
    id: 'v2',
    role: 'VENDOR',
    signer_name: 'ANA VITORIA OLIVEIRA FRANÇA',
    signer_cpf: '52998224725',
    signature_url: 'https://preview.example/sign/sale/tok-ana',
  });
  const flagged = party({
    id: 'v1-new',
    role: 'VENDOR',
    signer_name: 'LUZIA FELIPE DE SOUSA',
    signature_data: { internalAdminSign: true, estrelaCompanyVendor: true },
  });

  assert(
    isEstrelaInternalCompanyVendorParty(luzia, [luzia, ana], {
      contractModel: 'ESTRELA_DO_SUL',
      company: lfCompany,
    }),
    'processo legado: 1º VENDOR LF é interno',
  );
  assert(
    !isEstrelaInternalCompanyVendorParty(ana, [luzia, ana], {
      contractModel: 'ESTRELA_DO_SUL',
      company: lfCompany,
    }),
    'VENDOR 2 Ana permanece externa',
  );
  assert(
    isEstrelaInternalCompanyVendorParty(flagged, [flagged, ana], {
      contractModel: 'ARAGUAIA',
    }),
    'flag interna vale mesmo sem modelo no options',
  );
}

function testLfShareViewsHideLuziaKeepAna() {
  const views = toPublicPartyViews(
    [
      party({
        id: 'b',
        role: 'BUYER',
        signer_name: 'Comprador',
        signature_url: 'https://x/sign/sale/tok-buyer',
      }),
      party({
        id: 's',
        role: 'SPOUSE',
        signer_name: 'Cônjuge',
        signature_url: 'https://x/sign/sale/tok-spouse',
      }),
      party({
        id: 'v1',
        role: 'VENDOR',
        signer_name: 'LUZIA FELIPE DE SOUSA',
        signer_cpf: '11144477735',
        signature_url: 'https://x/sign/sale/tok-luzia',
      }),
      party({
        id: 'v2',
        role: 'VENDOR',
        signer_name: 'ANA VITORIA OLIVEIRA FRANÇA',
        signer_cpf: '52998224725',
        signature_url: 'https://x/sign/sale/tok-ana',
      }),
    ],
    {
      includeUrls: true,
      contractModel: 'ESTRELA_DO_SUL',
      company: lfCompany,
    },
  );

  const buyer = views.find((p) => p.role === 'BUYER')!;
  const spouse = views.find((p) => p.role === 'SPOUSE')!;
  const luzia = views.find((p) => p.id === 'v1')!;
  const ana = views.find((p) => p.id === 'v2')!;

  assert(Boolean(buyer.signatureUrl?.includes('tok-buyer')), 'BUYER tem link próprio');
  assert(Boolean(spouse.signatureUrl?.includes('tok-spouse')), 'SPOUSE tem link próprio');
  assert(Boolean(ana.signatureUrl?.includes('tok-ana')), 'VENDOR 2 tem link próprio');
  assert(luzia.signatureUrl == null, 'Luzia sem URL pública no modal');
  assert(luzia.canShare === false, 'Luzia sem Copiar/WhatsApp/e-mail');
  assert(buyer.signatureUrl !== spouse.signatureUrl, 'BUYER ≠ SPOUSE');
  assert(ana.signatureUrl !== buyer.signatureUrl, 'VENDOR 2 ≠ BUYER');
}

function testAraguaiaVendorsStayPublic() {
  const views = toPublicPartyViews(
    [
      party({
        id: 'va',
        role: 'VENDOR',
        signer_name: 'Vendedor 1 Araguaia',
        signature_url: 'https://x/sign/sale/tok-arag-1',
      }),
      party({
        id: 'vb',
        role: 'VENDOR',
        signer_name: 'Vendedor 2 Araguaia',
        signature_url: 'https://x/sign/sale/tok-arag-2',
      }),
    ],
    { includeUrls: true, contractModel: 'ARAGUAIA' },
  );
  assert(
    views.every((p) => Boolean(p.signatureUrl) && p.canShare),
    'Araguaia: ambos VENDOR continuam externos',
  );
}

function testAwaitingVendorUntilLfSigns() {
  const snapshots = [
    { role: 'BUYER' as const, status: 'SIGNED' },
    { role: 'SPOUSE' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'PENDING' },
    { role: 'VENDOR' as const, status: 'SIGNED' },
  ];
  const aggregate = computeAggregateSaleSignatureStatus(snapshots);
  assert(aggregate === 'CLIENT_SIGNED', 'após externos: CLIENT_SIGNED');
  assert(
    saleSignatureStatusLabel('CLIENT_SIGNED') ===
      'Aguardando assinatura da vendedora',
    'rótulo aguardando vendedora',
  );

  const done = computeAggregateSaleSignatureStatus([
    { role: 'BUYER', status: 'SIGNED' },
    { role: 'SPOUSE', status: 'SIGNED' },
    { role: 'VENDOR', status: 'SIGNED' },
    { role: 'VENDOR', status: 'SIGNED' },
  ]);
  assert(done === 'SIGNED', 'só após VENDOR 1: SIGNED');
}

function testSourceGuards() {
  const root = join(__dirname, '..');
  const share = readFileSync(
    join(root, 'lib/saleContractSignatureShare.ts'),
    'utf8',
  );
  assert(
    !share.includes('const signatureUrl = toOfficialSaleSignShareUrl'),
    'mensagem WhatsApp não reescreve domínio',
  );
  const flow = readFileSync(
    join(root, 'lib/saleContractSignaturePartyFlow.ts'),
    'utf8',
  );
  assert(
    flow.includes('toEstrelaDoSulVendorPartyCreateInputs'),
    'criação LF usa inputs internos',
  );
  const modal = readFileSync(
    join(root, 'components/contracts/SaleContractMultiPartyShareModal.tsx'),
    'utf8',
  );
  assert(modal.includes('VENDOR_INTERNAL_MESSAGE'), 'modal preserva aviso interno');
  assert(modal.includes('Enviar por WhatsApp'), 'WhatsApp permanece para externos');
}

testCreateInputsHideCompanyVendorToken();
testIdentifyInternalVendorNewAndLegacy();
testLfShareViewsHideLuziaKeepAna();
testAraguaiaVendorsStayPublic();
testAwaitingVendorUntilLfSigns();
testSourceGuards();
console.log('\nOK mandatory-lf-internal-vendor-share-tests');
