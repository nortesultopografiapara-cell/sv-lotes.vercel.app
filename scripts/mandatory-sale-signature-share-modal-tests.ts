/**
 * Testes da modal multi-party de compartilhamento (Recanto / cônjuge).
 * npx tsx scripts/mandatory-sale-signature-share-modal-tests.ts
 */

import { buildSalePartySignatureShareMessage } from '../lib/saleContractSignatureShare';
import { toPublicPartyViews } from '../lib/saleContractSignatureParties';
import type { ContractSignaturePartyRow } from '../lib/saleContractSignaturePartyTypes';
import {
  buildSignatureShareWhatsAppUrl,
  buildSignatureShareMailtoUrl,
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

function main() {
  testModalWithoutSpouse();
  testModalWithSpouse();
  testLegacyFallbackShape();
  testSpouseMissingUrlStillRendered();
  console.log('\nTodos os testes da modal multi-party passaram.');
}

main();
