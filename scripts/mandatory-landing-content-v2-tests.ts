/**
 * Testes — conteúdo da landing SV LOTES (reformulação visual com prints reais).
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
  assert(src.includes('PLATAFORMA COMPLETA PARA LOTEAMENTOS'), 'hero badge');
  assert(src.includes('Tudo em uma única plataforma'), 'hero accent');
  assert(src.includes('Agendar demonstração gratuita'), 'hero cta demo');
  assert(src.includes('mapaGis'), 'hero print GIS');
  console.log('OK testHeroHighlights');
}

function testResourcesPortalCard() {
  const src = read('components/landing/sections/ResourcesSection.tsx');
  assert(src.includes('Portal do Cliente'), 'card portal recursos');
  assert(src.includes('Mapa GIS Inteligente'), 'card gis');
  assert(src.includes('Ver todas as funcionalidades'), 'expand recursos');
  console.log('OK testResourcesPortalCard');
}

function testFlowSteps() {
  const src = read('components/landing/sections/FlowSection.tsx');
  assert(src.includes('cinco passos integrados'), 'fluxo título');
  assert(src.includes('Contrato e Portal'), 'passo 5');
  console.log('OK testFlowSteps');
}

function testCompareBenefits() {
  const src = read('components/landing/sections/CompareSection.tsx');
  assert(src.includes('Portal do Cliente'), 'benefício portal');
  assert(src.includes('Antes do SV LOTES'), 'comparativo antes');
  console.log('OK testCompareBenefits');
}

function testClientPortalSection() {
  const src = read('components/landing/sections/ClientPortalSection.tsx');
  assert(
    src.includes('Seu cliente acompanha tudo sem precisar ligar para a imobiliária.'),
    'subtítulo portal',
  );
  assert(src.includes('Login por CPF/CNPJ'), 'card cpf');
  assert(src.includes('Código de acesso por WhatsApp'), 'card whatsapp');
  assert(src.includes('Contratos e documentos'), 'card contratos');
  assert(src.includes('Parcelas, boletos e situação financeira'), 'card financeiro');
  assert(src.includes('portal'), 'print portal');
  const page = read('components/landing/LandingPage.tsx');
  assert(page.includes('ClientPortalSection'), 'seção na landing');
  const compareIdx = page.indexOf('CompareSection');
  const portalIdx = page.indexOf('ClientPortalSection');
  const plansIdx = page.indexOf('PlansSection');
  assert(compareIdx < portalIdx && portalIdx < plansIdx, 'ordem portal entre benefícios e planos');
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
  assert(plans.includes('Ver todos os recursos'), 'expand planos');
  assert(!plans.includes('Em desenvolvimento'), 'sem bloco em desenvolvimento');
  assert(!config.includes('LANDING_ROADMAP_FEATURES'), 'sem roadmap legado');
  console.log('OK testPlansIncludedFeatures');
}

function testAboutAndContact() {
  const about = read('components/landing/sections/AboutSection.tsx');
  assert(about.includes('Tecnologia criada por quem vive o mercado'), 'sobre título');
  assert(about.includes('2010'), 'fundação');

  const contact = read('components/landing/sections/ContactSection.tsx');
  const footer = read('components/landing/LandingFooter.tsx');
  const config = read('components/landing/constants/landingConfig.ts');
  assert(config.includes("supportEmail: 'suporte@svlotes.com.br'"), 'email suporte config');
  assert(contact.includes('Suporte Técnico'), 'suporte contato');
  assert(footer.includes('Suporte Técnico'), 'suporte rodapé');
  assert(footer.includes('LANDING_CONTACT.supportEmail'), 'email suporte no rodapé');
  assert(config.includes("email: 'gerencia@nortesultopografia.com.br'"), 'gerencia mantida');
  assert(contact.includes('city'), 'campo cidade');
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

function testProductShotsPresent() {
  const shots = [
    'mapa-gis.webp',
    'dashboard.webp',
    'clientes.webp',
    'venda-modal.webp',
  ];
  for (const name of shots) {
    const p = path.join(process.cwd(), 'public/landing/product/masked', name);
    assert(fs.existsSync(p), `print mascarado: ${name}`);
  }
  console.log('OK testProductShotsPresent');
}

function main() {
  testHeroHighlights();
  testResourcesPortalCard();
  testFlowSteps();
  testCompareBenefits();
  testClientPortalSection();
  testPlansIncludedFeatures();
  testAboutAndContact();
  testNoLegacyPortalDevCopy();
  testProductShotsPresent();
  console.log('OK — mandatory-landing-content-v2-tests passed');
}

main();
