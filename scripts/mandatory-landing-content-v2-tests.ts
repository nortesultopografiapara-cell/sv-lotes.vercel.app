/**
 * Testes — conteúdo da landing SV LOTES 2.0 (Portal do Cliente em produção).
 * npx tsx scripts/mandatory-landing-content-v2-tests.ts
 */

import fs from 'fs';
import path from 'path';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function testHeroHighlights() {
  const src = read('components/landing/sections/HeroSection.tsx');
  assert(src.includes('Mapa GIS Inteligente'), 'hero gis');
  assert(src.includes('Contratos e Assinaturas Eletrônicas'), 'hero contratos');
  assert(src.includes('Portal do Cliente com acesso por CPF e WhatsApp'), 'hero portal');
  assert(src.includes('Financeiro Completo e Cobranças Automáticas'), 'hero financeiro');
  console.log('OK testHeroHighlights');
}

function testResourcesPortalCard() {
  const src = read('components/landing/sections/ResourcesSection.tsx');
  assert(
    src.includes(
      'Cliente acessa contratos, parcelas, documentos e boletos utilizando CPF e código enviado por WhatsApp.',
    ),
    'card portal recursos',
  );
  console.log('OK testResourcesPortalCard');
}

function testFunctionalitiesStep5() {
  const src = read('components/landing/sections/FunctionalitiesSection.tsx');
  assert(src.includes('Contrato + Portal do Cliente'), 'passo 5 título');
  assert(src.includes('Portal liberado automaticamente'), 'passo 5 portal');
  assert(src.includes('Cliente acompanha tudo online'), 'passo 5 acompanhamento');
  console.log('OK testFunctionalitiesStep5');
}

function testBenefitsAfterList() {
  const src = read('components/landing/sections/BenefitsSection.tsx');
  assert(src.includes('Portal do Cliente com acesso 24 horas'), 'benefício portal 24h');
  console.log('OK testBenefitsAfterList');
}

function testClientPortalSection() {
  const src = read('components/landing/sections/ClientPortalSection.tsx');
  assert(
    src.includes('Seu cliente acompanha tudo sem precisar ligar para a imobiliária.'),
    'subtítulo portal',
  );
  assert(src.includes('📱 Login utilizando CPF'), 'card cpf');
  assert(src.includes('💬 Código via WhatsApp'), 'card whatsapp');
  assert(src.includes('📄 Contratos Online'), 'card contratos');
  assert(src.includes('💰 Parcelas e Financeiro'), 'card financeiro');
  assert(src.includes('/landing/07.png'), 'print portal');
  const page = read('components/landing/LandingPage.tsx');
  assert(page.includes('ClientPortalSection'), 'seção na landing');
  const benefitsIdx = page.indexOf('BenefitsSection');
  const portalIdx = page.indexOf('ClientPortalSection');
  const plansIdx = page.indexOf('PlansSection');
  assert(benefitsIdx < portalIdx && portalIdx < plansIdx, 'ordem entre benefícios e planos');
  console.log('OK testClientPortalSection');
}

function testPlansIncludedFeatures() {
  const config = read('components/landing/constants/landingConfig.ts');
  const plans = read('components/landing/sections/PlansSection.tsx');
  for (const feature of [
    'Portal do Cliente',
    'Login por CPF',
    'Autenticação via WhatsApp',
    'Visualização de Contratos',
    'Download de PDF',
    'Consulta de Parcelas',
    'Acompanhamento Online',
  ]) {
    assert(config.includes(`'${feature}'`), `recurso incluso: ${feature}`);
  }
  assert(!plans.includes('Em desenvolvimento'), 'sem bloco em desenvolvimento');
  assert(!config.includes('LANDING_ROADMAP_FEATURES'), 'sem roadmap legado');
  console.log('OK testPlansIncludedFeatures');
}

function testAboutAndContact() {
  const about = read('components/landing/sections/AboutSection.tsx');
  assert(about.includes('Novidades da versão 2.0'), 'bloco novidades');
  assert(about.includes('Download Seguro de Contratos'), 'novidade download');

  const contact = read('components/landing/sections/ContactSection.tsx');
  const footer = read('components/landing/LandingFooter.tsx');
  const config = read('components/landing/constants/landingConfig.ts');
  assert(config.includes("supportEmail: 'suporte@svlotes.com.br'"), 'email suporte config');
  assert(contact.includes('Suporte Técnico'), 'suporte contato');
  assert(footer.includes('Suporte Técnico'), 'suporte rodapé');
  assert(footer.includes('LANDING_CONTACT.supportEmail'), 'email suporte no rodapé');
  assert(config.includes("email: 'gerencia@nortesultopografia.com.br'"), 'gerencia mantida');
  console.log('OK testAboutAndContact');
}

function testNoLegacyPortalDevCopy() {
  const landingDir = path.join(process.cwd(), 'components/landing');
  const files = fs.readdirSync(landingDir, { recursive: true }) as string[];
  for (const file of files) {
    if (!file.endsWith('.tsx') && !file.endsWith('.ts')) continue;
    const full = path.join(landingDir, file);
    if (!fs.statSync(full).isFile()) continue;
    const content = fs.readFileSync(full, 'utf8');
    assert(!/em desenvolvimento/i.test(content), `sem "em desenvolvimento" em ${file}`);
    assert(!/em breve/i.test(content), `sem "em breve" em ${file}`);
  }
  console.log('OK testNoLegacyPortalDevCopy');
}

function main() {
  testHeroHighlights();
  testResourcesPortalCard();
  testFunctionalitiesStep5();
  testBenefitsAfterList();
  testClientPortalSection();
  testPlansIncludedFeatures();
  testAboutAndContact();
  testNoLegacyPortalDevCopy();
  console.log('OK — mandatory-landing-content-v2-tests passed');
}

main();
