/**
 * Resolução de contato WhatsApp/e-mail para compartilhar assinatura.
 * npx tsx scripts/mandatory-sale-signature-share-contact-tests.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { enrichBuyerPartyPhone } from '../lib/saleContractPublicSignUi';
import {
  formatSalePartyShareContactLine,
  resolveSalePartyShareContact,
} from '../lib/saleContractSignatureShareContact';
import { normalizeWhatsAppPhone } from '../lib/whatsapp/clickToChat';

const ROOT = process.cwd();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const VALID_10 = '9433332731';
const VALID_11 = '94999992731';
const VALID_CUSTOMER = '(94) 99999-2731';
const INVALID_SHORT = '2731';
const INVALID_12 = '994999992731';

function testPartyPhoneField() {
  const contact = resolveSalePartyShareContact({
    role: 'BUYER',
    phone: VALID_11,
    signer_phone: null,
  });
  assert(contact.canShareWhatsApp, '1. party.phone válido habilita');
  assert(contact.phone === VALID_11, '1. usa party.phone');
  console.log('OK testPartyPhoneField');
}

function testSignerPhoneField() {
  const contact = resolveSalePartyShareContact({
    role: 'BUYER',
    phone: null,
    signer_phone: VALID_11,
  });
  assert(contact.canShareWhatsApp, '2. signer_phone válido habilita');
  assert(contact.phone === VALID_11, '2. usa signer_phone');
  console.log('OK testSignerPhoneField');
}

function testEmptyPartyCustomerFallback() {
  const contact = resolveSalePartyShareContact(
    { role: 'BUYER', phone: null, signer_phone: null },
    { fallbackPhone: VALID_CUSTOMER },
  );
  assert(contact.canShareWhatsApp, '3. party vazia + customer válido habilita');
  assert(contact.phone === VALID_CUSTOMER, '3. usa fallback');
  console.log('OK testEmptyPartyCustomerFallback');
}

function testInvalidPartyCustomerFallback() {
  const contact = resolveSalePartyShareContact(
    { role: 'BUYER', phone: INVALID_SHORT, signer_phone: INVALID_SHORT },
    { fallbackPhone: VALID_CUSTOMER },
  );
  assert(contact.canShareWhatsApp, '4. party inválida não bloqueia customer');
  assert(contact.phone === VALID_CUSTOMER, '4. usa customer');
  assert(contact.phoneLast4 === '2731', '4. final do número válido');
  assert(!contact.phoneInvalidHint, '4. sem hint de inválido');
  console.log('OK testInvalidPartyCustomerFallback');
}

function testValidPartyPreserved() {
  const contact = resolveSalePartyShareContact(
    { role: 'BUYER', phone: VALID_11, signer_phone: null },
    { fallbackPhone: '11988887777' },
  );
  assert(contact.phone === VALID_11, '5. preserva party válida');
  console.log('OK testValidPartyPreserved');
}

function testInvalidPartyAndCustomer() {
  const contact = resolveSalePartyShareContact(
    { role: 'BUYER', phone: INVALID_SHORT, signer_phone: null },
    { fallbackPhone: '123' },
  );
  assert(!contact.canShareWhatsApp, '6. ambos inválidos desabilita');
  assert(contact.phoneInvalidHint, '6. hint de telefone inválido');
  assert(
    formatSalePartyShareContactLine(contact) === 'Telefone inválido para WhatsApp',
    '6. texto não mostra final XXXX',
  );
  console.log('OK testInvalidPartyAndCustomer');
}

function testTenAndElevenDigits() {
  assert(
    resolveSalePartyShareContact({ role: 'BUYER', phone: VALID_10 }).canShareWhatsApp,
    '7. 10 dígitos BR válido',
  );
  assert(
    resolveSalePartyShareContact({ role: 'BUYER', phone: VALID_11 }).canShareWhatsApp,
    '8. 11 dígitos BR válido',
  );
  console.log('OK testTenAndElevenDigits');
}

function testIncompleteAndUnsafe12() {
  assert(
    !resolveSalePartyShareContact({ role: 'BUYER', phone: INVALID_SHORT })
      .canShareWhatsApp,
    '9. incompleto inválido',
  );
  assert(
    !resolveSalePartyShareContact({ role: 'BUYER', phone: INVALID_12 })
      .canShareWhatsApp,
    '10. 12 dígitos inseguros inválido',
  );
  assert(normalizeWhatsAppPhone(INVALID_12) === null, '10. normalize não afrouxada');
  console.log('OK testIncompleteAndUnsafe12');
}

function testEmailFields() {
  const fromEmail = resolveSalePartyShareContact({
    role: 'BUYER',
    email: 'joao@test.com',
    signer_email: null,
  });
  assert(fromEmail.canShareEmail, '11. party.email válido habilita');
  assert(fromEmail.email === 'joao@test.com', '11. usa party.email');

  const fromSigner = resolveSalePartyShareContact({
    role: 'BUYER',
    email: null,
    signer_email: 'maria@test.com',
  });
  assert(fromSigner.canShareEmail, '12. signer_email válido habilita');
  assert(fromSigner.email === 'maria@test.com', '12. usa signer_email');

  const none = resolveSalePartyShareContact({
    role: 'BUYER',
    email: null,
    signer_email: '',
  });
  assert(!none.canShareEmail, '13. sem e-mail desabilita');
  console.log('OK testEmailFields');
}

function testRoles() {
  const buyer = resolveSalePartyShareContact(
    { role: 'BUYER', phone: INVALID_SHORT },
    { fallbackPhone: VALID_11 },
  );
  assert(buyer.canShareWhatsApp, '14. BUYER usa fallback');

  const vendor = resolveSalePartyShareContact(
    { role: 'VENDOR', phone: VALID_11, email: 'vendor@test.com' },
    { fallbackPhone: VALID_CUSTOMER },
  );
  assert(vendor.canShareWhatsApp, '15. VENDOR com contato próprio');
  assert(vendor.phone === VALID_11, '15. VENDOR não usa fallback do buyer');
  assert(vendor.canShareEmail, '15. VENDOR e-mail próprio');

  const vendorInvalid = resolveSalePartyShareContact(
    { role: 'VENDOR', phone: INVALID_SHORT },
    { fallbackPhone: VALID_11 },
  );
  assert(!vendorInvalid.canShareWhatsApp, '15. VENDOR não herda customer');

  const spouse = resolveSalePartyShareContact(
    { role: 'SPOUSE', signer_phone: VALID_10, signer_email: 'spouse@test.com' },
    { fallbackPhone: VALID_11 },
  );
  assert(spouse.canShareWhatsApp, '16. SPOUSE com contato');
  assert(spouse.phone === VALID_10, '16. SPOUSE não usa fallback do buyer');
  assert(spouse.canShareEmail, '16. SPOUSE e-mail');
  console.log('OK testRoles');
}

function testSectionAndModalSameHelper() {
  const section = read('components/contracts/SaleContractSignatureSection.tsx');
  const modal = read('components/contracts/SaleContractMultiPartyShareModal.tsx');
  assert(
    section.includes("from '@/lib/saleContractSignatureShareContact'"),
    '17. seção importa helper central',
  );
  assert(
    modal.includes("from '@/lib/saleContractSignatureShareContact'"),
    '17. modal importa helper central',
  );
  assert(section.includes('resolveSalePartyShareContact'), '17. seção resolve');
  assert(modal.includes('resolveSalePartyShareContact'), '17. modal resolve');
  assert(
    !section.includes('party.signer_phone || party.phone'),
    '17. seção sem ordem local de telefone',
  );
  assert(
    !modal.includes('party.phone || party.signer_phone'),
    '17. modal sem ordem local de telefone',
  );

  const party = {
    role: 'BUYER' as const,
    phone: INVALID_SHORT,
    signer_phone: null,
    email: null,
    signer_email: 'a@b.com',
  };
  const sectionContact = resolveSalePartyShareContact(party, {
    fallbackPhone: VALID_CUSTOMER,
  });
  const modalContact = resolveSalePartyShareContact(party, {
    fallbackPhone: VALID_CUSTOMER,
  });
  assert(
    JSON.stringify(sectionContact) === JSON.stringify(modalContact),
    '17. mesma resolução para seção e modal',
  );
  console.log('OK testSectionAndModalSameHelper');
}

function testEnrichmentValidity() {
  const replaced = enrichBuyerPartyPhone(
    [{ role: 'BUYER', phone: INVALID_SHORT, signer_phone: INVALID_SHORT }],
    VALID_CUSTOMER,
  );
  assert(replaced[0].phone === VALID_CUSTOMER, 'enrich substitui inválido');
  assert(replaced[0].signer_phone === VALID_CUSTOMER, 'enrich preenche signer_phone');

  const kept = enrichBuyerPartyPhone(
    [{ role: 'BUYER', phone: VALID_11, signer_phone: VALID_11 }],
    '11988887777',
  );
  assert(kept[0].phone === VALID_11, 'enrich preserva válido');

  const spouse = enrichBuyerPartyPhone(
    [{ role: 'SPOUSE', phone: INVALID_SHORT, signer_phone: INVALID_SHORT }],
    VALID_CUSTOMER,
  );
  assert(spouse[0].phone === INVALID_SHORT, 'enrich não altera SPOUSE');
  console.log('OK testEnrichmentValidity');
}

function testContactLabel() {
  const valid = resolveSalePartyShareContact({ role: 'BUYER', phone: VALID_11 });
  assert(
    formatSalePartyShareContactLine(valid) === `WhatsApp final ${VALID_11.slice(-4)}`,
    'label final só com número válido',
  );
  console.log('OK testContactLabel');
}

function main() {
  testPartyPhoneField();
  testSignerPhoneField();
  testEmptyPartyCustomerFallback();
  testInvalidPartyCustomerFallback();
  testValidPartyPreserved();
  testInvalidPartyAndCustomer();
  testTenAndElevenDigits();
  testIncompleteAndUnsafe12();
  testEmailFields();
  testRoles();
  testSectionAndModalSameHelper();
  testEnrichmentValidity();
  testContactLabel();
  console.log('mandatory-sale-signature-share-contact-tests: all passed');
}

main();
