/**
 * Testes obrigatórios — PDF assinado LF ESTRELA preserva as 10 páginas físicas.
 * npx tsx scripts/mandatory-lf-estrela-signed-pdf-tests.ts
 *
 * Não altera template, paginação física, financeiro nem Production.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import type { ContractSignaturePartyRow } from '../lib/saleContractSignaturePartyTypes';
import { resolveSignedPdfReadiness } from '../lib/saleContractSignedParties';
import {
  classifySignedPdfGenerationError,
} from '../lib/deployGitSha';
import {
  composeLfEstrelaSignedPdf,
  LF_ESTRELA_SIGNED_INSTRUMENT_PAGES,
  LF_ESTRELA_STAMP_LAYOUT,
  LF_ESTRELA_STAMP_PAGE_NUMBERS,
  resolveLfEstrelaOverlayStamps,
  sha256Hex,
} from '../lib/lfEstrelaSignedPdf';

const ROOT = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function party(
  role: ContractSignaturePartyRow['role'],
  name: string,
  status: ContractSignaturePartyRow['status'],
  extra?: Partial<ContractSignaturePartyRow>,
): ContractSignaturePartyRow {
  return {
    id: `${role}-${name}`,
    company_id: 'co',
    contract_signature_id: 'sig',
    contract_id: 'ct',
    sale_id: null,
    role,
    signer_name: name,
    signer_cpf: '00000000000',
    signer_phone: null,
    signer_email: null,
    signature_token_hash: null,
    signature_url: null,
    status,
    sent_at: null,
    viewed_at: null,
    signed_at: status === 'SIGNED' ? '2026-10-02T12:00:00.000Z' : null,
    cancelled_at: null,
    expires_at: null,
    signature_data: null,
    ip_address: null,
    user_agent: null,
    signature_hash: status === 'SIGNED' ? 'abc' : null,
    created_at: '2026-10-02T12:00:00.000Z',
    updated_at: '2026-10-02T12:00:00.000Z',
    ...extra,
  };
}

async function blankA4Pdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    doc.addPage([595.28, 841.89]);
  }
  return doc.save();
}

function testSourceGuards() {
  const template = read('lib/lfEstrelaCustomTemplate.ts');
  const service = read('lib/saleContractSignatureService.ts');
  const signed = read('lib/lfEstrelaSignedPdf.ts');
  const pdf = read('lib/saleContractPdf.ts');
  const page = read('app/contracts/page.tsx');
  const route = read('app/api/contracts/[id]/physical-pdf/route.ts');

  assert(!template.includes('sv-esign-stamp'), 'template LF não recebe carimbo HTML');
  assert(!template.includes('ASSINADO DIGITALMENTE'), 'template LF sem texto de e-sign');
  assert(service.includes('isLfEstrelaCustomHtml'), 'pipeline detecta HTML LF ESTRELA');
  assert(service.includes('buildLfEstrelaSignedSaleContractPdf'), 'PDF assinado usa overlay LF');
  assert(
    service.includes('LF ESTRELA: carimbos são overlay'),
    'não injeta HTML de carimbo no LF',
  );
  assert(
    service.includes('lfCertificateHtml = certificateHtml'),
    'certificado LF não é concatenado no HTML do instrumento',
  );
  assert(signed.includes('overlayLfEstrelaSignatureStamps'), 'overlay pdf-lib');
  assert(signed.includes('composeLfEstrelaSignedPdf'), 'compose físico + overlay + certificado');
  assert(pdf.includes('skipMeasure'), 'Chromium LF não executa measure/repaginação');
  assert(page.includes('freezeLfEstrelaPhysicalPdfFromJsPdf'), 'Contratos congela PDF físico html2pdf');
  assert(page.includes('/physical-pdf'), 'POST freeze no Baixar PDF');
  assert(route.includes('persistLfEstrelaPhysicalPdf'), 'API freeze persiste pdf_url');
  assert(read('lib/saleContractStorage.ts').includes('sale-physical'), 'path físico separado do assinado');
  assert(
    read('lib/saleContractSignedParties.ts').includes('getContractSignedParties'),
    'fonte de verdade única getContractSignedParties',
  );
  assert(
    read('lib/saleContractSignedArtifact.ts').includes('getContractSignedParties'),
    'PDF assinado usa a mesma fonte da tela',
  );
  assert(
    !read('lib/saleContractSignatureService.ts').includes(".eq('signature_status', 'SIGNED')"),
    'PDF não exige mais signature_status=SIGNED exato no processo',
  );
  const pdfRoute = read('app/api/contracts/[id]/pdf/route.ts');
  assert(pdfRoute.includes('[SIGNED PDF ROUTE TRACE]'), 'rota /pdf loga TRACE antes do 404');
  assert(pdfRoute.includes('signedPdfReturn'), 'rota /pdf identifica o return');
  assert(pdfRoute.includes("signedPdfReturn: 'artifact_null'"), '404 só artifact_null');
  assert(
    pdfRoute.includes('getContractSignedParties(supabase, requestedContractId'),
    'rota /pdf chama getContractSignedParties no mesmo request',
  );
  assert(
    pdfRoute.includes('classifySignedPdfGenerationError'),
    'falha de geração não vira 404 de assinatura',
  );
  assert(
    pdfRoute.includes('X-SV-Git-Sha'),
    'rota /pdf expõe SHA do deployment',
  );
  assert(
    read('lib/saleContractSignedParties.ts').includes('collectContractLineageIds'),
    'lineage regenerated_from / sale_id / contract_number',
  );
  assert(
    read('app/api/build-info/route.ts').includes('getDeployGitSha'),
    'GET /api/build-info confirma SHA',
  );
  const errorHits = pdfRoute.split('Contrato sem assinatura eletrônica registrada.').length - 1;
  assert(errorHits === 1, 'mensagem 404 existe uma única vez na rota /pdf');
}

function testPartialStamps() {
  const company = {
    razao_social: 'LF IMOVEIS LTDA',
    legal_representative: 'LUZIA FELIPE DE SOUSA',
    representative_cpf: '11111111111',
  };

  const buyerOnly = resolveLfEstrelaOverlayStamps({
    parties: [
      party('BUYER', 'SEVERINO JOSE DE FRANÇA', 'SIGNED'),
      party('VENDOR', 'LUZIA FELIPE DE SOUSA', 'PENDING', {
        signer_cpf: '11111111111',
      }),
      party('VENDOR', 'ANTONIO FERREIRA SILVA', 'PENDING'),
    ],
    company,
  });
  assert(
    buyerOnly.length === 1 && buyerOnly[0].slot === 'BUYER_1',
    'parcial: só comprador assinado',
  );
  assert(
    !buyerOnly.some((s) => s.slot === 'COMPANY' || s.slot === 'SELLER_2'),
    'parcial: LF e Antonio ainda sem carimbo',
  );

  const three = resolveLfEstrelaOverlayStamps({
    parties: [
      party('BUYER', 'SEVERINO JOSE DE FRANÇA', 'SIGNED'),
      party('VENDOR', 'LUZIA FELIPE DE SOUSA', 'SIGNED', {
        signer_cpf: '11111111111',
      }),
      party('VENDOR', 'ANTONIO FERREIRA SILVA', 'SIGNED'),
      party('WITNESS_1', '', 'PENDING'),
      party('WITNESS_2', '', 'PENDING'),
    ],
    company,
  });
  assert(three.length === 3, 'três signatários principais');
  assert(
    three.some((s) => s.slot === 'BUYER_1' && s.lines.includes('SEVERINO JOSE DE FRANÇA')),
    'carimbo comprador 1',
  );
  const companyStamp = three.find((s) => s.slot === 'COMPANY');
  assert(Boolean(companyStamp), 'carimbo empresa');
  assert(
    Boolean(companyStamp?.lines.includes('LUZIA FELIPE DE SOUSA')),
    'Luzia no carimbo da empresa',
  );
  assert(
    Boolean(companyStamp?.lines.some((l) => /Representante de LF IMOVEIS LTDA/i.test(l))),
    'Representante de LF IMOVEIS LTDA',
  );
  assert(
    three.some((s) => s.slot === 'SELLER_2' && s.lines.includes('ANTONIO FERREIRA SILVA')),
    'carimbo Antonio',
  );
  assert(
    !three.some((s) => s.slot === 'BUYER_2' || s.slot === 'WITNESS_1' || s.slot === 'WITNESS_2'),
    'sem cônjuge e testemunhas em branco',
  );
}

async function testComposePreservesInstrumentPages() {
  const physical = await blankA4Pdf(10);
  const physicalHash = sha256Hex(physical);
  const cert = await blankA4Pdf(2);
  const stamps = resolveLfEstrelaOverlayStamps({
    parties: [
      party('BUYER', 'SEVERINO JOSE DE FRANÇA', 'SIGNED'),
      party('VENDOR', 'LUZIA FELIPE DE SOUSA', 'SIGNED', {
        signer_cpf: '11111111111',
      }),
      party('VENDOR', 'ANTONIO FERREIRA SILVA', 'SIGNED'),
    ],
    company: { razao_social: 'LF IMOVEIS LTDA' },
  });

  const signed = await composeLfEstrelaSignedPdf({
    physicalBytes: physical,
    stamps,
    certificatePdfBytes: cert,
  });
  const signedDoc = await PDFDocument.load(signed);
  assert(signedDoc.getPageCount() === 12, '10 páginas do instrumento + 2 do certificado');
  assert(physicalHash !== sha256Hex(signed), 'hash final muda por overlay/certificado');

  const unsigned = await composeLfEstrelaSignedPdf({
    physicalBytes: physical,
    stamps: [],
  });
  const unsignedDoc = await PDFDocument.load(unsigned);
  assert(unsignedDoc.getPageCount() === 10, 'sem certificado permanece 10 páginas');
  assert(
    LF_ESTRELA_SIGNED_INSTRUMENT_PAGES === 10 &&
      LF_ESTRELA_STAMP_PAGE_NUMBERS[0] === 2 &&
      LF_ESTRELA_STAMP_PAGE_NUMBERS[1] === 10,
    'carimbos nas páginas 2 e 10',
  );
  assert(
    LF_ESTRELA_STAMP_LAYOUT.page2.row1 > LF_ESTRELA_STAMP_LAYOUT.page10.row1,
    'P2 (capa) tem assinaturas mais altas que P10',
  );
}

function testSignedPdfFindsPartiesWithoutLegacyField() {
  const threeSigned = [
    party('BUYER', 'SEVERINO JOSE DE FRANÇA', 'SIGNED'),
    party('VENDOR', 'LUZIA FELIPE DE SOUSA', 'SIGNED'),
    party('VENDOR', 'ANTONIO FERREIRA SILVA', 'SIGNED'),
  ];
  const ready = resolveSignedPdfReadiness({
    processStatus: 'PARTIALLY_SIGNED',
    parties: threeSigned,
  });
  assert(ready.ready === true, '3 parties SIGNED + legado vazio/parcial → PDF DEVE funcionar');
  assert(ready.signedCount === 3, 'signedCount = 3');
  assert(ready.signatureSource === 'parties_aggregate', 'fonte = parties, não campo legado');

  const none = resolveSignedPdfReadiness({
    processStatus: null,
    parties: [],
  });
  assert(none.ready === false, '0 parties assinadas → sem PDF assinado');
  assert(none.signedCount === 0, 'signedCount = 0');
  assert(none.signatureSource === 'none', 'fonte nenhuma');

  const legacyProcess = resolveSignedPdfReadiness({
    processStatus: 'signed',
    parties: [],
  });
  assert(legacyProcess.ready === true, 'processo SIGNED legado (casing) ainda funciona');
}

function testGenerationErrorIsNotSignature404() {
  const freeze = classifySignedPdfGenerationError(new Error('Falha ao congelar PDF físico'));
  assert(freeze.includes('Falha ao congelar PDF físico LF ESTRELA'), 'classifica freeze');
  const storage = classifySignedPdfGenerationError(new Error('Storage bucket missing'));
  assert(storage.includes('Falha de Storage'), 'classifica storage');
  const lib = classifySignedPdfGenerationError(new Error('pdf-lib overlay failed'));
  assert(lib.includes('Falha de pdf-lib'), 'classifica pdf-lib');
  const cert = classifySignedPdfGenerationError(new Error('certificado inválido'));
  assert(cert.includes('Falha ao anexar certificado'), 'classifica certificado');
  const generic = classifySignedPdfGenerationError(new Error('boom'));
  assert(
    generic.includes('Falha ao gerar PDF assinado LF ESTRELA'),
    'erro genérico não vira 404 de assinatura',
  );
  assert(
    !generic.includes('Contrato sem assinatura eletrônica registrada.'),
    'geração nunca mascara como sem assinatura',
  );
}

async function main() {
  testSourceGuards();
  testPartialStamps();
  testSignedPdfFindsPartiesWithoutLegacyField();
  testGenerationErrorIsNotSignature404();
  await testComposePreservesInstrumentPages();
  console.log('OK — mandatory-lf-estrela-signed-pdf-tests passed');
}

void main();
