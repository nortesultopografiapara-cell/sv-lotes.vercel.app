/**
 * Gera PDF A4 dos HTML de homologação Estrela do Sul.
 * npx tsx scripts/generate-estrela-do-sul-homolog-pdf.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.join(process.cwd(), 'scripts', '_fixtures', 'estrela-do-sul');

const files = [
  'capa-e-assinaturas-completas',
  'dados-tecnicos-corretagem',
  'empresa-somente',
  'empresa-segundo-vendedor',
  'comprador-com-conjuge',
];

async function tryWritePdf(htmlPath: string, pdfPath: string): Promise<string> {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean) as string[];

  let executablePath = '';
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      executablePath = candidate;
      break;
    }
  }
  if (!executablePath) {
    return 'PDF não gerado: Chrome/Edge não encontrado (HTML disponível para conferência).';
  }

  const puppeteer = await import('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, {
      waitUntil: 'networkidle0',
    });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' },
    });
  } finally {
    await browser.close();
  }
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(fs.readFileSync(pdfPath));
  const pages = pdf.getPageCount();
  return `PDF gerado: ${pdfPath} (${pages} páginas)`;
}

async function main() {
  for (const name of files) {
    const htmlPath = path.join(outDir, `${name}.html`);
    const pdfPath = path.join(outDir, `${name}.pdf`);
    if (!fs.existsSync(htmlPath)) {
      console.error(`HTML ausente: ${htmlPath}`);
      process.exit(1);
    }
    const msg = await tryWritePdf(htmlPath, pdfPath);
    console.log(msg);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
