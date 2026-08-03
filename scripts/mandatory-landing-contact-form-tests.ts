/**
 * Testes — formulário de contato da landing (WhatsApp + e-mail).
 * npx tsx scripts/mandatory-landing-contact-form-tests.ts
 */

import {
  buildContactFormMailto,
  buildContactFormWhatsApp,
  buildContactFormWhatsAppMessage,
  LANDING_CONTACT,
  LANDING_CONTACT_FORM_EMAIL_SUBJECT,
  validateContactForm,
} from '../components/landing/constants/landingConfig';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const sample = {
  name: 'João Silva',
  company: 'Meneses Imobiliária',
  phone: '(94) 99999-9999',
  email: 'joao@test.com',
  city: 'Parauapebas – PA',
  plan: 'Business',
  message: 'Quero ver uma demonstração completa.',
};

function testValidationRequiredFields() {
  const errors = validateContactForm({
    name: '',
    company: '',
    phone: '',
    email: '',
    city: '',
    plan: 'Básico',
    message: '   ',
  });
  assert(Boolean(errors.name), 'nome obrigatório');
  assert(Boolean(errors.phone), 'whatsapp obrigatório');
  assert(Boolean(errors.message), 'mensagem obrigatória');
  console.log('OK testValidationRequiredFields');
}

function testWhatsAppMessageFormat() {
  const text = buildContactFormWhatsAppMessage(sample);
  assert(text.includes('Olá, gostaria de solicitar uma demonstração do SV LOTES.'), 'intro whatsapp');
  assert(text.includes('Nome: João Silva'), 'nome');
  assert(text.includes('Empresa: Meneses Imobiliária'), 'empresa');
  assert(text.includes('WhatsApp: (94) 99999-9999'), 'whatsapp');
  assert(text.includes('Cidade/estado: Parauapebas – PA'), 'cidade');
  assert(text.includes('E-mail: joao@test.com'), 'email');
  assert(text.includes('Plano de interesse: Business'), 'plano');
  assert(text.includes('Quero ver uma demonstração completa.'), 'mensagem');
  console.log('OK testWhatsAppMessageFormat');
}

function testWhatsAppUrlOpensWithEncodedMessage() {
  const url = buildContactFormWhatsApp(sample);
  assert(url.startsWith('https://wa.me/'), 'url whatsapp');
  assert(url.includes('text='), 'param text');
  const decoded = decodeURIComponent(url.split('text=')[1] ?? '');
  assert(decoded.includes('João Silva'), 'payload decodificado');
  console.log('OK testWhatsAppUrlOpensWithEncodedMessage');
}

function testMailtoFormat() {
  const mailto = buildContactFormMailto(sample);
  assert(mailto.startsWith(`mailto:${LANDING_CONTACT.email}?`), 'destinatário');
  assert(mailto.includes(encodeURIComponent(LANDING_CONTACT_FORM_EMAIL_SUBJECT)), 'assunto');
  const body = decodeURIComponent(mailto.split('body=')[1] ?? '');
  assert(body.includes('Gostaria de solicitar uma demonstração do SV LOTES.'), 'corpo email');
  assert(body.includes('Atenciosamente.'), 'fechamento');
  assert(body.includes('Nome: João Silva'), 'campos no corpo');
  console.log('OK testMailtoFormat');
}

function main() {
  testValidationRequiredFields();
  testWhatsAppMessageFormat();
  testWhatsAppUrlOpensWithEncodedMessage();
  testMailtoFormat();
  console.log('OK — mandatory-landing-contact-form-tests passed');
}

main();
