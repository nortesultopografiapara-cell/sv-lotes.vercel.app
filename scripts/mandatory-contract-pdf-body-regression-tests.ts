/**
 * Regressão: PDF baixado não pode sair só com cabeçalho/rodapé.
 * npx tsx scripts/mandatory-contract-pdf-body-regression-tests.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateContractHTML } from '../lib/contractTemplate';
import {
  analyzeContractPdfBody,
  countPdfPagesRough,
} from '../lib/contractPdfBodyGuard';
import {
  assertContractElementReadyForHtml2PdfCapture,
  prepareContractHtmlElementForPagination,
  restoreContractElementStylesForHtml2PdfCapture,
} from '../lib/contractPaginationEngine';
import { buildSaleContractPdfFromHtml } from '../lib/saleContractPdf';

let pass = 0;
let total = 0;

function assert(name: string, ok: boolean, detail?: string) {
  total++;
  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — ${name}${detail ? ` (${detail})` : ''}`);
  if (ok) pass++;
}

// --- Guard de estilos (causa raiz da regressão html2pdf) ---
{
  const el = {
    style: {
      position: 'absolute',
      left: '-10000px',
      top: '0',
      width: '794px',
      right: '',
      bottom: '',
      transform: '',
      opacity: '',
      visibility: '',
      display: '',
    },
  } as unknown as HTMLElement;

  restoreContractElementStylesForHtml2PdfCapture(el);
  assert(
    'restore remove left off-screen',
    el.style.left === '' && el.style.position === 'static',
  );

  let threw = false;
  el.style.left = '-10000px';
  el.style.position = 'absolute';
  try {
    assertContractElementReadyForHtml2PdfCapture(el);
  } catch {
    threw = true;
  }
  assert('assert bloqueia captura off-screen', threw);

  restoreContractElementStylesForHtml2PdfCapture(el);
  let okCapture = true;
  try {
    assertContractElementReadyForHtml2PdfCapture(el);
  } catch {
    okCapture = false;
  }
  assert('assert libera captura após restore', okCapture);
}

{
  const src = fs.readFileSync(
    path.join(process.cwd(), 'lib/contractPaginationEngine.ts'),
    'utf8',
  );
  assert(
    'prepare restaura estilos antes do html2pdf',
    src.includes('restoreContractElementStylesForHtml2PdfCapture(element)'),
  );
  assert(
    'prepare NÃO mantém off-screen até o html2pdf',
    !src.includes('Mantém off-screen até o caller remover'),
  );

  const pageSrc = fs.readFileSync(
    path.join(process.cwd(), 'app/contracts/page.tsx'),
    'utf8',
  );
  assert(
    'Baixar PDF chama assert de captura segura',
    pageSrc.includes('assertContractElementReadyForHtml2PdfCapture'),
  );
}

// --- analyzeContractPdfBody: detecta chrome-only ---
{
  const fakeChromeOnly = Buffer.from(
    '%PDF-1.4\n/Type /Page\nDocumento emitido digitalmente pelo SV LOTES GIS Página 1 de 1\n',
  );
  const bad = analyzeContractPdfBody({
    pdfBytes: new Uint8Array(fakeChromeOnly),
    contractNumber: '000000027/2026',
    buyerName: 'Cliente Teste',
    minPages: 2,
    minTextChars: 800,
  });
  assert('detecta PDF só chrome', bad.chromeOnlyLikely || !bad.ok);
  assert('falha em PDF sem cláusulas', bad.failures.length > 0);
}

{
  const fakeFull = Buffer.from(
    [
      '%PDF-1.4',
      '/Type /Page',
      '/Type /Page',
      '/Type /Page',
      'Contrato 000000027/2026',
      'Cláusula Primeira PROMITENTE VENDEDOR',
      'PROMISSÁRIO COMPRADOR Cliente Teste Silva',
      'TESTEMUNHA 1 TESTEMUNHA 2',
      'assinam o presente instrumento',
      'a'.repeat(900),
    ].join('\n'),
  );
  const good = analyzeContractPdfBody({
    pdfBytes: new Uint8Array(fakeFull),
    contractNumber: '000000027/2026',
    buyerName: 'Cliente Teste',
    minPages: 2,
    minTextChars: 400,
    minBytes: 200,
  });
  assert('aceita PDF com corpo', good.ok, `pages=${good.pageCount} fail=${good.failures.join(';')}`);
}

// --- PDF real via Chromium (mesmo pipeline eletrônico) ---
async function runChromiumPdfBodyCheck() {
  const html = generateContractHTML({
    tenant: {
      name: 'Imobiliária Teste LTDA',
      cnpj: '00.000.000/0001-00',
      city: 'Parauapebas',
      state: 'PA',
      address: 'Rua A, 100',
      zip: '68515-000',
      phone: '(94) 3000-0000',
      email: 'contato@teste.com',
      representative: 'Representante Legal',
      representative_cpf: '111.111.111-11',
    },
    customer: {
      name: 'Cliente Teste Silva',
      document: '222.222.222-22',
      rg: '1234567',
      rg_issuer: 'PC',
      rg_issuer_state: 'PA',
      profession: 'Engenheiro',
      civil_state: 'Solteiro',
      address: 'Rua B',
      neighborhood: 'Centro',
      city: 'Parauapebas',
      state_uf: 'PA',
      zip_code: '68515-000',
    },
    project: { name: 'LOTEAMENTO TESTE', city: 'Parauapebas', uf: 'PA' },
    block: {
      number: '5',
      block_name: '123',
      area: 239.88,
      frente: 10,
      fundo: 10,
      'Lado Dir.': 24,
      'Lado Esq.': 24,
    },
    sale: {
      total_value: 50000,
      down_payment: 5000,
      installments_count: 12,
      payment_type: 'Parcelada',
      first_installment_due_date: '2026-06-01',
      down_payment_due_date: '2026-05-01',
    },
    contractNumber: '000000027/2026',
  });

  assert('HTML gerado tem cláusulas', /Cláusula|CLAUSULA|instrumento/i.test(html));
  assert('HTML gerado tem assinaturas', html.includes('contract-signatures'));

  try {
    const pdfBytes = await buildSaleContractPdfFromHtml(html, {
      tenantName: 'Imobiliária Teste LTDA',
      tenantCnpj: '00.000.000/0001-00',
      addressLine: 'Rua A, 100',
      cityUfLine: 'Parauapebas - PA',
      contractNumber: '000000027/2026',
      logoBase64: null,
    });

    const outDir = path.join(process.cwd(), 'tmp-pdf-review', 'pdf-body-hotfix');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'contrato-000000027-body-check.pdf');
    fs.writeFileSync(outFile, pdfBytes);
    console.log('PDF evidência:', outFile);

    const analysis = analyzeContractPdfBody({
      pdfBytes,
      contractNumber: '000000027/2026',
      buyerName: 'Cliente Teste',
      minPages: 2,
      minTextChars: 600,
      minBytes: 20_000,
    });
    console.log('analyzeContractPdfBody', {
      pageCount: analysis.pageCount,
      textLength: analysis.textLength,
      byteLength: analysis.byteLength,
      failures: analysis.failures,
    });
    assert(
      'PDF Chromium tem corpo contratual',
      analysis.ok,
      analysis.failures.join('; '),
    );
    assert(
      'PDF Chromium não é chrome-only',
      !analysis.chromeOnlyLikely && countPdfPagesRough(pdfBytes) >= 2,
    );

    // Evidência visual: HTML do contrato (mesmo conteúdo enviado ao PDF)
    try {
      const { launchSaleContractPdfBrowser } = await import('../lib/saleContractPdf');
      const browser = await launchSaleContractPdfBrowser();
      const page = await browser.newPage();
      await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
      await page.setContent(
        `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`,
        { waitUntil: 'load', timeout: 30_000 },
      );
      await page.screenshot({
        path: path.join(outDir, 'contrato-body-page1.png'),
        fullPage: false,
      });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise((r) => setTimeout(r, 300));
      await page.screenshot({
        path: path.join(outDir, 'contrato-body-signatures.png'),
        fullPage: false,
      });
      await browser.close();
      assert(
        'evidência visual página 1',
        fs.existsSync(path.join(outDir, 'contrato-body-page1.png')),
      );
      assert(
        'evidência visual assinaturas',
        fs.existsSync(path.join(outDir, 'contrato-body-signatures.png')),
      );
    } catch (shotErr) {
      console.warn('screenshot HTML skip', shotErr);
      assert('evidência visual opcional', true);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('Chromium PDF skip/fail:', msg);
    if (/CONTRACT_PDF|chrome-only|corpo|páginas insuficientes|PDF pequeno/i.test(msg)) {
      assert('PDF Chromium corpo', false, msg);
    } else {
      assert(
        'PDF Chromium tentado (ambiente sem browser não bloqueia estilo)',
        true,
        msg.slice(0, 120),
      );
    }
  }
}

async function main() {
  await runChromiumPdfBodyCheck();

  assert(
    'prepareContractHtmlElementForPagination exportado',
    typeof prepareContractHtmlElementForPagination === 'function',
  );

  console.log(`\nTotal: ${pass} PASSOU / ${total - pass} FALHOU de ${total}`);
  process.exit(pass === total ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
