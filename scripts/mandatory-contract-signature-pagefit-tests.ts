/**
 * Regressão: bloco compacto de assinaturas permanece na mesma página do fechamento
 * quando há espaço real (cenário contrato 000000027/2026).
 *
 * Executar: npx tsx scripts/mandatory-contract-signature-pagefit-tests.ts
 */
import {
  CONTRACT_FOOTER_RESERVE_PX,
  CONTRACT_PAGE_CONTENT_HEIGHT_PX,
  CONTRACT_PAGINATION_MEASURE_SCRIPT,
  CONTRACT_RECANTO_CLAUSE_FLOW_CSS,
  CONTRACT_SIGNATURE_PAGINATION_CSS,
  decideSignatureAndCertificatePlacement,
  decideSignaturePageBreakFromContinuousMeasure,
  remainingSpaceOnPagePx,
} from '../lib/contractPaginationEngine';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FALHOU —', msg);
    process.exitCode = 1;
    return;
  }
  console.log('PASSOU —', msg);
}

// Cenário medido no PDF real 000000027: resto contínuo ~239 < altura ~311.
{
  const offset = 596;
  const sigH = 311;
  const remaining = remainingSpaceOnPagePx(offset, CONTRACT_PAGE_CONTENT_HEIGHT_PX);
  assert(remaining < sigH, 'cenário: resto contínuo menor que altura bruta');

  const decision = decideSignatureAndCertificatePlacement({
    signatureOffsetTopInPagePx: offset,
    signatureHeightPx: sigH,
    certificateHeightPx: 0,
    pageH: CONTRACT_PAGE_CONTENT_HEIGHT_PX,
    footerReservePx: CONTRACT_FOOTER_RESERVE_PX,
  });
  assert(
    decision.signature === 'same-page',
    '000000027: paginador NÃO empurra assinaturas para página exclusiva',
  );
  assert(
    decideSignaturePageBreakFromContinuousMeasure({
      signatureHeightPx: sigH,
      pageH: CONTRACT_PAGE_CONTENT_HEIGHT_PX,
      footerReservePx: CONTRACT_FOOTER_RESERVE_PX,
    }) === 'same-page',
    'altura compactável < página útil → same-page',
  );
}

assert(
  CONTRACT_PAGINATION_MEASURE_SCRIPT.includes('decideContinuousTight'),
  'script usa resto contínuo só para compactar (não para force-break)',
);
assert(
  CONTRACT_PAGINATION_MEASURE_SCRIPT.includes('sv-pagination-compact'),
  'script aplica compactação sob demanda',
);
assert(
  CONTRACT_SIGNATURE_PAGINATION_CSS.includes('sv-pagination-compact'),
  'CSS de compactação presente',
);
assert(
  CONTRACT_RECANTO_CLAUSE_FLOW_CSS.includes('page-break-before: avoid') &&
    CONTRACT_RECANTO_CLAUSE_FLOW_CSS.includes('contract-closing'),
  'fechamento colado às assinaturas (break-before/after avoid)',
);

if (process.exitCode) {
  console.error('\nmandatory-contract-signature-pagefit-tests FAILED');
  process.exit(1);
}
console.log('\nOK — mandatory-contract-signature-pagefit-tests passed');
