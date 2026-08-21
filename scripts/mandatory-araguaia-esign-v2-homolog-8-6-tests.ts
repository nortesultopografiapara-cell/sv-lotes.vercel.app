/**
 * Etapa 8.6 — Portal e admin usam a mesma fonte do PDF assinado.
 * npx tsx scripts/mandatory-araguaia-esign-v2-homolog-8-6-tests.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolvePortalContractPdfAvailability,
  PORTAL_CONTRACT_SIGNED_PDF_UNAVAILABLE_MESSAGE,
} from '../lib/portal-cliente/contractDownload';
import { resolveSignedContractArtifactMeta } from '../lib/saleContractSignedArtifact';

const root = process.cwd();

function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
  console.log(`  OK ${msg}`);
}

console.log('\n======== ETAPA 8.6 — ADMIN × PORTAL PDF ASSINADO ========');

console.log('\n=== A) Helper canônico compartilhado ===');
{
  const helper = readFileSync(
    join(root, 'lib/saleContractSignedArtifact.ts'),
    'utf8',
  );
  ok(helper.includes('loadSignedSaleContractArtifact'), 'helper load');
  ok(helper.includes('resolveSignedContractArtifactMeta'), 'helper meta');
  ok(helper.includes('loadSaleContractPdfForSign'), 'regen = admin');
  ok(helper.includes('getLatestSignedSaleSignature'), 'SIGNED process');
  ok(helper.includes('pdf_signed_url'), 'fallback URL');

  const adminRoute = readFileSync(
    join(root, 'app/api/contracts/[id]/pdf/route.ts'),
    'utf8',
  );
  ok(
    adminRoute.includes('loadSignedSaleContractArtifact'),
    'admin PDF usa helper',
  );
  ok(
    !adminRoute.includes('loadSaleContractPdfForSign'),
    'admin não duplica pipeline inline',
  );

  const portalDl = readFileSync(
    join(root, 'lib/portal-cliente/contractDownload.ts'),
    'utf8',
  );
  ok(
    portalDl.includes('loadSignedSaleContractArtifact'),
    'Portal download usa helper',
  );
  ok(
    portalDl.includes('resolveSignedContractArtifactMeta'),
    'Portal availability usa meta',
  );
}

console.log('\n=== B) Se admin encontraria artefato, Portal habilita ===');
{
  // Caso real homolog: processo 6/6 SIGNED — botão admin aparece / download funciona.
  const signedNoUrl = {
    id: 'c-006',
    status: 'assinado',
    signature_status: 'SIGNED',
    pdf_signed_url: null,
    contract_number: '000000006/2026',
  };
  const meta = resolveSignedContractArtifactMeta(signedNoUrl);
  ok(meta.isFullySigned, 'B: fully signed');
  ok(meta.signedArtifactAvailable, 'B: artefato disponível sem URL (regen)');
  ok(
    resolvePortalContractPdfAvailability(signedNoUrl as never),
    'B: Portal habilita Baixar (igual admin)',
  );

  const withUrl = {
    ...signedNoUrl,
    pdf_signed_url: 'https://storage.example/signed-006.pdf',
  };
  ok(
    resolveSignedContractArtifactMeta(withUrl).signedArtifactAvailable,
    'B: com URL também disponível',
  );
  ok(
    resolvePortalContractPdfAvailability(withUrl as never),
    'B: Portal com URL habilitado',
  );
}

console.log('\n=== C) Processo aberto → original; sem “em processamento” ===');
{
  ok(
    resolvePortalContractPdfAvailability({
      id: 'c-open',
      status: 'ativo',
      signature_status: 'PENDING',
      pdf_signed_url: null,
      generated_html: '<html>original</html>',
    } as never),
    'C: PENDING + HTML disponível',
  );
  const metaOpen = resolveSignedContractArtifactMeta({
    status: 'ativo',
    signature_status: 'CLIENT_SIGNED',
    pdf_signed_url: null,
  });
  ok(!metaOpen.signedArtifactAvailable, 'C: parcial sem artefato final');
}

console.log('\n=== D) Dashboard não exige só pdf_signed_url ===');
{
  const dash = readFileSync(
    join(root, 'lib/portal-cliente/dashboard.ts'),
    'utf8',
  );
  ok(
    dash.includes('resolveSignedContractArtifactMeta'),
    'D: dashboard usa meta canônica',
  );
  ok(
    dash.includes('signedArtifactAvailable') ||
      dash.includes('hasSignedArtifact'),
    'D: view habilitada por artefato/SIGNED',
  );
}

console.log('\n=== E) Mensagem processamento só quando load falha ===');
{
  const portalDl = readFileSync(
    join(root, 'lib/portal-cliente/contractDownload.ts'),
    'utf8',
  );
  ok(
    portalDl.includes(PORTAL_CONTRACT_SIGNED_PDF_UNAVAILABLE_MESSAGE),
    'E: mensagem ainda existe para falha real de load',
  );
}

console.log('\n======== ETAPA 8.6 OK ========\n');
