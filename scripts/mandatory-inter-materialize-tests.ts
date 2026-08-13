/**
 * Materialização GET-only Inter Cobrança V3 → bank_charges existente.
 * npm run test:inter-materialize
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  decodeInterCobrancaPdfPayload,
  interDetailHasPaymentArtifacts,
  normalizeInterCobrancaDetail,
  pollInterCobrancaUntilReady,
} from '../lib/banking/inter/interCobrancaClient';
import {
  buildInterBankChargeArtifactPatch,
  refreshInterChargeArtifacts,
} from '../lib/banking/inter/interSaleChargeService';
import { resolveInterIssuedChargeActions } from '../lib/charges/interChargeActions';
import { canGenerateAsaasChargeWithHistory } from '../lib/finance/companyAsaasChargeLinkGuards';
import type { InterOAuthCredentials, InterOAuthFetchFn } from '../lib/banking/inter/interOAuthClient';
import type { CompanyAsaasChargeResponse } from '../lib/finance/companyAsaasChargeTypes';

type Row = Record<string, unknown>;

const CREDENTIALS: InterOAuthCredentials = {
  companyId: 'co-1',
  environment: 'SANDBOX',
  clientId: 'cid',
  clientSecret: 'sec',
  certificatePem: '-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----',
  privateKeyPem: '-----BEGIN PRIVATE KEY-----\nY\n-----END PRIVATE KEY-----',
};

const SIBLING_RAW = {
  cobranca: {
    codigoSolicitacao: '937fb876-9e2f-4cf2-a2aa-d6be84923b7f',
    situacao: 'A_RECEBER',
    valorNominal: 11.11,
  },
  boleto: {
    nossoNumero: '90816247624',
    codigoBarras: '07791159401111000000000000000000000000000000',
    linhaDigitavel: '07790001161111000000000000000000000000000000000',
  },
  pix: {
    txid: 'txid-inter-35-chars-xxxxxxxxxxxxx',
    pixCopiaECola: '00020101021226580014BR.GOV.BCB.PIX',
  },
};

function charge(partial: Partial<CompanyAsaasChargeResponse>): CompanyAsaasChargeResponse {
  return {
    id: 'bc-1',
    companyId: 'co-1',
    customerId: 'cu-1',
    saleId: 's-1',
    installmentId: 'fr-1',
    asaasPaymentId: '937fb876-9e2f-4cf2-a2aa-d6be84923b7f',
    billingType: 'BOLETO',
    status: 'REGISTERED',
    value: 11.11,
    dueDate: '2026-10-09',
    invoiceUrl: null,
    bankSlipUrl: null,
    bankSlipIdentification: null,
    pixQrCode: null,
    pixCopyPaste: null,
    financialAccountId: null,
    paymentLink: null,
    paidAt: null,
    createdAt: '2026-08-13T11:32:55.789Z',
    updatedAt: '2026-08-13T11:32:55.789Z',
    asaasRemoteStatus: 'A_RECEBER',
    nossoNumero: null,
    barCode: null,
    ...partial,
  };
}

function createRefreshMock(seed: Row) {
  const charges = [{ ...seed }];
  let insertCalled = 0;
  const admin = {
    from: (table: string) => {
      const state: { op: string; payload: Row | null; filters: Array<[string, unknown]> } = {
        op: 'select',
        payload: null,
        filters: [],
      };
      const api: Record<string, unknown> = {
        select: () => api,
        insert: () => {
          insertCalled += 1;
          return api;
        },
        update: (payload: Row) => {
          state.op = 'update';
          state.payload = payload;
          return api;
        },
        eq: (col: string, val: unknown) => {
          state.filters.push([col, val]);
          return api;
        },
        maybeSingle: async () => {
          if (table !== 'bank_charges') return { data: null, error: null };
          if (state.op === 'update') {
            Object.assign(charges[0], state.payload);
            return { data: { ...charges[0] }, error: null };
          }
          const byExt = state.filters.find((f) => f[0] === 'external_id');
          if (byExt) {
            return {
              data: charges.find((c) => c.external_id === byExt[1]) || null,
              error: null,
            };
          }
          return { data: charges[0], error: null };
        },
      };
      return api;
    },
  };
  return {
    admin: admin as never,
    charges,
    insertCalled: () => insertCalled,
  };
}

function makeGetFetch(bodies: Row[]): InterOAuthFetchFn {
  let tokenDone = false;
  let getIdx = 0;
  return async (url, init) => {
    if (!tokenDone && init.method === 'POST') {
      tokenDone = true;
      return {
        status: 200,
        bodyText: JSON.stringify({
          access_token: 'tok',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      };
    }
    const body = bodies[Math.min(getIdx, bodies.length - 1)];
    getIdx += 1;
    return { status: 200, bodyText: JSON.stringify(body) };
  };
}

function main() {
  console.log('\n=== Inter materialize GET-only ===\n');

  const normalized = normalizeInterCobrancaDetail(SIBLING_RAW);
  assert.equal(normalized.situacao, 'A_RECEBER');
  assert.equal(normalized.linhaDigitavel, SIBLING_RAW.boleto.linhaDigitavel);
  assert.equal(normalized.codigoBarras, SIBLING_RAW.boleto.codigoBarras);
  assert.equal(normalized.nossoNumero, SIBLING_RAW.boleto.nossoNumero);
  assert.equal(normalized.pixCopiaECola, SIBLING_RAW.pix.pixCopiaECola);
  assert.equal(normalized.txid, SIBLING_RAW.pix.txid);
  assert.equal(interDetailHasPaymentArtifacts(normalized), true);
  console.log('OK normalize siblings boleto/pix');

  const existing: Row = {
    id: '2be6533a-9430-4db3-92d0-8da03b48242a',
    company_id: 'co-1',
    provider: 'INTER',
    status: 'REGISTERED',
    external_id: SIBLING_RAW.cobranca.codigoSolicitacao,
    finance_receipt_id: '58db17c5-75e1-47c8-a38a-b132ff4527b8',
    amount: 11.11,
    due_date: '2026-10-09',
    digitable_line: null,
    barcode: null,
    pix_copy_paste: null,
    our_number: null,
    txid: null,
    metadata: { codigoSolicitacao: SIBLING_RAW.cobranca.codigoSolicitacao },
  };
  const patch = buildInterBankChargeArtifactPatch(existing, normalized);
  assert.equal(patch.digitable_line, normalized.linhaDigitavel);
  assert.equal(patch.barcode, normalized.codigoBarras);
  assert.equal(patch.our_number, normalized.nossoNumero);
  assert.equal(patch.pix_copy_paste, normalized.pixCopiaECola);
  assert.equal(patch.txid, normalized.txid);
  assert.equal(patch.status, 'REGISTERED');
  console.log('OK artifact patch');

  const paidPatch = buildInterBankChargeArtifactPatch({ ...existing, status: 'PAID' }, normalized);
  assert.equal(paidPatch.status, 'PAID');
  console.log('OK PAID não é rebaixado');

  void (async () => {
    const mock = createRefreshMock(existing);
    const first = await refreshInterChargeArtifacts(mock.admin, {
      companyId: 'co-1',
      externalId: String(existing.external_id),
      detail: normalized,
    });
    assert.equal(first.created, false);
    assert.equal(first.inserted, false);
    assert.equal(first.reused, true);
    assert.equal(mock.insertCalled(), 0);
    assert.equal(mock.charges.length, 1);
    assert.equal(Boolean(mock.charges[0].digitable_line), true);
    assert.equal(Boolean(mock.charges[0].pix_copy_paste), true);
    assert.equal(Boolean(mock.charges[0].txid), true);

    const second = await refreshInterChargeArtifacts(mock.admin, {
      companyId: 'co-1',
      externalId: String(existing.external_id),
      detail: normalized,
    });
    assert.equal(second.inserted, false);
    assert.equal(mock.insertCalled(), 0);
    assert.equal(mock.charges.length, 1);
    console.log('OK refresh idempotente (sem insert, 1 linha)');

    let missingThrew = false;
    try {
      await refreshInterChargeArtifacts(createRefreshMock({ ...existing, id: 'x', external_id: 'other' }).admin, {
        companyId: 'co-1',
        externalId: 'nao-existe',
        detail: normalized,
      });
    } catch (err) {
      missingThrew = /não encontrada/i.test(err instanceof Error ? err.message : '');
    }
    assert.equal(missingThrew, true);
    console.log('OK refresh sem linha local não emite');

    const sleeps: number[] = [];
    const polled = await pollInterCobrancaUntilReady(CREDENTIALS, '937fb876-9e2f-4cf2-a2aa-d6be84923b7f', {
      fetchFn: makeGetFetch([
        { cobranca: { codigoSolicitacao: '937fb876-9e2f-4cf2-a2aa-d6be84923b7f', situacao: 'A_RECEBER' } },
        SIBLING_RAW,
      ]),
      maxAttempts: 4,
      initialDelayMs: 5,
      sleepFn: async (ms) => {
        sleeps.push(ms);
      },
    });
    assert.equal(polled.linhaDigitavel, SIBLING_RAW.boleto.linhaDigitavel);
    assert.ok(sleeps.length >= 1);
    console.log('OK poll não encerra em A_RECEBER sem artefatos');

    const pdf = decodeInterCobrancaPdfPayload(
      { pdf: Buffer.from('%PDF-1.4 mock').toString('base64') },
      '',
    );
    assert.ok(pdf && pdf.toString('utf8').startsWith('%PDF'));
    console.log('OK decode PDF oficial base64');

    const empty = charge({});
    const emptyUi = resolveInterIssuedChargeActions({ charge: empty, installmentPaid: false });
    assert.equal(emptyUi.hideGenerate, true);
    assert.equal(emptyUi.showCopyLinha, false);
    assert.equal(emptyUi.showCopyPix, false);
    assert.equal(emptyUi.showOfficialPdf, true);
    assert.equal(emptyUi.showRefresh, true);

    const ready = charge({
      bankSlipIdentification: SIBLING_RAW.boleto.linhaDigitavel,
      barCode: SIBLING_RAW.boleto.codigoBarras,
      nossoNumero: SIBLING_RAW.boleto.nossoNumero,
      pixCopyPaste: SIBLING_RAW.pix.pixCopiaECola,
    });
    const readyUi = resolveInterIssuedChargeActions({ charge: ready, installmentPaid: false });
    assert.equal(readyUi.hideGenerate, true);
    assert.equal(readyUi.showCopyLinha, true);
    assert.equal(readyUi.showCopyPix, true);
    assert.equal(readyUi.showOfficialPdf, true);

    assert.equal(
      canGenerateAsaasChargeWithHistory({
        installmentPaid: false,
        integrationActive: true,
        companyAsaasEnabled: true,
        ownerReadOnly: false,
        charge: ready,
      }),
      false,
    );
    console.log('OK UI Inter: sem Gerar, com copiar/PDF após artefatos');

    const root = path.join(__dirname, '..');
    const actions = fs.readFileSync(
      path.join(root, 'components/charges/ChargeInstallmentActions.tsx'),
      'utf8',
    );
    assert.match(actions, /hideGenerate/);
    assert.match(actions, /Baixar boleto/);
    assert.match(actions, /Atualizar dados/);
    assert.match(actions, /Copiar linha digitável/);
    assert.match(actions, /Copiar Pix/);
    const refreshRoute = fs.readFileSync(
      path.join(root, 'app/api/finance/inter/refresh-charge/route.ts'),
      'utf8',
    );
    assert.match(refreshRoute, /refreshInterChargeArtifacts/);
    assert.match(refreshRoute, /created: false/);
    const pdfRoute = fs.readFileSync(path.join(root, 'app/api/finance/inter/pdf/route.ts'), 'utf8');
    assert.match(pdfRoute, /fetchInterCobrancaPdf/);
    assert.doesNotMatch(pdfRoute, /createInterCobranca/);
    console.log('OK arquivos Central/refresh/PDF');

    console.log('\n=== Inter materialize OK ===\n');
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

main();
