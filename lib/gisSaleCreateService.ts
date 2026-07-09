/**
 * Criação de venda pelo GIS — core transacional com logs [sales/create].
 * Contrato é gerado após marcar lote vendido; falha no contrato não reverte a venda.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getNextContractNumber, isValidStoredContractNumber } from '@/lib/contractNumber';
import { COMPANY_CONTRACT_LOAD_SELECT } from '@/lib/companyContractFields';
import { generateContractHTML } from '@/lib/contractTemplate';
import { mergeCustomerData, resolveOrCreateCustomer } from '@/lib/customerIdentity';
import { parseValidatedInstallmentsCount } from '@/lib/installmentsCount';
import { buildSaleSpouseDbPatch } from '@/lib/saleSpouseFields';
import {
  DEFAULT_INSTALLMENT_CORRECTION_TYPE,
  normalizeInstallmentCorrectionType,
} from '@/lib/installmentCorrectionType';
import { buildSaleEditFinancePayloads } from '@/lib/saleEditFinanceRecalc';
import { normalizeSaleContractModel, isRecantoPrimaveraContractModel } from '@/lib/contractModel';
import { embedRecantoContractSignatureInHtml } from '@/lib/recantoPrimaveraContractAssets';
import {
  attachBrokerSnapshotToSale,
  brokerRowToSnapshot,
} from '@/lib/saleBrokerSnapshot';
import { persistGeneratedContractHtml } from '@/lib/contractRegeneration';
import { BROKERS_CONTRACT_SELECT } from '@/lib/brokersContractQuery';
import { validateCustomerForContract } from '@/lib/validateCustomerForContract';
import { parseCurrencyBRLNumber } from '@/lib/currencyBrl';

const CONTRACT_GENERATION_TIMEOUT_MS = 25_000;

export type GisSaleCreateInput = {
  userId: string;
  userRole: string;
  tenantId: string;
  projectId: string;
  lot: {
    id: string;
    block?: string | null;
    block_name?: string | null;
    lot_block?: string | null;
    number?: string | null;
    lot_number?: string | null;
    project_id?: string | null;
    tenant_id?: string | null;
    projects?: { name?: string | null } | null;
  };
  finalPrice: number;
  customerData: Record<string, unknown>;
  brokerId: string | null;
  tenantContractModel?: string | null;
  isSuperAdmin?: boolean;
};

export type GisSaleCreateResult = {
  success: true;
  saleId: string;
  customerId: string;
  contractId: string | null;
  warnings: string[];
};

function logSaleStep(
  step: string,
  startedAt: number,
  extra?: Record<string, unknown>,
) {
  console.log('[sales/create]', step, {
    ms: Date.now() - startedAt,
    ...extra,
  });
}

async function withTimeout<T>(
  label: string,
  ms: number,
  fn: () => Promise<T>,
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Tempo esgotado na etapa: ${label}`)),
        ms,
      );
    }),
  ]);
}

async function insertContractForSale(
  supabase: SupabaseClient,
  payloads: Record<string, unknown>[],
): Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }> {
  let lastError: { message?: string } | null = null;

  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i];
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => v !== undefined),
    );

    const { data, error } = await supabase
      .from('contracts')
      .insert([cleaned])
      .select('id, contract_number, generated_html, sale_id')
      .single();

    if (!error && data) {
      return { data: data as Record<string, unknown>, error: null };
    }

    lastError = error;
    const missingCol = error?.message?.match(/Could not find the '(\w+)' column/i)?.[1];
    if (missingCol && missingCol in cleaned) {
      const { [missingCol]: _removed, ...withoutCol } = cleaned;
      const retry = await supabase
        .from('contracts')
        .insert([withoutCol])
        .select('id, contract_number, generated_html, sale_id')
        .single();
      if (!retry.error && retry.data) {
        return { data: retry.data as Record<string, unknown>, error: null };
      }
      lastError = retry.error;
    }
  }

  return { data: null, error: lastError };
}

async function rollbackPartialSale(
  supabase: SupabaseClient,
  params: {
    saleId?: string | null;
    contractId?: string | null;
    lotId: string;
  },
) {
  if (params.saleId) {
    await supabase.from('finance_receipts').delete().eq('sale_id', params.saleId);
    await supabase.from('broker_commissions').delete().eq('sale_id', params.saleId);
    await supabase.from('sales').delete().eq('id', params.saleId);
  }
  if (params.contractId) {
    await supabase.from('contracts').delete().eq('id', params.contractId);
  }
  await supabase
    .from('blocks')
    .update({
      status: 'Disponível',
      customer_id: null,
      sale_id: null,
      contract_id: null,
      broker_id: null,
    })
    .eq('id', params.lotId);
}

export async function executeGisSaleCreate(
  supabase: SupabaseClient,
  input: GisSaleCreateInput,
): Promise<GisSaleCreateResult> {
  const startedAt = Date.now();
  const warnings: string[] = [];
  let saleId: string | null = null;
  let contractId: string | null = null;

  logSaleStep('validate_payload', startedAt);

  const { tenantId, projectId, lot, finalPrice, customerData, brokerId } = input;
  const lotId = lot.id;

  const { data: blockRow, error: blockLoadErr } = await supabase
    .from('blocks')
    .select('id, status, sale_id, tenant_id, project_id')
    .eq('id', lotId)
    .maybeSingle();

  if (blockLoadErr || !blockRow) {
    throw new Error(blockLoadErr?.message || 'Lote não encontrado.');
  }

  const blockStatus = String(blockRow.status || '').toLowerCase();
  if (
    blockRow.sale_id &&
    (blockStatus === 'vendido' || blockStatus === 'sold')
  ) {
    throw new Error('Este lote já possui venda registrada.');
  }

  logSaleStep('upsert_customer', startedAt);
  const { customerId, clientId } = await resolveOrCreateCustomer(supabase, {
    form: customerData,
    tenantId,
    projectId,
    isSuperAdmin: input.isSuperAdmin === true,
    lotTenantId: lot.tenant_id,
    changedBy: input.userId,
  });

  const { data: projDataSnapshot } = await supabase
    .from('projects')
    .select('id, name, city, uf, forum_city')
    .eq('id', projectId)
    .maybeSingle();

  const pmtType = String(customerData.payment_type || 'À vista');
  const instCount =
    pmtType === 'Parcelado'
      ? parseValidatedInstallmentsCount(String(customerData.installments_count ?? ''))
      : 1;
  const saleContractModel = normalizeSaleContractModel(input.tenantContractModel);

  const recantoSignalContract =
    saleContractModel === 'RECANTO_PRIMAVERA'
      ? parseCurrencyBRLNumber(
          customerData.signal_contract_value || customerData.down_payment || '',
        )
      : null;
  const recantoSignalPaidAtSale =
    saleContractModel === 'RECANTO_PRIMAVERA' &&
    customerData.signal_paid_at_sale != null &&
    String(customerData.signal_paid_at_sale).trim() !== ''
      ? parseCurrencyBRLNumber(String(customerData.signal_paid_at_sale))
      : null;
  const recantoSignalRemaining =
    recantoSignalContract != null && recantoSignalPaidAtSale != null
      ? Math.max(0, recantoSignalContract - recantoSignalPaidAtSale)
      : null;
  const recantoSignalMode =
    saleContractModel === 'RECANTO_PRIMAVERA' &&
    recantoSignalRemaining != null &&
    recantoSignalRemaining > 0
      ? String(customerData.signal_remaining_payment_mode || 'FIRST_INSTALLMENTS')
      : null;
  const recantoSignalInstallments =
    recantoSignalMode === 'FIRST_INSTALLMENTS'
      ? Number(customerData.signal_remaining_installments) || null
      : recantoSignalMode === 'ALL_INSTALLMENTS'
        ? instCount
        : null;
  const recantoSignalInstallmentValue =
    recantoSignalRemaining != null &&
    recantoSignalInstallments &&
    recantoSignalInstallments > 0
      ? Math.round((recantoSignalRemaining / recantoSignalInstallments) * 100) / 100
      : null;

  const salePayload: Record<string, unknown> = {
    tenant_id: tenantId,
    company_id: tenantId,
    project_id: projectId,
    block_id: lotId,
    block_number: lot.block || lot.block_name || lot.lot_block || null,
    lot_number: lot.number || lot.lot_number || null,
    lot_id: lotId,
    customer_id: customerId,
    client_id: clientId,
    user_id: input.userId || null,
    agreed_price: customerData.final_value || finalPrice,
    lot_price: finalPrice,
    broker_id: brokerId,
    payment_type: pmtType,
    discount: parseCurrencyBRLNumber(customerData.discount_value),
    total_value: customerData.final_value || finalPrice,
    down_payment:
      recantoSignalContract ?? parseCurrencyBRLNumber(customerData.down_payment),
    installments_count: instCount,
    installment_correction_type:
      saleContractModel === 'RECANTO_PRIMAVERA'
        ? DEFAULT_INSTALLMENT_CORRECTION_TYPE
        : normalizeInstallmentCorrectionType(
            customerData.installment_correction_type,
          ),
    status: 'ACTIVE',
    signal_contract_value: recantoSignalContract,
    signal_paid_at_sale: recantoSignalPaidAtSale,
    signal_remaining_value: recantoSignalRemaining,
    signal_remaining_payment_mode: recantoSignalMode,
    signal_remaining_installments: recantoSignalInstallments,
    signal_remaining_installment_value: recantoSignalInstallmentValue,
    ...buildSaleSpouseDbPatch(customerData),
  };

  logSaleStep('create_sale', startedAt);
  try {
    const { data: saleData, error: saleError } = await supabase
      .from('sales')
      .insert([salePayload])
      .select('id')
      .single();

    if (saleError || !saleData?.id) {
      throw new Error(saleError?.message || 'Falha ao criar venda');
    }
    saleId = saleData.id as string;

    const { data: tenantContractRow } = await supabase
      .from('companies')
      .select('contract_model')
      .eq('id', tenantId)
      .maybeSingle();
    const contractModel = normalizeSaleContractModel(
      tenantContractRow?.contract_model ?? input.tenantContractModel,
    );

    const financePayloads = buildSaleEditFinancePayloads(
      tenantId,
      saleId,
      customerId,
      brokerId,
      { id: lotId, project_id: lot.project_id || projectId },
      customerData,
      { contractModel, cashInstallmentPaid: false },
    );

    logSaleStep('create_receipts', startedAt, { count: financePayloads.length });
    let financeData: Record<string, unknown>[] = [];
    if (financePayloads.length > 0) {
      const { data: fData, error: financeError } = await supabase
        .from('finance_receipts')
        .insert(financePayloads)
        .select('id, amount, due_date, status, installment_number');

      if (financeError || !fData) {
        throw new Error(financeError?.message || 'Falha ao criar parcelas');
      }
      financeData = fData as Record<string, unknown>[];
    }

    logSaleStep('update_lot_status', startedAt, { saleId });
    const { error: blockUpdErr } = await supabase
      .from('blocks')
      .update({
        status: 'Vendido',
        price: finalPrice,
        customer_id: customerId,
        sale_id: saleId,
        contract_id: null,
        broker_id: brokerId,
      })
      .eq('id', lotId);

    if (blockUpdErr) {
      throw new Error(blockUpdErr.message || 'Falha ao marcar lote como vendido');
    }

    logSaleStep('generate_contract', startedAt);
    try {
      await withTimeout('generate_contract', CONTRACT_GENERATION_TIMEOUT_MS, async () => {
        const { data: tenantData } = await supabase
          .from('companies')
          .select(COMPANY_CONTRACT_LOAD_SELECT)
          .eq('id', tenantId)
          .single();

        let fullCustomer = customerData;
        if (customerId) {
          const { data: custDb } = await supabase
            .from('customers')
            .select(
              'id, name, cpf_cnpj, document, cpf, rg, email, phone, address, neighborhood, city, state, state_uf, zip_code, profession, civil_state, marital_status',
            )
            .eq('id', customerId)
            .single();
          if (custDb) {
            fullCustomer = mergeCustomerData(custDb, customerData);
          }
        }

        const contractPayloadPartial = {
          project_name_snapshot: projDataSnapshot?.name || lot?.projects?.name || null,
          project_city_snapshot: projDataSnapshot?.city || null,
          project_uf_snapshot: projDataSnapshot?.uf || null,
          forum_city_snapshot:
            projDataSnapshot?.forum_city || projDataSnapshot?.city || null,
        };

        const customerForContract = { ...fullCustomer, id: customerId };
        const contractValidation = validateCustomerForContract(customerForContract);
        if (!contractValidation.valid) {
          warnings.push(
            `Contrato não gerado: faltam dados do comprador (${contractValidation.missingRequired.join(', ')}).`,
          );
          return;
        }

        const contractNumber = await getNextContractNumber(
          supabase,
          tenantId,
          tenantId,
        );
        if (!isValidStoredContractNumber(contractNumber)) {
          throw new Error(`Número de contrato inválido: ${contractNumber}`);
        }

        const { data: blockForContract } = await supabase
          .from('blocks')
          .select(
            'id, block_name, block, lot_number, number, area, segments_json, segment_edges, front_street, project_id',
          )
          .eq('id', lotId)
          .maybeSingle();

        let brokerSnapshot = null;
        if (brokerId) {
          const { data: brokerRow } = await supabase
            .from('brokers')
            .select(BROKERS_CONTRACT_SELECT)
            .eq('id', brokerId)
            .maybeSingle();
          brokerSnapshot = brokerRowToSnapshot(
            (brokerRow as Record<string, unknown>) || null,
          );
        }

        const receiptsSum = financeData.reduce(
          (acc, curr) => acc + Number(curr.amount || 0),
          0,
        );
        const nowIso = new Date().toISOString();
        const enrichedSaleData = attachBrokerSnapshotToSale(
          {
            ...salePayload,
            id: saleId,
            sale_date: nowIso,
            created_at: nowIso,
            receipts_sum: receiptsSum,
            finance_receipts: financeData,
            down_payment_due_date: customerData.down_payment_due_date || null,
            first_installment_due_date:
              customerData.first_installment_due_date || null,
          },
          brokerSnapshot,
        );

        const saleValue = Number(customerData.final_value || finalPrice) || 0;
        const downPaymentVal = parseCurrencyBRLNumber(customerData.down_payment);
        let contractHtml = generateContractHTML({
          tenant: tenantData || {},
          customer: fullCustomer || {},
          project: projDataSnapshot || lot.projects || {},
          block: blockForContract || lot,
          sale: enrichedSaleData,
          financeReceipts: financeData,
          contractSnapshot: {
            ...contractPayloadPartial,
            contract_number: contractNumber,
          },
        });

        if (isRecantoPrimaveraContractModel(tenantData)) {
          contractHtml = await embedRecantoContractSignatureInHtml(
            contractHtml,
            tenantData || {},
          );
        }

        const contractPayloads: Record<string, unknown>[] = [
          {
            tenant_id: tenantId,
            company_id: tenantId,
            sale_id: saleId,
            customer_id: customerId,
            project_id: projectId,
            block_id: lotId,
            broker_id: brokerId,
            contract_number: contractNumber,
            sale_value: saleValue,
            down_payment: downPaymentVal,
            installments: instCount,
            status: 'ativo',
            generated_html: contractHtml,
            created_at: new Date().toISOString(),
            ...contractPayloadPartial,
          },
          {
            tenant_id: tenantId,
            company_id: tenantId,
            sale_id: saleId,
            customer_id: customerId,
            project_id: projectId,
            block_id: lotId,
            contract_number: contractNumber,
            status: 'ativo',
            generated_html: contractHtml,
            ...contractPayloadPartial,
          },
          {
            tenant_id: tenantId,
            sale_id: saleId,
            customer_id: customerId,
            project_id: projectId,
            block_id: lotId,
            contract_number: contractNumber,
            status: 'ativo',
          },
        ];

        const { data: insertedContract, error: contractInsertError } =
          await insertContractForSale(supabase, contractPayloads);

        if (contractInsertError || !insertedContract) {
          warnings.push(
            `Contrato não criado: ${contractInsertError?.message || 'erro desconhecido'}.`,
          );
          return;
        }

        contractId = String(insertedContract.id || '');
        if (contractHtml && contractId) {
          const hasHtml = Boolean(
            insertedContract.generated_html &&
              String(insertedContract.generated_html).trim().length > 0,
          );
          if (!hasHtml) {
            await persistGeneratedContractHtml(
              supabase,
              contractId,
              contractHtml,
              insertedContract as Record<string, unknown>,
            );
          }
        }

        if (contractId) {
          await supabase
            .from('blocks')
            .update({ contract_id: contractId })
            .eq('id', lotId);
        }
      });
    } catch (contractErr: unknown) {
      const msg =
        contractErr instanceof Error ? contractErr.message : String(contractErr);
      warnings.push(`Contrato não gerado: ${msg}`);
    }

    if (input.userRole === 'BROKER' && brokerId && saleId) {
      try {
        const { data: brokerData } = await supabase
          .from('brokers')
          .select('commission_percent')
          .eq('id', brokerId)
          .single();
        const pct = Number(brokerData?.commission_percent) || 0;
        if (pct > 0) {
          const saleVal = Number(customerData.final_value || finalPrice) || 0;
          const cv = (saleVal * pct) / 100;
          await supabase.from('broker_commissions').insert([
            {
              company_id: tenantId,
              tenant_id: tenantId,
              broker_id: brokerId,
              sale_id: saleId,
              contract_id: contractId,
              customer_id: customerId || clientId,
              commission_percent: pct,
              amount: cv,
              status: 'pendente',
            },
          ]);
        }
      } catch (commErr) {
        console.warn('[sales/create] broker_commission_failed', commErr);
        warnings.push('Comissão do corretor não registrada automaticamente.');
      }
    }

    logSaleStep('response', startedAt, {
      saleId,
      contractId,
      warnings: warnings.length,
    });

    return {
      success: true,
      saleId,
      customerId,
      contractId,
      warnings,
    };
  } catch (err) {
    logSaleStep('response', startedAt, { rollback: true, error: String(err) });
    await rollbackPartialSale(supabase, {
      saleId,
      contractId,
      lotId,
    });
    throw err;
  }
}
