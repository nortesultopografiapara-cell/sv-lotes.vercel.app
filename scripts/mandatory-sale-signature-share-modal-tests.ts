/**
 * Testes da modal multi-party de compartilhamento (Recanto / cônjuge).
 * npx tsx scripts/mandatory-sale-signature-share-modal-tests.ts
 */

import {
  buildSalePartySignatureShareMessage,
  collectPartySignatureShareChannelUrls,
  extractSaleSignUrlFromShareMessage,
} from '../lib/saleContractSignatureShare';
import { toPublicPartyViews } from '../lib/saleContractSignatureParties';
import type { ContractSignaturePartyRow } from '../lib/saleContractSignaturePartyTypes';
import {
  buildSignatureShareWhatsAppUrl,
  buildSignatureShareMailtoUrl,
  qrCodePayloadForSignatureUrl,
} from '../lib/saasContractSignatureShare';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
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

function testModalWithoutSpouse() {
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_URL = 'sv-lotes-vercel-d0ouowyjq.vercel.app';

  const views = toPublicPartyViews(
    [
      party({
        id: 'b',
        role: 'BUYER',
        signer_name: 'João',
        signer_phone: '11911112222',
        signer_email: 'joao@test.com',
        signature_token_hash: 'h',
        signature_url:
          'https://sv-lotes-vercel-lz3cb1kev.vercel.app/sign/sale/tok-buyer',
      }),
      party({
        id: 'v',
        role: 'VENDOR',
        signer_name: 'Ivanilde',
      }),
    ],
    { includeUrls: true },
  );

  assert(views.length === 2, 'sem cônjuge: 2 parties');
  assert(!views.some((p) => p.role === 'SPOUSE'), 'sem SPOUSE');
  assert(Boolean(views.find((p) => p.role === 'BUYER')?.signatureUrl?.includes('tok-buyer')), 'buyer link');
  assert(views.find((p) => p.role === 'VENDOR')?.signatureUrl === null, 'vendor sem link');
  assert(
    !Boolean(views.find((p) => p.role === 'BUYER')?.signatureUrl?.includes('lz3cb1kev')),
    'host atual',
  );

  console.log('OK testModalWithoutSpouse');
}

function testModalWithSpouse() {
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_URL = 'sv-lotes-vercel-d0ouowyjq.vercel.app';

  const views = toPublicPartyViews(
    [
      party({
        id: 'b',
        role: 'BUYER',
        signer_name: 'João',
        signer_phone: '11911112222',
        signer_email: 'joao@test.com',
        signature_url:
          'https://old.example/sign/sale/tok-buyer',
      }),
      party({
        id: 's',
        role: 'SPOUSE',
        signer_name: 'Maria',
        signer_phone: '11933334444',
        signer_email: 'maria@test.com',
        signature_url:
          'https://old.example/sign/sale/tok-spouse',
      }),
      party({
        id: 'v',
        role: 'VENDOR',
        signer_name: 'Ivanilde',
      }),
    ],
    { includeUrls: true },
  );

  const buyer = views.find((p) => p.role === 'BUYER')!;
  const spouse = views.find((p) => p.role === 'SPOUSE')!;
  const vendor = views.find((p) => p.role === 'VENDOR')!;

  assert(views.length === 3, 'com cônjuge: 3');
  assert(buyer.signatureUrl !== spouse.signatureUrl, 'links diferentes');
  assert(Boolean(buyer.signatureUrl?.includes('tok-buyer')), 'QR/link buyer');
  assert(Boolean(spouse.signatureUrl?.includes('tok-spouse')), 'QR/link spouse');
  assert(vendor.signatureUrl === null, 'vendor null');

  const buyerMsg = buildSalePartySignatureShareMessage({
    signerName: buyer.name || 'João',
    role: 'BUYER',
    projectName: 'Recanto',
    quadra: '1',
    lote: '2',
    contractNumber: '1/2026',
    signatureUrl: String(buyer.signatureUrl),
  });
  const spouseMsg = buildSalePartySignatureShareMessage({
    signerName: spouse.name || 'Maria',
    role: 'SPOUSE',
    projectName: 'Recanto',
    quadra: '1',
    lote: '2',
    contractNumber: '1/2026',
    signatureUrl: String(spouse.signatureUrl),
  });

  assert(buyerMsg.includes('tok-buyer') && !buyerMsg.includes('tok-spouse'), 'wa buyer');
  assert(spouseMsg.includes('tok-spouse') && !spouseMsg.includes('tok-buyer'), 'wa spouse');
  assert(buyerMsg.includes('Empreendimento: Recanto'), 'wa buyer empreendimento');
  assert(spouseMsg.includes('Quadra: 1') && spouseMsg.includes('Lote: 2'), 'wa spouse quadra/lote');
  assert(
    extractSaleSignUrlFromShareMessage(buyerMsg) === String(buyer.signatureUrl),
    'wa buyer = painel',
  );
  assert(
    extractSaleSignUrlFromShareMessage(spouseMsg) === String(spouse.signatureUrl),
    'wa spouse = painel',
  );
  assert(!buyerMsg.includes('www.svlotes.com.br'), 'wa buyer sem reescrever Production');
  assert(!spouseMsg.includes('www.svlotes.com.br'), 'wa spouse sem reescrever Production');
  assert(!buyerMsg.includes('old.example'), 'wa buyer sem host antigo');
  assert(!spouseMsg.includes('old.example'), 'wa spouse sem host antigo');

  const waBuyer = buildSignatureShareWhatsAppUrl(buyer.phone, buyerMsg);
  const waSpouse = buildSignatureShareWhatsAppUrl(spouse.phone, spouseMsg);
  assert(Boolean(waBuyer && waSpouse && waBuyer !== waSpouse), 'whatsapp distintos');

  const mailBuyer = buildSignatureShareMailtoUrl(buyer.email, 'Assunto', buyerMsg);
  const mailSpouse = buildSignatureShareMailtoUrl(spouse.email, 'Assunto', spouseMsg);
  assert(Boolean(mailBuyer && mailSpouse), 'emails');
  assert(decodeURIComponent(String(mailBuyer)).includes('joao@test.com'), 'email buyer contact');
  assert(decodeURIComponent(String(mailSpouse)).includes('maria@test.com'), 'email spouse contact');

  console.log('OK testModalWithSpouse');
}

function testLegacyFallbackShape() {
  const empty = toPublicPartyViews([], { includeUrls: true });
  assert(empty.length === 0, 'sem parties → fallback legado na UI');
  console.log('OK testLegacyFallbackShape');
}

function testSpouseMissingUrlStillRendered() {
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_URL = 'sv-lotes-vercel-komjx6nnh.vercel.app';

  const views = toPublicPartyViews(
    [
      party({
        id: 'b',
        role: 'BUYER',
        signer_name: 'Severino José de França',
        signature_url: 'https://x/sign/sale/tok-buyer',
      }),
      party({
        id: 's',
        role: 'SPOUSE',
        signer_name: 'Rosivan de Oliveira',
        signer_phone: '9498141415',
        signature_url: null,
      }),
      party({
        id: 'v',
        role: 'VENDOR',
        signer_name: 'Severino José de França',
      }),
    ],
    { includeUrls: true },
  );

  assert(views.length === 3, '3 cartões');
  assert(views.map((p) => p.role).join(',') === 'BUYER,SPOUSE,VENDOR', 'ordem');
  assert(views[1].missingPublicUrl === true, 'erro explícito sem omitir');
  assert(views[1].name === 'Rosivan de Oliveira', 'nome real');

  console.log('OK testSpouseMissingUrlStillRendered');
}

function testShareChannelUrlParityForExternalParties() {
  process.env.VERCEL_ENV = 'preview';
  process.env.VERCEL_URL = 'sv-lotes-vercel-hotfix.vercel.app';

  const lfCompany = {
    legal_representative: 'LUZIA FELIPE DE SOUSA',
    representative_cpf: '11144477735',
    contract_model: 'ESTRELA_DO_SUL',
  };

  const views = toPublicPartyViews(
    [
      party({
        id: 'b',
        role: 'BUYER',
        signer_name: 'Comprador',
        signature_url: 'https://old.example/sign/sale/tok-buyer-live',
      }),
      party({
        id: 's',
        role: 'SPOUSE',
        signer_name: 'Cônjuge',
        signature_url: 'https://old.example/sign/sale/tok-spouse-live',
      }),
      party({
        id: 'v1',
        role: 'VENDOR',
        signer_name: 'LUZIA FELIPE DE SOUSA',
        signer_cpf: '11144477735',
        signature_url: 'https://old.example/sign/sale/tok-luzia-stale',
        signature_data: {},
      }),
      party({
        id: 'v2',
        role: 'VENDOR',
        signer_name: 'ANA VITORIA OLIVEIRA FRANÇA',
        signer_cpf: '52998224725',
        signature_url: 'https://old.example/sign/sale/tok-vendor2-live',
      }),
    ],
    {
      includeUrls: true,
      contractModel: 'ESTRELA_DO_SUL',
      company: lfCompany,
    },
  );

  const luzia = views.find((p) => p.id === 'v1')!;
  assert(luzia.signatureUrl == null, 'LF/Luzia sem link público');
  assert(luzia.canShare === false, 'LF/Luzia sem compartilhar');
  assert(luzia.missingPublicUrl !== true, 'LF/Luzia não é erro de URL ausente');

  const externals = [
    views.find((p) => p.role === 'BUYER')!,
    views.find((p) => p.role === 'SPOUSE')!,
    views.find((p) => p.id === 'v2')!,
  ];

  for (const view of externals) {
    const role = view.role === 'VENDOR' ? 'VENDOR' : view.role;
    const panelLink = String(view.signatureUrl || '');
    assert(Boolean(panelLink), `${role} tem link de painel`);
    const copiedLink = panelLink;
    const qrLink = qrCodePayloadForSignatureUrl(panelLink);
    const msg = buildSalePartySignatureShareMessage({
      signerName: String(view.name),
      role,
      projectName: 'Estrela do Sul',
      quadra: '01',
      lote: '07',
      contractNumber: '000000007/2026',
      signatureUrl: panelLink,
    });
    const whatsappMessageLink = extractSaleSignUrlFromShareMessage(msg);
    assert(
      panelLink === copiedLink &&
        copiedLink === qrLink &&
        qrLink === whatsappMessageLink,
      `${role} panelLink === copiedLink === qrLink === whatsappMessageLink`,
    );
    const channels = collectPartySignatureShareChannelUrls(panelLink);
    assert(
      channels.panelLink === channels.copiedLink &&
        channels.copiedLink === channels.qrLink &&
        channels.qrLink === channels.whatsappMessageLink,
      `${role} collect helper parity`,
    );
    assert(msg.includes('SV LOTES'), `${role} identidade`);
    assert(String(view.name) && msg.includes(String(view.name)), `${role} nome`);
    assert(msg.includes('Estrela do Sul'), `${role} empreendimento`);
    assert(msg.includes('Quadra: 01') && msg.includes('Lote: 07'), `${role} quadra/lote`);
    assert(msg.includes('000000007/2026'), `${role} contrato`);
    assert(msg.includes('somente por você'), `${role} aviso pessoal`);
    assert(!msg.includes('tok-luzia-stale'), `${role} não usa token da Luzia`);
    assert(!msg.includes('www.svlotes.com.br'), `${role} sem reescrita Production`);
  }

  console.log('OK testShareChannelUrlParityForExternalParties');
}

function main() {
  testModalWithoutSpouse();
  testModalWithSpouse();
  testLegacyFallbackShape();
  testSpouseMissingUrlStillRendered();
  testShareChannelUrlParityForExternalParties();
  console.log('\nTodos os testes da modal multi-party passaram.');
}

main();
