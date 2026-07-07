/**
 * Testes obrigatórios — Portal do Cliente Etapa 1 (esqueleto).
 * Executar: npx tsx scripts/mandatory-client-portal-stage1-tests.ts
 */

import fs from 'fs';
import path from 'path';
import {
  CLIENT_PORTAL_FLAG,
  CLIENT_PORTAL_PATH,
  CLIENT_PORTAL_UI_FLAG,
  isClientPortalEnabled,
  isClientPortalEnabledForUi,
  parseClientPortalEnvFlag,
} from '../lib/portal-cliente/config';

const root = path.join(__dirname, '..');

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function read(file: string): string {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function testFeatureFlagParse(): void {
  assert(parseClientPortalEnvFlag('true') === true, 'true');
  assert(parseClientPortalEnvFlag(' TRUE ') === true, 'trim true');
  assert(parseClientPortalEnvFlag('false') === false, 'false');
  assert(parseClientPortalEnvFlag(undefined) === false, 'undefined');
}

function testFeatureFlagEnv(): void {
  const original = process.env[CLIENT_PORTAL_FLAG];
  const originalUi = process.env[CLIENT_PORTAL_UI_FLAG];

  delete process.env[CLIENT_PORTAL_FLAG];
  delete process.env[CLIENT_PORTAL_UI_FLAG];
  assert(isClientPortalEnabled() === false, 'server off by default');
  assert(isClientPortalEnabledForUi() === false, 'ui off by default');

  process.env[CLIENT_PORTAL_FLAG] = 'true';
  process.env[CLIENT_PORTAL_UI_FLAG] = 'true';
  assert(isClientPortalEnabled() === true, 'server on');
  assert(isClientPortalEnabledForUi() === true, 'ui on');

  if (original === undefined) delete process.env[CLIENT_PORTAL_FLAG];
  else process.env[CLIENT_PORTAL_FLAG] = original;
  if (originalUi === undefined) delete process.env[CLIENT_PORTAL_UI_FLAG];
  else process.env[CLIENT_PORTAL_UI_FLAG] = originalUi;
}

function testMiddlewarePublicRoute(): void {
  const middleware = read('middleware.ts');
  assert(middleware.includes("'/portal-cliente'"), 'middleware portal-cliente');
  assert(middleware.includes("'/api/portal-cliente'"), 'middleware api portal-cliente');
}

function testLayoutStandalone(): void {
  const layout = read('components/Layout.tsx');
  assert(layout.includes("pathname.startsWith('/portal-cliente')"), 'layout standalone portal');
}

function testLandingConfig(): void {
  const config = read('components/landing/constants/landingConfig.ts');
  assert(config.includes("LANDING_CLIENT_PORTAL_PATH = '/portal-cliente'"), 'landing path');
}

function testLandingHeader(): void {
  const header = read('components/landing/LandingHeader.tsx');
  assert(header.includes('LANDING_CLIENT_PORTAL_PATH'), 'header imports path');
  assert(header.includes('Portal do Cliente'), 'header label');
  assert(header.includes('isClientPortalEnabledForUi'), 'header feature flag');
}

function testPortalPage(): void {
  const page = read('app/portal-cliente/page.tsx');
  assert(page.includes('isClientPortalEnabled'), 'page server flag');
  assert(page.includes('notFound'), 'page 404 when disabled');
  assert(page.includes('ClientPortalEntryForm'), 'entry form');
}

function testNextConfig(): void {
  const nextConfig = read('next.config.ts');
  assert(nextConfig.includes('NEXT_PUBLIC_CLIENT_PORTAL_ENABLED'), 'next.config env');
}

function testEnvExample(): void {
  const env = read('.env.example');
  assert(env.includes('CLIENT_PORTAL_ENABLED'), 'env example server flag');
  assert(env.includes('NEXT_PUBLIC_CLIENT_PORTAL_ENABLED'), 'env example ui flag');
}

function testDocs(): void {
  const docs = read('docs/CLIENT_PORTAL.md');
  assert(docs.includes('WhatsApp'), 'docs whatsapp auth');
  assert(docs.includes('Etapa 1'), 'docs stage 1');
  assert(docs.includes(CLIENT_PORTAL_PATH), 'docs path');
}

function testNoWriteApisYet(): void {
  const apiDir = path.join(root, 'app/api/portal-cliente');
  assert(!fs.existsSync(apiDir), 'no portal API routes in stage 1');
}

function main(): void {
  testFeatureFlagParse();
  testFeatureFlagEnv();
  testMiddlewarePublicRoute();
  testLayoutStandalone();
  testLandingConfig();
  testLandingHeader();
  testPortalPage();
  testNextConfig();
  testEnvExample();
  testDocs();
  testNoWriteApisYet();
  console.log('mandatory-client-portal-stage1-tests: OK');
}

main();
