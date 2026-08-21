/**
 * Etapa 8.5 — correções homologação: INTERVENIENTE dinâmica, Loteadora, PDF portal.
 * npx tsx scripts/mandatory-araguaia-esign-v2-homolog-8-5-tests.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveSaleContractDownloadArtifactKind,
  shouldBlockUnsignedFallbackAfterElectronicSign,
} from '../lib/saleContractSignatureRenderMode';
import {
  resolvePortalContractPdfAvailability,
  PORTAL_CONTRACT_SIGNED_PDF_UNAVAILABLE_MESSAGE,
} from '../lib/portal-cliente/contractDownload';
import {
  extractLoteadoraNameFromContractHtml,
  resolveSaleLoteadoraDisplayName,
  resolveVendorDisplayNameFromCompany,
} from '../lib/portal-cliente/saleLoteadora';
import { resolveAraguaiaIntervenientIdentity } from '../lib/araguaiaIntervenientIdentity';

const root = process.cwd();

function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  console.log(`  OK ${msg}`);
}

console.log('\n======== ETAPA 8.5 — HOMOLOG FIXES ========');

console.log('\n=== 1) Botão INTERVENIENTE dinâmico ===');
{
  const section = readFileSync(
    join(root, 'components/contracts/SaleContractSignatureSection.tsx'),
    'utf8',
  );
  ok(
    section.includes('Assinar pela ${pendingIntervenientTarget.name}'),
    'label usa nome da party/company',
  );
  ok(
    !section.includes('Assinar pela R R Negócios — INTERVENIENTE'),
    'sem hardcode R R no botão',
  );
  ok(section.includes('max-h-72 overflow-y-auto'), 'lista com scroll vertical');
}

console.log('\n=== 2) Identidade INTERVENIENTE = company do contrato ===');
{
  const company = {
    name: 'S.V TOPOGRAFIA E PROJETO LTDA',
    razao_social: 'S.V TOPOGRAFIA E PROJETO LTDA',
    cnpj: '12.345.678/0001-90',
    legal_representative: 'JOÃO TESTE',
    representative_cpf: '390.533.447-05',
  };
  const id = resolveAraguaiaIntervenientIdentity({ company, mode: 'v2' });
  ok(id.companyName.includes('S.V TOPOGRAFIA'), 'PJ = S.V');
  ok(id.representativeName === 'JOÃO TESTE', 'rep = Vendedor 1');
  ok(!/R\s*R/i.test(id.companyName), 'sem R R');
  ok(!/Daniel/i.test(id.representativeName), 'sem Daniel');
}

console.log('\n=== 3) Loteadora prioriza company da venda ===');
{
  const company = {
    name: 'S.V TOPOGRAFIA E PROJETO LTDA',
    fantasy_name: '',
  };
  const vendorName = resolveVendorDisplayNameFromCompany(company) || '';
  ok(/s\.v\s*topografia/i.test(vendorName), 'vendor display = S.V');
  ok(
    /s\.v\s*topografia/i.test(
      resolveSaleLoteadoraDisplayName({
        company,
        contractHtml: '<p>Promitente Vendedor: João Teste</p>',
        projectOwnerName: 'Chacreamento Araguaia',
      }),
    ),
    'Loteadora = company, não empreendimento',
  );
  ok(
    /s\.v/i.test(
      resolveSaleLoteadoraDisplayName({
        company: null,
        tenantCompany: { name: 'S.V TOPOGRAFIA E PROJETO LTDA' },
      }),
    ),
    'fallback tenant company',
  );
  const htmlPj = `
    <p>INTERVENIENTE</p>
    <strong>S.V TOPOGRAFIA E PROJETO LTDA</strong>
  `;
  ok(
    /s\.v/i.test(extractLoteadoraNameFromContractHtml(htmlPj) || ''),
    'HTML INTERVENIENTE extrai PJ',
  );
}

console.log('\n=== 4) Portal PDF: pdf_signed_url prevalece ===');
{
  ok(
    resolveSaleContractDownloadArtifactKind({
      signatureStatus: 'PARTIALLY_SIGNED',
      contractStatus: 'ativo',
      pdfSignedUrl: 'https://example.com/signed.pdf',
    }) === 'SIGNED',
    'PDF final força artefato SIGNED mesmo com status parcial',
  );
  ok(
    shouldBlockUnsignedFallbackAfterElectronicSign({
      signatureStatus: 'PENDING',
      contractStatus: 'ativo',
      pdfSignedUrl: 'https://example.com/signed.pdf',
    }),
    'bloqueia HTML unsigned quando há pdf_signed_url',
  );
  ok(
    resolvePortalContractPdfAvailability({
      id: '1',
      status: 'ativo',
      signature_status: 'PENDING',
      pdf_signed_url: 'https://example.com/signed.pdf',
      pdf_url: 'https://example.com/original.pdf',
      generated_html: '<html>unsigned</html>',
    } as never),
    'disponível via pdf_signed_url',
  );
  ok(
    !resolvePortalContractPdfAvailability({
      id: '1',
      status: 'assinado',
      signature_status: 'SIGNED',
      pdf_signed_url: null,
      pdf_url: 'https://example.com/original.pdf',
      generated_html: '<html>unsigned</html>',
    } as never),
    'SIGNED sem pdf_signed_url NÃO entrega original',
  );
  ok(
    resolvePortalContractPdfAvailability({
      id: '1',
      status: 'ativo',
      signature_status: 'PENDING',
      pdf_signed_url: null,
      generated_html: '<html>ok</html>',
    } as never),
    'processo não concluído → HTML/original permitido',
  );
  const download = readFileSync(
    join(root, 'lib/portal-cliente/contractDownload.ts'),
    'utf8',
  );
  ok(
    download.includes(PORTAL_CONTRACT_SIGNED_PDF_UNAVAILABLE_MESSAGE),
    'mensagem processamento documentada',
  );
  ok(
    download.includes('Sempre preferir PDF final quando existir'),
    'preferência explícita do PDF assinado',
  );
  const lookup = readFileSync(
    join(root, 'lib/portal-cliente/contractLookup.ts'),
    'utf8',
  );
  ok(
    lookup.includes('aSignedPdf') || lookup.includes('pdf_signed_url'),
    'pickBest prefere contrato com pdf_signed_url',
  );
}

console.log('\n=== 5) Path V2 sem hardcode R R/Daniel/Aldenise no botão ===');
{
  const section = readFileSync(
    join(root, 'components/contracts/SaleContractSignatureSection.tsx'),
    'utf8',
  );
  ok(!/Assinar pela R R/i.test(section), 'seção sem Assinar pela R R');
  ok(!/Aldenise/i.test(section), 'seção sem Aldenise');
}

console.log('\n======== ETAPA 8.5 OK ========\n');
