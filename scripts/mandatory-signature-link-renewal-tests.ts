/**
 * Renovação individual de link expirado.
 * Somente código local. Não grava contrato, processo nem participante.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { signatureExpiresAt } from '../lib/saasContractSignatureService';
import {
  buildPartyLinkReissuePatch,
  partyPublicLinkReissueBlockReason,
  toPublicPartyViews,
} from '../lib/saleContractSignatureParties';
import { computeAggregateSaleSignatureStatus } from '../lib/saleContractSignaturePartyStatus';
import {
  individualPartyLinkStillOpen,
  processStatusBlocksIndividualParty,
} from '../lib/saleContractSignatureStatus';
import type { ContractSignaturePartyRow } from '../lib/saleContractSignaturePartyTypes';

const root = process.cwd();

function ok(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
  console.log(`  OK ${msg}`);
}

function party(
  partial: Partial<ContractSignaturePartyRow> & {
    id: string;
    role: ContractSignaturePartyRow['role'];
    status: ContractSignaturePartyRow['status'];
  },
): ContractSignaturePartyRow {
  return {
    company_id: 'company-1',
    contract_signature_id: 'sig-1',
    contract_id: 'contract-1',
    sale_id: null,
    signer_name: null,
    signer_cpf: null,
    signer_phone: null,
    signer_email: null,
    signature_token_hash: 'hash-old',
    signature_url: 'https://svlotes.com.br/sign/sale/old-token',
    sent_at: '2026-08-01T00:00:00.000Z',
    viewed_at: null,
    signed_at: null,
    cancelled_at: null,
    expires_at: '2026-09-01T00:00:00.000Z',
    signature_hash: null,
    ip_address: null,
    user_agent: null,
    signature_data: {},
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...partial,
  };
}

console.log('\n=== Quem pode renovar ===');
{
  ok(
    partyPublicLinkReissueBlockReason(
      party({ id: 'v', role: 'VENDOR', status: 'EXPIRED', signer_name: 'ALDENISE' }),
    ) === null,
    'vendedora expirada com link pode renovar',
  );
  ok(
    partyPublicLinkReissueBlockReason(
      party({ id: 'b', role: 'BUYER', status: 'EXPIRED' }),
    ) === null,
    'comprador expirado pode renovar',
  );
  ok(
    partyPublicLinkReissueBlockReason(
      party({ id: 's', role: 'SPOUSE', status: 'EXPIRED' }),
    ) === null,
    'cônjuge expirado pode renovar',
  );
  ok(
    partyPublicLinkReissueBlockReason(
      party({ id: 'w', role: 'WITNESS_1', status: 'EXPIRED' }),
    ) === null,
    'testemunha expirada com link pode renovar',
  );
  ok(
    partyPublicLinkReissueBlockReason(
      party({ id: 'r', role: 'LEGAL_REPRESENTATIVE', status: 'EXPIRED' }),
    ) === null,
    'representante legal expirado pode renovar',
  );
  ok(
    partyPublicLinkReissueBlockReason(
      party({
        id: 'signed',
        role: 'VENDOR',
        status: 'SIGNED',
        signed_at: '2026-08-02T00:00:00.000Z',
        signature_hash: 'sha-signed',
        ip_address: '203.0.113.10',
      }),
    )?.includes('já assinou'),
    'SIGNED continua bloqueado',
  );
  ok(
    partyPublicLinkReissueBlockReason(
      party({ id: 'c', role: 'VENDOR', status: 'CANCELLED' }),
    )?.includes('cancelado'),
    'CANCELLED continua bloqueado',
  );
  ok(
    partyPublicLinkReissueBlockReason(
      party({
        id: 'i',
        role: 'INTERVENIENT',
        status: 'EXPIRED',
        signature_url: null,
        signature_token_hash: null,
      }),
    ) !== null,
    'interveniente sem link público não renova',
  );
  ok(
    partyPublicLinkReissueBlockReason(
      party({
        id: 'internal',
        role: 'VENDOR',
        status: 'EXPIRED',
        signature_url: null,
        signature_token_hash: null,
      }),
    ) !== null,
    'vendedor sem link público não renova',
  );
}

console.log('\n=== Patch não apaga evidências e vale 30 dias ===');
{
  const now = '2026-11-04T15:00:00.000Z';
  const expiresAt = signatureExpiresAt(new Date(now));
  const patch = buildPartyLinkReissuePatch({
    tokenHash: 'hash-new',
    signUrl: 'https://svlotes.com.br/sign/sale/new-token',
    now,
    expiresAt,
  });
  for (const key of [
    'signed_at',
    'signature_hash',
    'ip_address',
    'user_agent',
    'signature_data',
    'generated_html',
  ]) {
    ok(!(key in patch), `patch não grava ${key}`);
  }
  ok(patch.status === 'PENDING', 'volta só para PENDING');
  ok(
    new Date(expiresAt).toISOString().startsWith('2026-12-04'),
    'nova validade de 30 dias',
  );

  const signedSibling = party({
    id: 'done',
    role: 'BUYER',
    status: 'SIGNED',
    signed_at: '2026-08-10T12:00:00.000Z',
    signature_hash: 'sha-buyer',
    ip_address: '198.51.100.8',
    user_agent: 'Chrome',
    signature_data: { browser: 'Chrome', os: 'Android' },
  });
  const expired = party({
    id: 'aldenise',
    role: 'VENDOR',
    status: 'EXPIRED',
    signer_name: 'ALDENISE ALVES SOUSA',
  });
  const renewed = { ...expired, ...patch, id: expired.id, role: expired.role };
  ok(renewed.status === 'PENDING', 'somente a selecionada volta a PENDING');
  ok(renewed.signature_token_hash === 'hash-new', 'token novo');
  ok(renewed.signature_token_hash !== expired.signature_token_hash, 'token anterior substituído');
  ok(signedSibling.status === 'SIGNED', 'assinatura concluída permanece');
  ok(signedSibling.signature_hash === 'sha-buyer', 'hash anterior permanece');
  ok(signedSibling.ip_address === '198.51.100.8', 'IP anterior permanece');
  ok(
    (signedSibling.signature_data as { browser?: string }).browser === 'Chrome',
    'evidência de navegador permanece',
  );
}

console.log('\n=== Dois expirados e status do processo ===');
{
  const before = [
    { role: 'BUYER' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'SIGNED' },
    { role: 'VENDOR' as const, status: 'EXPIRED' },
    { role: 'WITNESS_1' as const, status: 'SIGNED' },
    { role: 'WITNESS_2' as const, status: 'EXPIRED' },
  ];
  ok(
    computeAggregateSaleSignatureStatus(before) !== 'EXPIRED' &&
      computeAggregateSaleSignatureStatus(before) !== 'CANCELLED' &&
      computeAggregateSaleSignatureStatus(before) !== 'SIGNED',
    '3 assinaturas e 2 expirados não cancelam nem concluem o processo',
  );
  const afterOne = before.map((row, index) =>
    index === 2 ? { ...row, status: 'PENDING' as const } : row,
  );
  ok(afterOne[4].status === 'EXPIRED', 'a outra expirada não muda');
  ok(
    computeAggregateSaleSignatureStatus(afterOne) !== 'SIGNED' &&
      computeAggregateSaleSignatureStatus(afterOne) !== 'EXPIRED',
    'renovar uma linha não conclui nem recria o processo',
  );
  ok(
    computeAggregateSaleSignatureStatus([
      { role: 'BUYER', status: 'EXPIRED' },
      { role: 'VENDOR', status: 'EXPIRED' },
    ]) === 'EXPIRED',
    'processo só fica EXPIRED quando todas as linhas expiraram',
  );
  ok(
    computeAggregateSaleSignatureStatus([
      { role: 'BUYER', status: 'PENDING' },
      { role: 'VENDOR', status: 'SIGNED' },
    ]) === 'PARTIALLY_SIGNED',
    'depois da renovação o agregado sai de EXPIRED',
  );
}

console.log('\n=== Token válido ignora prazo antigo do processo ===');
{
  const open = {
    status: 'PENDING',
    expires_at: '2026-12-04T15:00:00.000Z',
  };
  const now = new Date('2026-11-04T15:00:00.000Z');
  ok(individualPartyLinkStillOpen(open, now), 'link novo ainda vale');
  ok(
    !processStatusBlocksIndividualParty('EXPIRED', open, now),
    'processo EXPIRED não bloqueia token individual válido',
  );
  ok(
    processStatusBlocksIndividualParty(
      'EXPIRED',
      { status: 'PENDING', expires_at: '2026-09-01T00:00:00.000Z' },
      now,
    ),
    'token individual vencido continua bloqueado',
  );
  ok(
    processStatusBlocksIndividualParty('SIGNED', open, now),
    'processo SIGNED continua bloqueado',
  );
  ok(
    processStatusBlocksIndividualParty('CANCELLED', open, now),
    'processo CANCELLED continua bloqueado',
  );
  ok(
    processStatusBlocksIndividualParty('PARTIALLY_SIGNED', open, now) === false,
    'processo parcial não bloqueia o link novo',
  );
}

console.log('\n=== Tela e API não devolvem o link morto ===');
{
  const views = toPublicPartyViews(
    [
      party({
        id: 'aldenise',
        role: 'VENDOR',
        status: 'EXPIRED',
        signer_name: 'ALDENISE ALVES SOUSA',
      }),
      party({
        id: 'other-expired',
        role: 'WITNESS_2',
        status: 'EXPIRED',
        signer_name: 'OUTRA TESTEMUNHA',
        signature_token_hash: 'hash-other',
        signature_url: 'https://svlotes.com.br/sign/sale/other-old',
      }),
      party({
        id: 'done',
        role: 'BUYER',
        status: 'SIGNED',
        signer_name: 'COMPRADOR',
        signed_at: '2026-08-10T12:00:00.000Z',
      }),
    ],
    { includeUrls: true, contractModel: 'ARAGUAIA' },
  );
  const aldenise = views.find((row) => row.id === 'aldenise');
  const other = views.find((row) => row.id === 'other-expired');
  const done = views.find((row) => row.id === 'done');
  ok(aldenise?.canRenewExpired === true, 'botão da vendedora expirada');
  ok(aldenise?.canShare === false, 'link antigo da vendedora não fica compartilhável');
  ok(!aldenise?.signatureUrl, 'URL antiga da vendedora não volta na API');
  ok(other?.canRenewExpired === true, 'segunda expirada tem o próprio botão');
  ok(other?.id !== aldenise?.id, 'participantes permanecem distintos');
  ok(done?.canRenewExpired !== true, 'quem já assinou não recebe botão de renovação');
}

console.log('\n=== Fontes não reenviam o contrato nem expõem o token ===');
{
  const flow = readFileSync(
    join(root, 'lib/saleContractSignaturePartyFlow.ts'),
    'utf8',
  );
  const start = flow.indexOf('export async function reissueExternalPartyLink');
  const end = flow.indexOf('\nexport ', start + 10);
  const fn = flow.slice(start, end === -1 ? undefined : end);
  ok(fn.includes('previousExpiresAt'), 'evento guarda o prazo anterior');
  ok(fn.includes('expiresAt: result.party.expires_at'), 'evento guarda o prazo novo');
  ok(fn.includes('actorUserId'), 'evento guarda o operador');
  ok(fn.includes('tokenPreview'), 'evento guarda só o prefixo do token');
  ok(!fn.includes('signatureToken: result.token'), 'evento não grava o token completo');
  ok(!fn.includes('sendSaleContractForSignature'), 'renovação não reenvia o contrato');
  ok(!fn.includes('cancelOpenSaleSignatures'), 'renovação não cancela o processo');
  ok(fn.includes("=== 'EXPIRED'"), 'processo EXPIRED é recalculado');
  ok(fn.includes('syncAggregateSignatureStatus'), 'recalculo usa o agregado das linhas');

  const route = readFileSync(
    join(root, 'app/api/sign/sale/[token]/route.ts'),
    'utf8',
  );
  ok(route.includes('!tokenIsThisParty'), 'prazo antigo do processo não vence token de participante');
  const ui = readFileSync(
    join(root, 'components/contracts/SaleContractSignatureSection.tsx'),
    'utf8',
  );
  ok(ui.includes('canRenewExpired'), 'tela oferece renovação ao expirado');
  ok(ui.includes('Gerar novo link'), 'rótulo do botão');
  ok(ui.includes('Validade:'), 'tela mostra a validade do participante');
}

console.log('\nRenovação individual de link expirado: ok');
