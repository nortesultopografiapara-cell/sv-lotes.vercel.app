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
import {
  hydrateSignatureRowForSignedPdf,
  resolveSignedPdfDocumentContractId,
  resolveSignedPdfReadiness,
} from '../lib/saleContractSignedParties';
import {
  buildLfEstrelaPhysicalBaseDescription,
  parseLfEstrelaPhysicalBaseDescription,
  assertLfEstrelaHomologatedPageCount,
  lfEstrelaInvalidPhysicalBaseMessage,
} from '../lib/lfEstrelaSignedPdf';
import {
  classifySignedPdfGenerationError,
} from '../lib/deployGitSha';
import {
  buildPhysicalSaleContractStoragePath,
  getSaleContractBucket,
} from '../lib/saleContractStorage';
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
  assert(signed.includes('lfEstrelaStampAnchor'), 'âncoras X/Y por slot');
  assert(signed.includes('companyRepresentative'), 'slot P2/P10 da representante');
  assert(!signed.includes('row1:'), 'não usa row1 genérico compartilhado');
  assert(signed.includes('composeLfEstrelaSignedPdf'), 'compose físico + overlay + certificado');
  const ensureStart = signed.indexOf('export async function ensureLfEstrelaPhysicalBase');
  const ensureEnd = signed.indexOf('export async function buildLfEstrelaSignedSaleContractPdf');
  assert(ensureStart > 0 && ensureEnd > ensureStart, 'ensureLfEstrelaPhysicalBase existe');
  const ensureSlice = signed.slice(ensureStart, ensureEnd);
  assert(
    !ensureSlice.includes('buildSaleContractPdfFromHtml'),
    'ensure NÃO renderiza HTML no servidor como physical base',
  );
  assert(
    !ensureSlice.includes('skipPaginationMeasure'),
    'ensure NÃO usa skipPaginationMeasure para physical base',
  );
  assert(!ensureSlice.includes('input.html'), 'ensure NÃO recebe HTML para gerar base');
  assert(
    signed.includes('LF_ESTRELA_PHYSICAL_BASE_MISSING_MESSAGE'),
    'sem base física: mensagem explícita de freeze ausente',
  );
  assert(
    signed.includes('[LF PHYSICAL BASE LOOKUP TRACE]'),
    'lookup loga physicalBaseFound/storagePath/pageCount',
  );
  const buildStart = signed.indexOf('export async function buildLfEstrelaSignedSaleContractPdf');
  const buildSlice = signed.slice(buildStart);
  assert(
    !buildSlice.includes('html: input.originalHtml'),
    'PDF assinado NÃO passa HTML para congelar physical base',
  );
  assert(
    signed.includes('assertLfEstrelaHomologatedPageCount'),
    'fail-closed pageCount === 10',
  );
  assert(
    signed.includes('{ index: 9, number: 10 }'),
    'P10 só no índice 9 da base homologada de 10 páginas',
  );
  assert(
    !signed.includes('Math.min(LF_ESTRELA_SIGNED_INSTRUMENT_PAGES, pageCount)'),
    'P10 não usa pageIndex relativo em PDF de tamanho qualquer',
  );
  assert(pdf.includes('skipMeasure'), 'Chromium LF não executa measure/repaginação');
  assert(page.includes('freezeLfEstrelaPhysicalPdfBlob'), 'Contratos congela PDF físico html2pdf');
  assert(page.includes('handleBaixarPDFAssinado'), 'Baixar PDF Assinado tem handler próprio');
  assert(page.includes('[LF PHYSICAL STORAGE TRACE]'), 'TRACE do freeze no Storage');
  const physicalStart = page.indexOf('const handleBaixarPDF =');
  const signedStart = page.indexOf('const handleBaixarPDFAssinado =');
  assert(physicalStart > 0 && signedStart > physicalStart, 'handlers físicos e assinados separados');
  const physicalSlice = page.slice(physicalStart, signedStart);
  assert(
    !physicalSlice.includes('/pdf?download=1'),
    'Baixar PDF físico não chama a rota do PDF assinado',
  );
  assert(
    physicalSlice.includes('freezeLfEstrelaPhysicalPdfBlob'),
    'Baixar PDF físico envia o mesmo blob ao freeze',
  );
  assert(page.includes('uploadToSignedUrl'), 'browser envia o Blob direto ao Storage');
  assert(page.includes('intent: "prepare"'), 'API só autoriza, não recebe o PDF');
  assert(page.includes('intent: "confirm"'), 'backend confirma o objeto no Storage');
  assert(!page.includes('form.append("file"'), 'não envia o PDF pela Function (evita HTTP 413)');
  assert(page.includes('PDF físico congelado para assinatura.'), 'UX DEVELOP após freeze');
  assert(route.includes('prepareLfEstrelaPhysicalDirectUpload'), 'API emite signed upload URL');
  assert(route.includes('confirmLfEstrelaPhysicalDirectUpload'), 'API confirma objeto no Storage');
  assert(route.includes('[LF PHYSICAL STORAGE TRACE]'), 'POST /physical-pdf loga TRACE de Storage');
  assert(!route.includes('request.formData()'), 'API não lê o PDF no body');
  assert(!route.includes('persistLfEstrelaPhysicalPdf'), 'API não faz upload do PDF pela Function');
  assert(route.includes('bucket: result.bucket'), 'POST devolve bucket company-assets');
  assert(route.includes('storagePath: result.storagePath'), 'POST devolve path sale-physical');
  assert(!route.includes('saleDocumentId'), 'POST não usa sale_documents como fonte');
  assert(
    !signed.includes("from('sale_documents')"),
    'LF não consulta sale_documents no instrumento',
  );
  assert(
    !signed.includes('SALE_DOCUMENTS_STORAGE_BUCKET'),
    'LF não usa bucket sale-documents',
  );
  assert(
    !signed.includes('sale-documents'),
    'LF não depende do bucket sale-documents',
  );
  assert(
    signed.includes('prepareLfEstrelaPhysicalDirectUpload'),
    'freeze emite signed upload URL, sem receber o PDF',
  );
  assert(
    signed.includes('createSignedUploadUrl'),
    'signed upload URL do company-assets',
  );
  assert(
    signed.includes('confirmLfEstrelaPhysicalDirectUpload'),
    'backend valida o objeto após upload direto',
  );
  assert(
    signed.includes('buildPhysicalSaleContractStoragePath'),
    'PDF físico em company-assets/contracts/sale-physical',
  );
  assert(
    signed.includes('uploadSignedSaleContractPdf'),
    'PDF assinado reutiliza uploadSignedSaleContractPdf',
  );
  assert(
    signed.includes('pdf_signed_url'),
    'PDF assinado atualiza contracts.pdf_signed_url',
  );
  const loadStart = service.indexOf('export async function loadSaleContractPdfForSign');
  const loadEnd = service.indexOf('export async function getLatestSignedSaleSignature');
  assert(loadStart > 0 && loadEnd > loadStart, 'loadSaleContractPdfForSign existe');
  const loadSlice = service.slice(loadStart, loadEnd);
  assert(
    loadSlice.includes('if (lfEstrela)'),
    'loadSaleContractPdfForSign bifurca LF ESTRELA na aquisição',
  );
  assert(
    loadSlice.includes('await buildSaleContractPdfFromHtml(html, chrome)'),
    'Recanto/Meneses/demais permanecem HTML → Chromium',
  );
  assert(
    loadSlice.includes('buildLfEstrelaSignedSaleContractPdf'),
    'LF ESTRELA adquire sale-physical no mesmo loadSaleContractPdfForSign',
  );
  const lfIfIdx = loadSlice.indexOf('if (lfEstrela)');
  const lfReturnIdx = loadSlice.indexOf('return { pdf, contractNumber };', lfIfIdx);
  const lfAcquire = loadSlice.slice(lfIfIdx, lfReturnIdx > lfIfIdx ? lfReturnIdx : lfIfIdx + 2500);
  assert(
    !lfAcquire.includes('buildSaleContractPdfFromHtml(html, chrome)'),
    'LF ESTRELA nunca usa Chromium para o instrumento-base',
  );
  assert(
    !read('lib/saleContractSignatureService.ts').includes('pdf_url'),
    'pipeline /pdf não consulta contracts.pdf_url',
  );
  assert(
    !read('lib/lfEstrelaSignedPdf.ts').includes('pdf_url'),
    'persistência LF não grava contracts.pdf_url',
  );
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
  const lookup = read('lib/saleContractSignatureService.ts');
  assert(
    lookup.includes('[LF SIGNED PDF CONTRACT LOOKUP]'),
    'lookup do contrato loga TRACE antes da busca',
  );
  assert(
    lookup.includes('documentContractId'),
    'loadSaleSignPageContext aceita contracts.id pedido, não o processo',
  );
  const ctxStart = lookup.indexOf('export async function loadSaleSignPageContext');
  assert(ctxStart > 0, 'loadSaleSignPageContext existe');
  const ctxSlice = lookup.slice(ctxStart, ctxStart + 2800);
  assert(
    ctxSlice.includes('.eq(\'id\', lookupContractId)'),
    'contexto de PDF busca contracts.id resolvido, não o processo',
  );
  assert(
    !ctxSlice.includes(".eq('id', signature.contract_id)"),
    'loadSaleSignPageContext não usa signature.contract_id cru',
  );
  assert(
    lookup.includes('lookup usou o ID do processo de assinatura'),
    'recusa process id como contracts.id',
  );
  assert(
    !service.includes('freeze_lf_physical_start'),
    'envio para assinatura NÃO congela physical base via Chromium',
  );
  assert(
    service.includes('loadLfEstrelaPhysicalPdfBytes'),
    'envio LF ESTRELA exige sale-physical já congelado',
  );
  assert(
    read('lib/saleContractSignedArtifact.ts').includes('resolveSignedPdfDocumentContractId'),
    'artefato pina o PDF-base no contracts.id da rota',
  );
  assert(
    read('lib/lfEstrelaSignedPdf.ts').includes('stage: \'physical_pdf_lookup\''),
    'pipeline LF loga estágio physical_pdf_lookup',
  );
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
    LF_ESTRELA_STAMP_LAYOUT.page2.buyer.y > LF_ESTRELA_STAMP_LAYOUT.page10.buyer.y,
    'P2 (capa) tem assinaturas mais altas que P10',
  );
  assert(
    LF_ESTRELA_STAMP_LAYOUT.page2.buyer.y !== LF_ESTRELA_STAMP_LAYOUT.page2.seller2.y,
    'P2 buyer e seller2 têm Y independentes',
  );
  assert(
    LF_ESTRELA_STAMP_LAYOUT.page2.companyRepresentative.x !==
      LF_ESTRELA_STAMP_LAYOUT.page2.buyer.x,
    'P2 company e buyer têm X independentes (colunas)',
  );
  assert(
    LF_ESTRELA_STAMP_LAYOUT.page10.seller2.y > LF_ESTRELA_STAMP_LAYOUT.page10.witness2.y + 30,
    'P10 Antonio fica acima da linha de TESTEMUNHA 2',
  );
  assert(
    LF_ESTRELA_STAMP_LAYOUT.page10.companyRepresentative.y >
      LF_ESTRELA_STAMP_LAYOUT.page10.seller2.y + 18,
    'P10 Luzia e Antonio não compartilham a mesma faixa',
  );
  assert(
    LF_ESTRELA_STAMP_LAYOUT.page2.buyer.y > 458,
    'P2 buyer permanece na área livre acima da linha da Capa',
  );

  let threwInvalid = false;
  try {
    await composeLfEstrelaSignedPdf({
      physicalBytes: await blankA4Pdf(15),
      stamps,
    });
  } catch (err) {
    threwInvalid = /esperado 10 páginas, encontrado 15/i.test(
      err instanceof Error ? err.message : String(err),
    );
  }
  assert(threwInvalid, 'base de 15 páginas é recusada (fail-closed)');
  assert(
    lfEstrelaInvalidPhysicalBaseMessage(15).includes('encontrado 15'),
    'mensagem explícita com pageCount encontrado',
  );
  try {
    assertLfEstrelaHomologatedPageCount(15);
    assert(false, 'assert 15 páginas deveria lançar');
  } catch (err) {
    assert(
      err instanceof Error && err.message === lfEstrelaInvalidPhysicalBaseMessage(15),
      'assertLfEstrelaHomologatedPageCount usa a mensagem obrigatória',
    );
  }
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

function testNeverUseSignatureProcessIdAsContractId() {
  const contractId = '9345eea4-2512-49f0-bbd8-944230161154';
  const signatureProcessId = '50a793d5-7811-461b-af1c-1992af6633a4';
  const resolved = resolveSignedPdfDocumentContractId({
    requestedContractId: contractId,
    signatureProcessId,
    signatureContractId: signatureProcessId,
    partyContractId: contractId,
  });
  assert(resolved === contractId, 'PDF-base usa contracts.id pedido');
  assert(resolved !== signatureProcessId, 'PDF-base nunca usa o ID do processo');

  let threw = false;
  try {
    resolveSignedPdfDocumentContractId({
      requestedContractId: signatureProcessId,
      signatureProcessId,
    });
  } catch {
    threw = true;
  }
  assert(threw, 'recusa loadContract(signatureProcessId)');

  const hydrated = hydrateSignatureRowForSignedPdf(
    {
      id: signatureProcessId,
      contract_id: signatureProcessId,
      tenant_id: 't',
      customer_id: null,
      signer_name: null,
      signer_email: null,
      signer_document: null,
      signature_status: 'PARTIALLY_SIGNED',
      signature_token: 'tok',
      signature_url: 'url',
      ip_address: null,
      user_agent: null,
      viewed_at: null,
      signed_at: null,
      expires_at: '2099-01-01T00:00:00.000Z',
      signature_hash: null,
      created_at: '2026-10-02T12:00:00.000Z',
      updated_at: '2026-10-02T12:00:00.000Z',
    },
    [
      party('BUYER', 'SEVERINO JOSE DE FRANÇA', 'SIGNED', {
        contract_id: contractId,
        contract_signature_id: signatureProcessId,
      }),
    ],
    contractId,
  );
  assert(hydrated.contract_id === contractId, 'hydrate pina contract_id no contrato pedido');
  assert(hydrated.id === signatureProcessId, 'hydrate preserva o id do processo');
}

function testPhysicalBaseUsesCompanyAssetsSalePhysical() {
  const tenantId = '3052a000-e8b9-43a4-b8ab-91a4392ffcbc';
  const contractNumber = '000000012/2026';
  const storagePath = buildPhysicalSaleContractStoragePath(tenantId, contractNumber);
  assert(getSaleContractBucket() === 'company-assets', 'bucket padrão company-assets');
  assert(
    storagePath === `contracts/sale-physical/${tenantId}/000000012_2026.pdf`,
    'path físico sale-physical por tenant/numero',
  );
  const contractId = '9345eea4-2512-49f0-bbd8-944230161154';
  const sha = 'a'.repeat(64);
  const desc = buildLfEstrelaPhysicalBaseDescription({
    contractId,
    version: 11,
    sha256: sha,
    pageCount: 10,
  });
  const parsed = parseLfEstrelaPhysicalBaseDescription(desc);
  assert(parsed.contractId === contractId, 'description guarda contracts.id');
  assert(parsed.version === 11, 'description guarda version');
  assert(parsed.pageCount === 10, 'description guarda page_count=10');
  assert(parsed.sha256 === sha, 'description guarda sha256');
}

function testGenerationErrorIsNotSignature404() {
  const missing = classifySignedPdfGenerationError(
    new Error('PDF físico homologado ainda não foi congelado.'),
  );
  assert(
    missing.includes('Gere primeiro o PDF físico deste contrato'),
    'base ausente vira mensagem de UI, não JSON cru',
  );
  const zero = classifySignedPdfGenerationError(
    new Error('Base física LF ESTRELA inválida: esperado 10 páginas, encontrado 0. Gere/congele novamente o PDF físico homologado.'),
  );
  assert(
    zero.includes('Gere primeiro o PDF físico deste contrato'),
    'encontrado 0 não é tratado como pageCount inválido genérico',
  );
  const invalid = classifySignedPdfGenerationError(
    new Error(
      'Base física LF ESTRELA inválida: esperado 10 páginas, encontrado 15. Gere/congele novamente o PDF físico homologado.',
    ),
  );
  assert(
    invalid ===
      'Base física LF ESTRELA inválida: esperado 10 páginas, encontrado 15. Gere/congele novamente o PDF físico homologado.',
    'pageCount != 10 não é mascarado',
  );
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
  testNeverUseSignatureProcessIdAsContractId();
  testPhysicalBaseUsesCompanyAssetsSalePhysical();
  testGenerationErrorIsNotSignature404();
  await testComposePreservesInstrumentPages();
  console.log('OK — mandatory-lf-estrela-signed-pdf-tests passed');
}

void main();
