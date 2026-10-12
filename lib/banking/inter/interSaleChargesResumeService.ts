/**
 * Fachada servidor da retomada Inter. Sem Asaas. Sem emissão em Production.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  InterCobrancaHttpError,
  createInterCobranca,
  fetchInterCobrancaByCodigo,
  listInterCobrancasBySeuNumero,
  type InterCreateCobrancaInput,
} from '@/lib/banking/inter/interCobrancaClient';
import { loadInterSecretsForServer } from '@/lib/banking/inter/interConfigRepository';
import type { InterOAuthCredentials, InterOAuthFetchFn } from '@/lib/banking/inter/interOAuthClient';
import {
  buildInterChargeIdempotencyKey,
  buildInterBankChargeArtifactPatch,
  findActiveInterBankChargeForReceipt,
  getInterSaleChargesSummary,
  interBankChargeMissingArtifacts,
} from '@/lib/banking/inter/interSaleChargeService';
import {
  INTER_RESUME_JOBS_METADATA_KEY,
  buildInterSeuNumero,
  canPersistInterResumeChargeStatus,
  interResumePublicView,
  resolveInterResumeEmitMode,
  type InterSaleChargesResumeJob,
} from '@/lib/banking/inter/interSaleChargesResume';
import { createSupabaseInterResumeStore } from '@/lib/banking/inter/interSaleChargesResumeSupabase';
import {
  InterResumeBlockedError,
  InterResumeConflictError,
  pauseInterResumeJob,
  startInterResumeJob,
  tickInterResumeJob,
  type InterResumePorts,
} from '@/lib/banking/inter/interSaleChargesResumeWorker';
import { resolveSaleChargesProvider } from '@/lib/finance/saleChargesProvider';
import { COMPANY_ASAAS_FINE_PERCENT, COMPANY_ASAAS_INTEREST_PERCENT_MONTHLY } from '@/lib/finance/asaasCompanyLateFees';
import { resolveCustomerDocumentDigits } from '@/lib/customerIdentity';
import { isValidBrazilianTaxDocument } from '@/lib/inputMasks';
import {
  isDevelopHomologRuntime,
  isProductionSupabaseRuntime,
} from '@/lib/homolog/env';

export { InterResumeBlockedError, InterResumeConflictError };

function onlyDigits(v: unknown): string {
  return String(v || '').replace(/\D/g, '');
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function resolveInterResumeRuntimeMode(bankEnvironment?: string | null): 'simulate' | 'live' {
  const mode = resolveInterResumeEmitMode({
    vercelEnv: process.env.VERCEL_ENV,
    isProductionSupabase: isProductionSupabaseRuntime(),
    isDevelopHomolog: isDevelopHomologRuntime(),
    bankEnvironment,
  });
  if (mode === 'blocked') {
    throw new InterResumeBlockedError(
      'Retomada Inter bloqueada neste ambiente (Production/Preview com banco de Production). Use Develop/sandbox e dados de teste.',
    );
  }
  return mode;
}

function buildPagador(customer: Record<string, unknown>): InterCreateCobrancaInput['pagador'] {
  const doc = resolveCustomerDocumentDigits({
    cpf_cnpj: customer.cpf_cnpj as string | null,
    document: customer.document as string | null,
  });
  if (!isValidBrazilianTaxDocument(doc)) {
    throw new Error('Cadastro incompleto: informe CPF/CNPJ antes de emitir no Inter.');
  }
  const cep = onlyDigits(customer.cep || customer.zip_code);
  const cidade = String(customer.city || '').trim();
  const uf = String(customer.state_uf || customer.state || '')
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const endereco = String(customer.address || '').trim();
  if (!endereco || cep.length !== 8 || !cidade || uf.length !== 2) {
    throw new Error('Endereço incompleto do cliente para emitir no Inter.');
  }
  const phone = onlyDigits(customer.phone);
  return {
    cpfCnpj: doc,
    tipoPessoa: doc.length === 14 ? 'JURIDICA' : 'FISICA',
    nome: String(customer.name || '').trim().slice(0, 100),
    email: customer.email ? String(customer.email).trim() : undefined,
    endereco: endereco.slice(0, 100),
    numero: 'S/N',
    bairro: String(customer.neighborhood || 'NAO INFORMADO').trim().slice(0, 60) || 'NAO INFORMADO',
    cidade: cidade.slice(0, 60),
    uf,
    cep,
    ddd: phone.length >= 10 ? phone.slice(0, 2) : undefined,
    telefone: phone.length >= 10 ? phone.slice(2, 11) : undefined,
  };
}

async function loadCreds(
  admin: SupabaseClient,
  companyId: string,
  integrationId: string,
  financialAccountId: string | null,
) {
  const secrets = await loadInterSecretsForServer(admin, companyId, {
    integrationId,
    financialAccountId,
  });
  if (!secrets) throw new Error('Credenciais Inter ausentes para esta conta financeira.');
  const creds: InterOAuthCredentials = {
    companyId,
    integrationId: secrets.integrationId,
    environment: secrets.environment,
    clientId: secrets.clientId,
    clientSecret: secrets.clientSecret,
    certificatePem: secrets.certificatePem,
    privateKeyPem: secrets.privateKeyPem,
  };
  return { secrets, creds };
}

export function createInterResumePorts(params: {
  admin: SupabaseClient;
  companyId: string;
  saleId: string;
  integrationId: string;
  financialAccountId: string | null;
  userId?: string | null;
  mode: 'simulate' | 'live';
  fetchFn?: InterOAuthFetchFn;
}): InterResumePorts {
  const { admin, companyId, saleId, integrationId, financialAccountId, userId, mode, fetchFn } =
    params;
  let simulateSeq = 0;
  return {
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    newJobId: () => `inter-resume-${saleId.slice(0, 8)}-${Date.now().toString(36)}`,
    newLeaseOwner: () => `lease-${Math.random().toString(36).slice(2, 10)}`,
    async listMissing() {
      const summary = await getInterSaleChargesSummary(admin, companyId, saleId);
      return summary.missingInstallments.map((row) => ({
        id: row.id,
        installmentNumber: row.installmentNumber,
        dueDate: row.dueDate,
        amount: row.amount,
        paid: false,
      }));
    },
    async findActiveCharge(installmentId) {
      const row = await findActiveInterBankChargeForReceipt(admin, companyId, installmentId);
      if (!row) return null;
      return {
        id: String(row.id || ''),
        status: String(row.status || ''),
        external_id: String(row.external_id || ''),
        finance_receipt_id: installmentId,
      };
    },
    async persistEmittedCharge(input) {
      const existing = await findActiveInterBankChargeForReceipt(admin, companyId, input.installmentId);
      if (existing?.id) {
        if (String(existing.status || '').toUpperCase() === 'PAID') return;
        const meta = asRecord(existing.metadata);
        await admin
          .from('bank_charges')
          .update({
            external_id: input.codigoSolicitacao,
            metadata: {
              ...meta,
              codigoSolicitacao: input.codigoSolicitacao,
              seuNumero: input.seuNumero,
              resumeAttempts: input.attempts,
              last_error: null,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .eq('company_id', companyId);
        return;
      }
      const { data: receipt, error } = await admin
        .from('finance_receipts')
        .select('id, customer_id, amount, due_date, status')
        .eq('id', input.installmentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (String(receipt?.status || '').toLowerCase() === 'pago') return;
      const now = new Date().toISOString();
      await admin.from('bank_charges').insert({
        company_id: companyId,
        integration_id: integrationId,
        financial_account_id: financialAccountId,
        finance_receipt_id: input.installmentId,
        sale_id: saleId,
        customer_id: receipt?.customer_id || null,
        charge_type: 'BOLETO_PIX',
        provider: 'INTER',
        environment: 'SANDBOX',
        external_id: input.codigoSolicitacao,
        amount: input.amount,
        due_date: input.dueDate,
        status: 'PENDING',
        idempotency_key: buildInterChargeIdempotencyKey(companyId, input.installmentId),
        metadata: {
          codigoSolicitacao: input.codigoSolicitacao,
          seuNumero: input.seuNumero,
          interSituacao: 'EM_PROCESSAMENTO',
          resumeAttempts: input.attempts,
          providerLabel: 'Banco Inter',
          resumeMode: mode,
        },
        created_by: userId || null,
        created_at: now,
        updated_at: now,
      });
    },
    async persistInstallmentError(input) {
      if (!canPersistInterResumeChargeStatus({
        currentStatus: input.currentStatus,
        nextStatus: 'FAILED',
      })) {
        return;
      }
      const existing = await findActiveInterBankChargeForReceipt(admin, companyId, input.installmentId);
      if (existing?.id) {
        if (String(existing.status || '').toUpperCase() === 'PAID') return;
        if (String(existing.external_id || '').trim()) {
          const meta = asRecord(existing.metadata);
          await admin
            .from('bank_charges')
            .update({
              metadata: {
                ...meta,
                last_error: input.message,
                resumeAttempts: input.attempts,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
            .eq('company_id', companyId);
          return;
        }
        await admin
          .from('bank_charges')
          .update({
            status: 'FAILED',
            metadata: {
              ...asRecord(existing.metadata),
              last_error: input.message,
              resumeAttempts: input.attempts,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .eq('company_id', companyId);
      }
    },
    async emitCobranca(input) {
      if (mode === 'simulate') {
        simulateSeq += 1;
        return { ok: true, codigoSolicitacao: `SIM-${input.seuNumero}-${simulateSeq}` };
      }
      const { creds } = await loadCreds(admin, companyId, integrationId, financialAccountId);
      const { data: receipt, error } = await admin
        .from('finance_receipts')
        .select(
          `
          id, amount, due_date, installment_number, status,
          customers!finance_receipts_customer_id_fkey(
            name, cpf_cnpj, document, email, phone, address, neighborhood, city, state, state_uf, cep, zip_code
          )
        `,
        )
        .eq('id', input.installmentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!receipt) throw new Error('Parcela não encontrada.');
      if (String(receipt.status || '').toLowerCase() === 'pago') {
        throw new Error('Parcela já está paga.');
      }
      const customerRaw = receipt.customers as Record<string, unknown> | Record<string, unknown>[] | null;
      const customer = (Array.isArray(customerRaw) ? customerRaw[0] : customerRaw) || {};
      const payload: InterCreateCobrancaInput = {
        seuNumero: input.seuNumero || buildInterSeuNumero(receipt.installment_number, input.installmentId),
        valorNominal: input.amount,
        dataVencimento: input.dueDate,
        numDiasAgenda: 60,
        pagador: buildPagador(asRecord(customer)),
        formasRecebimento: ['BOLETO', 'PIX'],
        multa: { codigo: 'PERCENTUAL', taxa: COMPANY_ASAAS_FINE_PERCENT },
        mora: { codigo: 'TAXAMENSAL', taxa: COMPANY_ASAAS_INTEREST_PERCENT_MONTHLY },
      };
      try {
        const created = await createInterCobranca(creds, payload, { fetchFn });
        return { ok: true, codigoSolicitacao: created.codigoSolicitacao };
      } catch (err) {
        if (err instanceof InterCobrancaHttpError) {
          return {
            ok: false,
            httpStatus: err.status,
            message: err.message,
            retryAfterMs: err.retryAfterMs,
          };
        }
        const message = err instanceof Error ? err.message : 'Falha de rede Inter.';
        if (/timeout|network|fetch|ECONNRESET|socket/i.test(message)) {
          return { ok: false, lost: true };
        }
        return { ok: false, httpStatus: 500, message };
      }
    },
    async reconcileBySeuNumero(input) {
      if (mode === 'simulate') return null;
      const { creds } = await loadCreds(admin, companyId, integrationId, financialAccountId);
      const hit = await listInterCobrancasBySeuNumero(creds, input, { fetchFn });
      if (!hit?.codigoSolicitacao) return null;
      return { codigoSolicitacao: hit.codigoSolicitacao, situacao: hit.situacao };
    },
    async listChargesNeedingArtifacts() {
      const { data, error } = await admin
        .from('bank_charges')
        .select('id, finance_receipt_id, external_id, status, digitable_line, barcode, pix_copy_paste, our_number, txid')
        .eq('company_id', companyId)
        .eq('sale_id', saleId)
        .eq('provider', 'INTER');
      if (error) throw new Error(error.message);
      return (data || [])
        .filter((row) => {
          if (String(row.status || '').toUpperCase() === 'PAID') return false;
          if (!String(row.external_id || '').trim()) return false;
          return interBankChargeMissingArtifacts(row as Record<string, unknown>);
        })
        .map((row) => ({
          installmentId: String(row.finance_receipt_id || ''),
          codigoSolicitacao: String(row.external_id || ''),
          status: String(row.status || ''),
        }))
        .filter((row) => row.installmentId && row.codigoSolicitacao);
    },
    async fetchArtifacts(codigoSolicitacao) {
      if (mode === 'simulate') {
        return {
          codigoSolicitacao,
          linhaDigitavel: '00000.00000 00000.000000 00000.000000 0 00000000000000',
          codigoBarras: '00000000000000000000000000000000000000000000',
          pixCopiaECola: `SIM-PIX-${codigoSolicitacao}`,
          nossoNumero: codigoSolicitacao.slice(-10),
          txid: `TX${codigoSolicitacao}`.slice(0, 26),
          situacao: 'A_RECEBER',
        };
      }
      const { creds } = await loadCreds(admin, companyId, integrationId, financialAccountId);
      return fetchInterCobrancaByCodigo(creds, codigoSolicitacao, { fetchFn });
    },
    async persistArtifacts(input) {
      if (!canPersistInterResumeChargeStatus({ currentStatus: input.currentStatus, nextStatus: 'REGISTERED' })) {
        return;
      }
      const existing = await findActiveInterBankChargeForReceipt(admin, companyId, input.installmentId);
      if (!existing?.id) return;
      if (String(existing.status || '').toUpperCase() === 'PAID') return;
      const patch = buildInterBankChargeArtifactPatch(existing, {
        codigoSolicitacao: input.detail.codigoSolicitacao,
        situacao: String(input.detail.situacao || 'A_RECEBER'),
        linhaDigitavel: input.detail.linhaDigitavel,
        codigoBarras: input.detail.codigoBarras,
        pixCopiaECola: input.detail.pixCopiaECola,
        nossoNumero: input.detail.nossoNumero,
        txid: input.detail.txid,
        raw: {},
      });
      await admin
        .from('bank_charges')
        .update(patch)
        .eq('id', existing.id)
        .eq('company_id', companyId);
    },
  };
}

async function resolveIntegration(
  admin: SupabaseClient,
  companyId: string,
  saleId: string,
) {
  const provider = await resolveSaleChargesProvider(admin, companyId, saleId);
  if (provider.provider !== 'INTER' || !provider.bankIntegrationId) {
    throw new Error('Conta financeira desta venda não está vinculada ao Banco Inter.');
  }
  const { data } = await admin
    .from('bank_integrations')
    .select('id, environment')
    .eq('id', provider.bankIntegrationId)
    .eq('company_id', companyId)
    .maybeSingle();
  return {
    integrationId: provider.bankIntegrationId,
    financialAccountId: provider.financialAccountId,
    bankEnvironment: String(data?.environment || 'SANDBOX'),
  };
}

export async function getInterResumeJobView(
  admin: SupabaseClient,
  companyId: string,
  saleId: string,
) {
  const resolved = await resolveIntegration(admin, companyId, saleId);
  const store = createSupabaseInterResumeStore(admin, resolved.integrationId);
  const job = await store.load(companyId, saleId);
  return interResumePublicView(job);
}

export async function startAndTickInterResumeJob(params: {
  admin: SupabaseClient;
  companyId: string;
  saleId: string;
  userId?: string | null;
  action: 'start' | 'pause' | 'tick';
  fetchFn?: InterOAuthFetchFn;
}): Promise<{ job: ReturnType<typeof interResumePublicView>; raw: InterSaleChargesResumeJob | null }> {
  const resolved = await resolveIntegration(params.admin, params.companyId, params.saleId);
  const mode = resolveInterResumeRuntimeMode(resolved.bankEnvironment);
  const store = createSupabaseInterResumeStore(params.admin, resolved.integrationId);
  const ports = createInterResumePorts({
    admin: params.admin,
    companyId: params.companyId,
    saleId: params.saleId,
    integrationId: resolved.integrationId,
    financialAccountId: resolved.financialAccountId,
    userId: params.userId,
    mode,
    fetchFn: params.fetchFn,
  });

  if (params.action === 'pause') {
    const paused = await pauseInterResumeJob({
      store,
      companyId: params.companyId,
      saleId: params.saleId,
      nowMs: Date.now(),
    });
    return { job: interResumePublicView(paused), raw: paused };
  }

  if (params.action === 'start') {
    await startInterResumeJob({
      store,
      ports,
      companyId: params.companyId,
      saleId: params.saleId,
      integrationId: resolved.integrationId,
      financialAccountId: resolved.financialAccountId,
      createdBy: params.userId,
      mode,
    });
  }

  const raw = await tickInterResumeJob({
    store,
    ports,
    companyId: params.companyId,
    saleId: params.saleId,
  });
  return { job: interResumePublicView(raw), raw };
}

export async function tickDueInterResumeJobs(
  admin: SupabaseClient,
  limit = 3,
): Promise<{ processed: number }> {
  if (isProductionSupabaseRuntime()) {
    return { processed: 0 };
  }
  const { data, error } = await admin
    .from('bank_integrations')
    .select('id, company_id, metadata, environment')
    .eq('provider', 'INTER')
    .limit(80);
  if (error) throw new Error(error.message);
  let processed = 0;
  for (const row of data || []) {
    if (processed >= limit) break;
    const jobs = asRecord(asRecord(row.metadata)[INTER_RESUME_JOBS_METADATA_KEY]);
    for (const [saleId, rawJob] of Object.entries(jobs)) {
      if (processed >= limit) break;
      const job = rawJob as InterSaleChargesResumeJob;
      if (!job || typeof job !== 'object') continue;
      if (job.status !== 'running' && job.status !== 'queued') continue;
      try {
        await startAndTickInterResumeJob({
          admin,
          companyId: String(row.company_id),
          saleId,
          action: 'tick',
        });
        processed += 1;
      } catch {
        /* próximo job */
      }
    }
  }
  return { processed };
}
