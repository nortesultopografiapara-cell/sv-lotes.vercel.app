/**
 * Testes obrigatórios — PDF da assinatura eletrônica de contrato de venda.
 * npx tsx scripts/mandatory-sale-sign-pdf-tests.ts
 *
 * Integração com Chromium (opcional): RUN_SALE_PDF_BROWSER_TESTS=1
 */

import {
  buildSaleContractPdfFilename,
  buildSaleContractPdfHttpHeaders,
  createSaleContractPdfResponse,
} from '../lib/saleContractPdfHttp';
import { isPdfBytes } from '../lib/saasContractPdfHttp';
import { getContractHtml2pdfOptions } from '../lib/contractPdfPostProcess';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testFilename() {
  assert(
    buildSaleContractPdfFilename('000000022/2026') === 'contrato-000000022_2026.pdf',
    'filename 000000022/2026',
  );
  assert(
    !buildSaleContractPdfFilename('000000022/2026').endsWith('.html'),
    'filename nunca .html',
  );
  console.log('OK testFilename');
}

function testHttpHeaders() {
  const inline = buildSaleContractPdfHttpHeaders('inline', '000000022/2026');
  assert(inline['Content-Type'] === 'application/pdf', 'Content-Type inline');
  assert(
    inline['Content-Disposition'].includes('inline'),
    'Content-Disposition inline',
  );
  assert(
    inline['Content-Disposition'].includes('filename="contrato-000000022_2026.pdf"'),
    'filename inline .pdf',
  );
  assert(!inline['Content-Disposition'].includes('.html'), 'sem .html inline');

  const attachment = buildSaleContractPdfHttpHeaders('attachment', '000000022/2026');
  assert(attachment['Content-Type'] === 'application/pdf', 'Content-Type attachment');
  assert(
    attachment['Content-Disposition'].startsWith('attachment'),
    'Content-Disposition attachment',
  );
  assert(
    attachment['Content-Disposition'].includes('filename="contrato-000000022_2026.pdf"'),
    'filename attachment .pdf',
  );
  assert(
    attachment['X-Sale-Contract-Number'] === '000000022/2026',
    'X-Sale-Contract-Number',
  );
  console.log('OK testHttpHeaders');
}

function testPdfResponse() {
  const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const res = createSaleContractPdfResponse(fakePdf, 'attachment', '000000022/2026');
  assert(res.status === 200, 'response status 200');
  assert(res.headers.get('Content-Type') === 'application/pdf', 'response Content-Type');
  const cd = res.headers.get('Content-Disposition') || '';
  assert(cd.includes('attachment'), 'response attachment');
  assert(cd.includes('contrato-000000022_2026.pdf'), 'response filename pdf');
  console.log('OK testPdfResponse');
}

function testHtml2pdfOptionsReuse() {
  const opt = getContractHtml2pdfOptions('contrato-000000022_2026.pdf');
  assert(Array.isArray(opt.margin) && opt.margin.length === 4, 'margin array');
  assert(opt.filename.endsWith('.pdf'), 'html2pdf filename .pdf');
  assert(opt.jsPDF.format === 'a4', 'format a4');
  console.log('OK testHtml2pdfOptionsReuse');
}

function testSignApiPdfUrls() {
  const token = 'abc123';
  const pdfUrl = `/api/sign/sale/${encodeURIComponent(token)}?pdf=1`;
  const pdfDownloadUrl = `/api/sign/sale/${encodeURIComponent(token)}?pdf=1&download=1`;
  assert(pdfUrl.includes('pdf=1'), 'pdfUrl query pdf=1');
  assert(pdfDownloadUrl.includes('download=1'), 'pdfDownloadUrl download=1');
  assert(!pdfDownloadUrl.includes('.html'), 'urls sem .html');
  console.log('OK testSignApiPdfUrls');
}

async function testBrowserPdfGeneration() {
  if (process.env.RUN_SALE_PDF_BROWSER_TESTS !== '1') {
    console.log('SKIP testBrowserPdfGeneration (RUN_SALE_PDF_BROWSER_TESTS≠1)');
    return;
  }

  const { buildSaleContractPdfFromHtml } = await import('../lib/saleContractPdf');
  const html = `
    <div class="sv-contract-document">
      <h1 class="contract-title">CONTRATO DE COMPRA E VENDA</h1>
      <div class="contract-clause"><p>Cláusula 1 — Objeto do contrato de teste.</p></div>
    </div>`;

  const pdf = await buildSaleContractPdfFromHtml(html, {
    tenantName: 'Imobiliária Teste',
    tenantCnpj: '00.000.000/0001-00',
    addressLine: 'Rua Teste, 100',
    cityUfLine: 'Goiânia - GO',
    contractNumber: '000000022/2026',
    logoBase64: null,
  });

  assert(isPdfBytes(pdf), 'bytes %PDF');
  assert(pdf.byteLength > 500, 'pdf size mínimo');
  console.log('OK testBrowserPdfGeneration');
}

async function main() {
  testFilename();
  testHttpHeaders();
  testPdfResponse();
  testHtml2pdfOptionsReuse();
  testSignApiPdfUrls();
  await testBrowserPdfGeneration();
  console.log('\nAll mandatory sale sign PDF tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
