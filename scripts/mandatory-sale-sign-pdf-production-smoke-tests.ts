/**
 * Smoke tests — PDF assinatura pública (compatível Vercel/produção).
 * npx tsx scripts/mandatory-sale-sign-pdf-production-smoke-tests.ts
 *
 * Chromium real: RUN_SALE_PDF_BROWSER_TESTS=1
 * Simular Vercel: SALE_SIGN_PDF_SIMULATE_VERCEL=1 RUN_SALE_PDF_BROWSER_TESTS=1
 */

import fs from 'fs';
import path from 'path';
import nextConfig from '../next.config';
import {
  shouldExposeSaleSignPdfError,
  SALE_SIGN_PDF_DOWNLOAD_ERROR,
} from '../lib/saleContractPdfErrors';
import { createSaleContractHtmlPreviewResponse } from '../lib/saleContractPdfHttp';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testNextConfigTracing() {
  assert(Boolean(nextConfig.outputFileTracingIncludes), 'outputFileTracingIncludes definido');
  const includes = nextConfig.outputFileTracingIncludes?.['/api/sign/sale/[token]'] || [];
  assert(
    includes.some((p: string) => p.includes('@sparticuz/chromium/bin')),
    'trace inclui @sparticuz/chromium/bin',
  );
  assert(
    Array.isArray(nextConfig.serverExternalPackages) &&
      nextConfig.serverExternalPackages.includes('@sparticuz/chromium'),
    'serverExternalPackages inclui @sparticuz/chromium',
  );
  assert(nextConfig.output === 'standalone', 'output standalone restaurado');
  console.log('OK testNextConfigTracing');
}

function testVercelFunctionConfig() {
  const vercelPath = path.join(process.cwd(), 'vercel.json');
  assert(fs.existsSync(vercelPath), 'vercel.json existe');
  const cfg = JSON.parse(fs.readFileSync(vercelPath, 'utf8')) as {
    functions?: Record<string, { maxDuration?: number; memory?: number }>;
  };
  const fn = cfg.functions?.['app/api/sign/sale/[token]/route.ts'];
  assert(Boolean(fn), 'função sign/sale configurada');
  assert((fn?.maxDuration || 0) >= 60, 'maxDuration >= 60');
  assert((fn?.memory || 0) >= 1024, 'memory >= 1024MB');
  console.log('OK testVercelFunctionConfig');
}

function testChromiumBinPresent() {
  const binDir = path.join(process.cwd(), 'node_modules/@sparticuz/chromium/bin');
  assert(fs.existsSync(binDir), 'bin @sparticuz/chromium existe');
  assert(fs.existsSync(path.join(binDir, 'chromium.br')), 'chromium.br presente');
  assert(fs.existsSync(path.join(binDir, 'al2023.tar.br')), 'al2023.tar.br presente (Node 20+ Vercel)');
  console.log('OK testChromiumBinPresent');
}

async function testPdfGenerationServerlessPath() {
  if (process.env.RUN_SALE_PDF_BROWSER_TESTS !== '1') {
    console.log('SKIP testPdfGenerationServerlessPath (RUN_SALE_PDF_BROWSER_TESTS≠1)');
    return;
  }

  if (process.env.SALE_SIGN_PDF_SIMULATE_VERCEL === '1') {
    process.env.VERCEL = '1';
    if (process.platform === 'win32') {
      console.log('SKIP testPdfGenerationServerlessPath on win32 (Chromium serverless é Linux)');
      return;
    }
  }

  const { buildSaleContractPdfFromHtml, isSaleSignPdfServerless } = await import(
    '../lib/saleContractPdf'
  );
  const { isPdfBytes } = await import('../lib/saasContractPdfHttp');

  if (process.env.SALE_SIGN_PDF_SIMULATE_VERCEL === '1') {
    assert(isSaleSignPdfServerless(), 'modo serverless ativo quando VERCEL=1');
  }

  const html = `
    <div class="sv-contract-document">
      <h1 class="contract-title">CONTRATO DE COMPRA E VENDA</h1>
      <div class="contract-clause"><p>Cláusula 1 — Objeto do contrato smoke test.</p></div>
    </div>`;

  const pdf = await buildSaleContractPdfFromHtml(html, {
    tenantName: 'Imobiliária Smoke',
    tenantCnpj: '00.000.000/0001-00',
    addressLine: 'Rua Teste, 100',
    cityUfLine: 'Goiânia - GO',
    contractNumber: '000000022/2026',
    logoBase64: null,
  });

  assert(isPdfBytes(pdf), 'bytes %PDF');
  assert(pdf.byteLength > 500, 'pdf size mínimo');
  console.log('OK testPdfGenerationServerlessPath');
}

function testErrorExposurePolicy() {
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  assert(shouldExposeSaleSignPdfError(), 'expõe erro em development');
  process.env.NODE_ENV = 'production';
  delete process.env.SALE_SIGN_PDF_DEBUG;
  assert(!shouldExposeSaleSignPdfError(), 'oculta erro em production');
  assert(
    SALE_SIGN_PDF_DOWNLOAD_ERROR.toLowerCase().includes('download'),
    'mensagem download clara',
  );
  process.env.NODE_ENV = prevNodeEnv;
  console.log('OK testErrorExposurePolicy');
}

function testHtmlPreviewFallbackHeaders() {
  const res = createSaleContractHtmlPreviewResponse('<p>teste</p>', '000000022/2026');
  assert(res.headers.get('Content-Type')?.includes('text/html'), 'preview Content-Type html');
  assert(res.headers.get('X-Sale-Contract-Preview') === 'html-fallback', 'preview marker');
  const cd = res.headers.get('Content-Disposition') || '';
  assert(cd.includes('inline'), 'preview inline');
  assert(!cd.includes('.pdf'), 'preview não finge ser pdf');
  console.log('OK testHtmlPreviewFallbackHeaders');
}

async function main() {
  testNextConfigTracing();
  testVercelFunctionConfig();
  testChromiumBinPresent();
  testErrorExposurePolicy();
  testHtmlPreviewFallbackHeaders();
  await testPdfGenerationServerlessPath();
  console.log('\nAll sale sign PDF production smoke tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
