/**
 * PDF/HTML de conferência — qualificação individual dos vendedores ARAGUAIA.
 * Fixtures de homologação (não gravar em Production).
 *
 * npx tsx scripts/generate-araguaia-legal-rep-qualification-preview.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateContractHTML } from '../lib/contractTemplate';
import { generateAraguaiaContract } from '../lib/araguaiaContractTemplate';

const outDir = path.join(
  process.cwd(),
  'scripts',
  '_fixtures',
  'araguaia-legal-rep-qualification',
);

const SEAT = 'Avenida Dos Ipes, Quadra 31, Lote 13, S/N';
const V1_ADDR =
  'Rua Homologação Vendedor 1, 101, Bairro Teste Norte, Canaã dos Carajás, PA';
const V2_ADDR =
  'Rua Homologação Vendedora 2, 202, Bairro Teste Sul, Marabá, PA';

const TENANT = {
  contract_model: 'ARAGUAIA',
  razao_social: 'R R NEGÓCIOS & SERVIÇOS LTDA',
  cnpj: '57590706000178',
  address: SEAT,
  neighborhood: 'Cidade Jardim',
  city: 'Parauapebas',
  state: 'PA',
  legal_representative: 'Daniel Roberto Rivelino de Sousa',
  representative_cpf: '820.912.262-20',
  legal_representative_role: 'Sócio-Administrador',
  legal_representative_email: 'daniel.homolog@example.com',
  legal_representative_phone: '94991110001',
  contract_legal_nationality: 'brasileiro',
  contract_legal_marital_status: 'casado',
  contract_legal_profession: 'consultor pecuário de homologação',
  contract_legal_rg: '4606073',
  contract_legal_rg_issuer: 'PC',
  contract_legal_rg_uf: 'PA',
  legal_representative_address: V1_ADDR,
  contract_legal_address: SEAT,
  contract_second_vendor_json: {
    name: 'Aldenise Alves Sousa',
    cpf: '856.560.112-91',
    rg: '5279360',
    rgIssuer: 'PC',
    rgUf: 'PA',
    nationality: 'brasileira',
    maritalStatus: 'casada',
    profession: 'analista cartográfica de homologação',
    email: '',
    phone: '94992220002',
    address: V2_ADDR,
  },
};

const PROJECT = {
  name: 'Chacreamento Araguaia',
  city: 'Parauapebas',
  uf: 'PA',
  contract_model: 'ARAGUAIA',
};

const CUSTOMER = {
  name: 'Cliente Teste Araguaia',
  cpf_cnpj: '11144477735',
  rg: 'RG nº 1389803',
  rg_issuer: 'PC',
  rg_issuer_state: 'PA',
  nationality: 'Brasileira',
  civil_state: 'Solteiro',
  profession: 'Comerciante',
  email: 'cliente@teste.com',
  phone: '(94) 99999-1234',
  address: 'Rua A, 10',
  neighborhood: 'Centro',
  city: 'Parauapebas',
  state: 'PA',
  zip_code: '68515000',
};

const BLOCK = {
  id: 'block-araguaia-1',
  number: '12',
  block_name: '01',
  area: 1250.5,
  frente: 25,
  fundo: 25,
  'Lado Dir.': 50,
  'Lado Esq.': 50,
  segments_json: [
    { segment_index: 0, official_side: 'frente', distance: 25, confrontant: 'Rua Principal' },
    { segment_index: 1, official_side: 'lado_direito', distance: 50, confrontant: 'Chácara 13' },
    { segment_index: 2, official_side: 'fundo', distance: 25, confrontant: 'Área verde' },
    { segment_index: 3, official_side: 'lado_esquerdo', distance: 50, confrontant: 'Chácara 11' },
  ],
};

const SALE = {
  total_value: 80000,
  down_payment: 10000,
  installments_count: 24,
  installment_value: 2916.67,
  payment_type: 'Parcelado',
  installment_correction_type: 'IGPM',
  sale_date: '2026-08-20',
  brokers: { name: 'Corretor Exemplo', cpf: '12345678909' },
};

const RECEIPTS = [
  { installment_number: 0, amount: 10000, due_date: '2026-08-20' },
  { installment_number: 1, amount: 2916.67, due_date: '2026-09-20' },
  { installment_number: 2, amount: 2916.67, due_date: '2026-10-20' },
];

function wrapDocument(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm 18mm 16mm; }
    body { margin: 0; background: #fff; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function extractPreamble(html: string): string {
  const firstClause = html.indexOf('CLÁUSULA PRIMEIRA');
  return firstClause >= 0 ? html.slice(0, firstClause) : html.slice(0, 8000);
}

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
  return `PDF gerado: ${pdfPath}`;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const htmlInner = generateContractHTML({
    tenant: TENANT,
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: SALE,
    financeReceipts: RECEIPTS,
  });
  const mainPath = path.join(outDir, 'contrato-araguaia-qualificacao-vendedores.html');
  fs.writeFileSync(
    mainPath,
    wrapDocument('ARAGUAIA — qualificação individual dos vendedores', htmlInner),
    'utf8',
  );
  fs.writeFileSync(
    path.join(outDir, 'pagina-1-preambulo.html'),
    wrapDocument(
      'ARAGUAIA — preâmbulo (qualificação individual)',
      extractPreamble(htmlInner),
    ),
    'utf8',
  );

  const v2Html = generateAraguaiaContract({
    tenant: TENANT,
    customer: CUSTOMER,
    project: PROJECT,
    block: BLOCK,
    sale: SALE,
    financeReceipts: RECEIPTS,
    esignV2: true,
  });
  fs.writeFileSync(
    path.join(outDir, 'contrato-araguaia-qualificacao-v2.html'),
    wrapDocument('ARAGUAIA V2 — qualificação individual dos vendedores', v2Html),
    'utf8',
  );

  const pdfPath = path.join(outDir, 'contrato-araguaia-qualificacao-vendedores.pdf');
  const pdfStatus = await tryWritePdf(mainPath, pdfPath);

  console.log('HTML principal:', mainPath);
  console.log('Preâmbulo:', path.join(outDir, 'pagina-1-preambulo.html'));
  console.log('V2:', path.join(outDir, 'contrato-araguaia-qualificacao-v2.html'));
  console.log(pdfStatus);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
