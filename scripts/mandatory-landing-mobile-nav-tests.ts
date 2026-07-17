/**
 * Landing header mobile — cliques do menu e CTAs.
 * npx tsx scripts/mandatory-landing-mobile-nav-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function testRoutesFromConfig() {
  const config = read('components/landing/constants/landingConfig.ts');
  assert(config.includes("LANDING_LOGIN_PATH = '/login'"), 'login path');
  assert(config.includes("LANDING_CLIENT_PORTAL_PATH = '/portal-cliente'"), 'portal path');
  console.log('OK testRoutesFromConfig');
}

function testHeaderUsesCanonicalRoutes() {
  const header = read('components/landing/LandingHeader.tsx');
  assert(header.includes('LANDING_LOGIN_PATH'), 'usa LANDING_LOGIN_PATH');
  assert(header.includes('LANDING_CLIENT_PORTAL_PATH'), 'usa LANDING_CLIENT_PORTAL_PATH');
  assert(header.includes('landing-header-mobile-ctas'), 'CTAs mobile no header fechado');
  assert(header.includes('landing-nav-mobile'), 'menu mobile');
  assert(header.includes('landing-nav-backdrop'), 'backdrop');
  assert(header.includes('aria-label={menuOpen ? \'Fechar menu\' : \'Abrir menu\'}'), 'aria menu');
  assert(header.includes("e.key === 'Escape'"), 'fecha com Escape');
  assert(header.includes("document.body.style.overflow = 'hidden'"), 'bloqueia scroll aberto');
  assert(header.includes("document.body.style.overflow = ''"), 'restaura overflow');
  assert(!header.includes("href=\"/login\""), 'não hardcoda /login');
  assert(!header.includes("href=\"/portal-cliente\""), 'não hardcoda portal');
  console.log('OK testHeaderUsesCanonicalRoutes');
}

function testBackdropBelowMenu() {
  const css = read('components/landing/landing.css');
  const backdropBlock = css.match(/\.landing-nav-backdrop\s*\{[^}]+\}/);
  assert(Boolean(backdropBlock), 'bloco backdrop existe');
  assert(
    /z-index:\s*1\b/.test(backdropBlock?.[0] || ''),
    'backdrop z-index 1 (abaixo do menu)',
  );
  assert(
    !/z-index:\s*99\b/.test(backdropBlock?.[0] || ''),
    'backdrop não usa mais z-index 99',
  );

  const navBlock = css.match(/\.landing-nav-mobile\s*\{[^}]+\}/);
  assert(Boolean(navBlock), 'bloco nav mobile existe');
  assert(/z-index:\s*3\b/.test(navBlock?.[0] || ''), 'nav mobile z-index 3');
  assert(/pointer-events:\s*auto/.test(navBlock?.[0] || ''), 'nav pointer-events auto');

  const barBlock = css.match(/\.landing-header-bar\s*\{[^}]+\}/);
  assert(/z-index:\s*3\b/.test(barBlock?.[0] || ''), 'header-bar z-index 3');
  console.log('OK testBackdropBelowMenu');
}

function testDesktopPreserved() {
  const css = read('components/landing/landing.css');
  assert(
    css.includes('.landing-header-mobile-ctas') &&
      css.includes('@media (min-width: 1024px)') &&
      css.includes('display: none !important'),
    'CTAs mobile ocultos no desktop',
  );
  const header = read('components/landing/LandingHeader.tsx');
  assert(header.includes('landing-nav-desktop'), 'nav desktop preservada');
  assert(header.includes('landing-btn-system--desktop'), 'CTAs desktop preservados');
  console.log('OK testDesktopPreserved');
}

function main() {
  testRoutesFromConfig();
  testHeaderUsesCanonicalRoutes();
  testBackdropBelowMenu();
  testDesktopPreserved();
  console.log('mandatory-landing-mobile-nav-tests: OK');
}

main();
