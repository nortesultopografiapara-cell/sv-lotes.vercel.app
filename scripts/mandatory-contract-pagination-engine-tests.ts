/**
 * Testes obrigatórios — engine única de paginação de contratos.
 * Executar: npm run test:contract-pagination
 */

import fs from 'fs';
import path from 'path';
import { generateContractHTML } from '../lib/contractTemplate';
import {
  CONTRACT_PDF_PRINT_CSS,
  RECANTO_CONTRACT_PDF_PRINT_CSS,
} from '../lib/contractPdfPostProcess';
import {
  applyCertificateBreakClass,
  CONTRACT_CERTIFICATE_PAGINATION_CSS,
  CONTRACT_HTML2PDF_PAGINATION_AVOID,
  CONTRACT_PAGE_CONTENT_HEIGHT_PX,
  CONTRACT_PAGINATION_MEASURE_SCRIPT,
  CONTRACT_PAGINATION_SELECTORS,
  CONTRACT_SIGNATURE_PAGINATION_CSS,
  CONTRACT_SIGNATURE_SPACING,
  decideIndivisibleBlockPlacement,
  decideSignatureAndCertificatePlacement,
  decideSignaturePageBreakFromContinuousMeasure,
  offsetWithinPagePx,
  RECANTO_HTML2PDF_PAGINATION_AVOID,
  remainingSpaceOnPagePx,
  shouldAvoidNearlyEmptyTail,
} from '../lib/contractPaginationEngine';
import { buildSaleContractSignatureCertificateHtml } from '../lib/saleContractSignatureCertificateHtml';
import { generateRecantoPrimaveraContract } from '../lib/recantoPrimaveraContractTemplate';
import { generateSvLotes2Contract } from '../lib/svLotes2ContractTemplate';

let pass = 0;
let total = 0;

function assert(name: string, ok: boolean) {
  total++;
  console.log(`${ok ? 'PASSOU' : 'FALHOU'} — ${name}`);
  if (ok) pass++;
}

function baseTenant(model?: string) {
  return {
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
    ...(model ? { contract_model: model } : {}),
  };
}

const baseCustomer = {
  name: 'Cliente Teste',
  document: '222.222.222-22',
  rg: '1234567',
  rg_issuer: 'PC',
  rg_issuer_state: 'PA',
  profession: 'Engenheiro',
  civil_state: 'Casado',
  address: 'Rua B',
  neighborhood: 'Centro',
  city: 'Parauapebas',
  state_uf: 'PA',
  zip_code: '68515-000',
};

const baseProject = {
  name: 'LOTEAMENTO TESTE',
  city: 'Parauapebas',
  uf: 'PA',
};

const baseBlock = {
  number: '5',
  block_name: '123',
  area: 239.88,
  frente: 10,
  fundo: 10,
  'Lado Dir.': 24,
  'Lado Esq.': 24,
};

const baseSale = {
  total_value: 50000,
  down_payment: 5000,
  installments_count: 12,
  payment_type: 'Parcelada',
  first_installment_due_date: '2026-06-01',
  down_payment_due_date: '2026-05-01',
};

const spouseSale = {
  ...baseSale,
  has_spouse: true,
  sale_spouse_name: 'Cônjuge Teste',
  sale_spouse_cpf: '39053344705',
  sale_spouse_nationality: 'Brasileira',
  sale_spouse_marital_status: 'Casada',
};

const spouseCustomer = {
  ...baseCustomer,
  civil_state: 'Casado',
};

// --- Decisão de espaço ---
assert(
  'bloco cabe → same-page',
  decideIndivisibleBlockPlacement({ remainingPx: 400, blockHeightPx: 300 }) ===
    'same-page',
);
assert(
  'bloco não cabe → new-page',
  decideIndivisibleBlockPlacement({ remainingPx: 200, blockHeightPx: 300 }) ===
    'new-page',
);
assert(
  'espaço zero → new-page',
  decideIndivisibleBlockPlacement({ remainingPx: 0, blockHeightPx: 100 }) ===
    'new-page',
);
assert(
  'reserva de rodapé impede encaixe apertado',
  decideIndivisibleBlockPlacement({
    remainingPx: 340,
    blockHeightPx: 300,
    footerReservePx: 48,
  }) === 'new-page',
);
assert(
  'evita cauda quase vazia',
  shouldAvoidNearlyEmptyTail({ remainingPx: 80 }) === true,
);
assert(
  'espaço útil suficiente não força cauda vazia',
  shouldAvoidNearlyEmptyTail({ remainingPx: 200 }) === false,
);

// --- Assinaturas vs certificado (independentes) ---
{
  const shortFits = decideSignatureAndCertificatePlacement({
    signatureOffsetTopInPagePx: 500,
    signatureHeightPx: 220,
    certificateHeightPx: 280,
    pageH: 837,
    footerReservePx: 40,
  });
  assert(
    'assinaturas cabem → same-page (mesmo com certificado grande depois)',
    shortFits.signature === 'same-page',
  );
  assert(
    'certificado que não cabe após assinaturas → new-page só no certificado',
    shortFits.certificate === 'new-page',
  );
}
{
  const packWouldHaveForced = decideSignatureAndCertificatePlacement({
    signatureOffsetTopInPagePx: 450,
    signatureHeightPx: 280,
    certificateHeightPx: 400,
    pageH: 837,
    footerReservePx: 40,
  });
  assert(
    'NÃO empurrar assinaturas quando só o certificado não cabe',
    packWouldHaveForced.signature === 'same-page' &&
      packWouldHaveForced.certificate === 'new-page',
  );
}
{
  const longSig = decideSignatureAndCertificatePlacement({
    signatureOffsetTopInPagePx: 700,
    signatureHeightPx: 320,
    certificateHeightPx: 200,
    pageH: 837,
    footerReservePx: 40,
  });
  assert(
    'assinaturas compactas NÃO usam offset contínuo para force-break',
    longSig.signature === 'same-page',
  );
  assert(
    'certificado sem espaço após assinaturas no fluxo contínuo → new-page',
    longSig.certificate === 'new-page',
  );
}
{
  // Cenário real 000000027: resto contínuo ~239 < altura ~311, mas o bloco
  // cabe numa página útil — NÃO deve forçar página exclusiva de assinaturas.
  const recantoFit = decideSignatureAndCertificatePlacement({
    signatureOffsetTopInPagePx: 596,
    signatureHeightPx: 311,
    certificateHeightPx: 0,
    pageH: CONTRACT_PAGE_CONTENT_HEIGHT_PX,
    footerReservePx: 40,
  });
  assert(
    'Recanto 000000027: bloco compacto permanece same-page (sem pág. só assinaturas)',
    recantoFit.signature === 'same-page',
  );
  assert(
    'medição contínua isolada também same-page para bloco < página útil',
    decideSignaturePageBreakFromContinuousMeasure({
      signatureHeightPx: 311,
      pageH: CONTRACT_PAGE_CONTENT_HEIGHT_PX,
      footerReservePx: 40,
    }) === 'same-page',
  );
  assert(
    'só force-break se altura > página útil inteira',
    decideSignaturePageBreakFromContinuousMeasure({
      signatureHeightPx: CONTRACT_PAGE_CONTENT_HEIGHT_PX,
      pageH: CONTRACT_PAGE_CONTENT_HEIGHT_PX,
      footerReservePx: 40,
    }) === 'new-page',
  );
}
{
  const spouseHeavy = decideSignatureAndCertificatePlacement({
    signatureOffsetTopInPagePx: 100,
    signatureHeightPx: 480,
    certificateHeightPx: 350,
    pageH: 837,
    footerReservePx: 40,
  });
  assert(
    'várias partes no início da página → assinaturas same-page',
    spouseHeavy.signature === 'same-page',
  );
}
assert(
  'script de medição NÃO força assinaturas pelo resto contínuo',
  CONTRACT_PAGINATION_MEASURE_SCRIPT.includes('decideSignature') &&
    CONTRACT_PAGINATION_MEASURE_SCRIPT.includes('fullPageUsable') &&
    CONTRACT_PAGINATION_MEASURE_SCRIPT.includes('sv-pagination-compact'),
);
assert(
  'CSS de compactação leve existe',
  CONTRACT_SIGNATURE_PAGINATION_CSS.includes('sv-pagination-compact'),
);
assert(
  'offsetWithinPagePx normaliza',
  offsetWithinPagePx(900, 837) === 900 - 837,
);
assert(
  'remainingSpaceOnPagePx',
  remainingSpaceOnPagePx(100, 837) === 737,
);

// --- Engine CSS compartilhada ---
assert(
  'assinaturas indivisíveis na engine',
  CONTRACT_SIGNATURE_PAGINATION_CSS.includes('page-break-inside: avoid'),
);
assert(
  'certificado padrão sem always',
  CONTRACT_CERTIFICATE_PAGINATION_CSS.includes('page-break-before: auto') &&
    !CONTRACT_CERTIFICATE_PAGINATION_CSS.match(
      /\.sv-cert-official-block\s*\{[^}]*page-break-before:\s*always/s,
    ),
);
assert(
  'force-break opcional no certificado',
  CONTRACT_CERTIFICATE_PAGINATION_CSS.includes('sv-pagination-force-break'),
);
assert(
  'compactação Meneses < 40px histórico',
  Number.parseInt(CONTRACT_SIGNATURE_SPACING.slotMarginBottomClassic, 10) < 40,
);
assert(
  'CSS clássico e Recanto usam mesma engine de certificado',
  CONTRACT_PDF_PRINT_CSS.includes('sv-cert-official-block') &&
    RECANTO_CONTRACT_PDF_PRINT_CSS.includes('sv-cert-official-block') &&
    CONTRACT_PDF_PRINT_CSS.includes('page-break-before: auto'),
);
assert(
  'html2pdf evita bloco de assinaturas inteiro',
  CONTRACT_HTML2PDF_PAGINATION_AVOID.includes('.contract-signatures') &&
    CONTRACT_HTML2PDF_PAGINATION_AVOID.includes('.sv2-signatures'),
);
assert(
  'Recanto html2pdf não fragmenta slots individuais (bloco pai)',
  !(RECANTO_HTML2PDF_PAGINATION_AVOID as readonly string[]).includes(
    '.sv-contract-recanto-primavera .signature-slot',
  ),
);

// --- applyCertificateBreakClass ---
const certBase =
  '<div class="sv-cert-official-block"><div>cert</div></div>';
assert(
  'aplica force-break quando new-page',
  applyCertificateBreakClass(certBase, 'new-page').includes(
    'sv-pagination-force-break',
  ),
);
assert(
  'remove force-break quando same-page',
  !applyCertificateBreakClass(
    '<div class="sv-cert-official-block sv-pagination-force-break"><div>cert</div></div>',
    'same-page',
  ).includes('sv-pagination-force-break'),
);

// --- Modelos: assinaturas + testemunhas ---
const menesesNoSpouse = generateContractHTML({
  tenant: baseTenant(),
  customer: { ...baseCustomer, civil_state: 'Solteiro', has_spouse: false },
  project: baseProject,
  block: baseBlock,
  sale: baseSale,
});
assert(
  'Meneses sem cônjuge: bloco assinaturas',
  menesesNoSpouse.includes('contract-signatures'),
);
assert(
  'Meneses sem cônjuge: testemunhas',
  menesesNoSpouse.includes('TESTEMUNHA 1') &&
    menesesNoSpouse.includes('TESTEMUNHA 2'),
);
assert(
  'Meneses sem cônjuge: sem SPOUSE',
  !/data-party-role="SPOUSE"/.test(menesesNoSpouse),
);
assert(
  'Meneses usa CSS da engine',
  menesesNoSpouse.includes('page-break-inside: avoid') ||
    menesesNoSpouse.includes(CONTRACT_PAGINATION_SELECTORS.signatureBlock.split(',')[0].trim()),
);

const menesesSpouse = generateContractHTML({
  tenant: baseTenant('MENESES'),
  customer: spouseCustomer,
  project: baseProject,
  block: baseBlock,
  sale: spouseSale,
});
assert(
  'Meneses com cônjuge: slot SPOUSE',
  /data-party-role="SPOUSE"/.test(menesesSpouse),
);
assert(
  'Meneses com cônjuge: VENDOR+BUYER+SPOUSE+WITNESS juntos no mesmo bloco',
  (() => {
    const start = menesesSpouse.indexOf('class="contract-signatures"');
    const end = menesesSpouse.indexOf(
      '</div>',
      menesesSpouse.lastIndexOf('TESTEMUNHA 2'),
    );
    const block = menesesSpouse.slice(start, end + 200);
    return (
      block.includes('VENDOR') &&
      block.includes('BUYER') &&
      block.includes('SPOUSE') &&
      block.includes('TESTEMUNHA 1') &&
      block.includes('TESTEMUNHA 2')
    );
  })(),
);

const recanto = generateRecantoPrimaveraContract({
  tenant: {
    ...baseTenant('RECANTO_PRIMAVERA'),
    name: 'Ivanilde de Moura Silva',
    document: '11144477735',
    document_type: 'CPF',
  },
  customer: spouseCustomer,
  project: baseProject,
  block: baseBlock,
  sale: spouseSale,
});
assert('Recanto: bloco assinaturas', recanto.includes('contract-signatures--recanto'));
assert('Recanto: cônjuge no bloco', /data-party-role="SPOUSE"/.test(recanto));
assert(
  'Recanto: testemunhas no mesmo bloco',
  recanto.includes('TESTEMUNHA 1') && recanto.includes('TESTEMUNHA 2'),
);
assert('Recanto: grade 2 colunas', recanto.includes('signature-grid'));
assert(
  'Recanto: CSS A4 width safe na engine',
  CONTRACT_PDF_PRINT_CSS.includes('table-layout: fixed') ||
    RECANTO_CONTRACT_PDF_PRINT_CSS.includes('table-layout: fixed'),
);

const sv2 = generateSvLotes2Contract({
  tenant: baseTenant('SV_LOTES_2'),
  customer: spouseCustomer,
  project: baseProject,
  block: baseBlock,
  sale: spouseSale,
});
assert('SV2: bloco sv2-signatures', sv2.includes('sv2-signatures'));
assert('SV2: cônjuge', /data-party-role="SPOUSE"/.test(sv2));
assert(
  'SV2 print CSS embutido com assinaturas avoid',
  sv2.includes('sv2-signatures') && CONTRACT_PDF_PRINT_CSS.includes('.sv2-signatures'),
);

// --- Certificado: conteúdo jurídico intacto ---
const cert = buildSaleContractSignatureCertificateHtml({
  contractNumber: '000000001/2026',
  projectName: 'TESTE',
  quadra: '01',
  lote: '05',
  buyerName: 'Cliente Teste',
  buyerDocument: '222.222.222-22',
  companyName: 'Imobiliária Teste',
  companyCnpj: '00.000.000/0001-00',
  signatureStatus: 'ASSINADO ELETRONICAMENTE',
  signedAt: '2026-07-20T15:00:00.000Z',
  signatureToken: 'tok_pagination_test_abc123',
  signatureHash: 'a'.repeat(64),
  spouseName: 'Cônjuge Teste',
  spouseDocument: '333.333.333-33',
  qrCodeDataUrl: 'data:image/png;base64,TESTQR',
  publicUrl: 'https://svlotes.com.br/verify/tok_pagination_test_abc123',
});
assert('certificado: hash preservado', cert.includes('a'.repeat(64)));
assert('certificado: token preservado', cert.includes('tok_pagination_test_abc123'));
assert('certificado: QR preservado', cert.includes('data:image/png;base64,TESTQR'));
assert('certificado: card cônjuge', cert.includes('CÔNJUGE ANUENTE'));
assert('certificado: page-break-before auto', cert.includes('page-break-before: auto'));
assert(
  'certificado: sem always no bloco padrão',
  !cert.match(/\.sv-cert-official-block\s*\{[^}]*page-break-before:\s*always/s),
);
assert('certificado: VALIDADO', cert.includes('VALIDADO'));

// --- Arquivos centrais ---
const enginePath = path.join(process.cwd(), 'lib/contractPaginationEngine.ts');
assert('engine central existe', fs.existsSync(enginePath));
const postProcess = fs.readFileSync(
  path.join(process.cwd(), 'lib/contractPdfPostProcess.ts'),
  'utf8',
);
assert(
  'postProcess importa engine',
  postProcess.includes('contractPaginationEngine'),
);
const pdfPipeline = fs.readFileSync(
  path.join(process.cwd(), 'lib/saleContractPdf.ts'),
  'utf8',
);
assert(
  'pipeline PDF usa script de medição da engine',
  pdfPipeline.includes('CONTRACT_PAGINATION_MEASURE_SCRIPT'),
);
assert(
  'script de medição NÃO usa pack-new-page',
  !CONTRACT_PAGINATION_MEASURE_SCRIPT.includes('pack-new-page'),
);
assert(
  'script mede assinaturas e certificado em separado',
  CONTRACT_PAGINATION_MEASURE_SCRIPT.includes('signature-new-page') &&
    CONTRACT_PAGINATION_MEASURE_SCRIPT.includes('certificate-new-page'),
);

console.log(`\nTotal: ${pass} PASSOU / ${total - pass} FALHOU de ${total}`);
process.exit(pass === total ? 0 : 1);
