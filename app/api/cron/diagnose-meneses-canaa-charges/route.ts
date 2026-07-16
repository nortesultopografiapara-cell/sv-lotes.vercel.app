import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/apiSuperAdmin';
import { MENESES_COMPANY_ID } from '@/lib/saasContractContent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Token alinhado ao padrão de diagnose-meneses-finance (somente preview). */
const DIAG_TOKEN = 'sv-lotes-diag-canaa-charges-20260716';

/**
 * Diagnóstico READ-ONLY — QD 02 / LT 10 Chácaras Canaã (Menezes).
 * Bloqueado em production. Não altera dados.
 */
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const token = request.headers.get('x-diag-token');
  if (token !== DIAG_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { client: sb, error: configError } = createServiceSupabase();
  if (!sb || configError) {
    return NextResponse.json(
      { error: configError || 'Service role não configurada.' },
      { status: 503 },
    );
  }

  const companyId = MENESES_COMPANY_ID;

  try {
    // 1) Projetos Canaã
    const { data: projects, error: pe } = await sb
      .from('projects')
      .select('id, name, company_id, tenant_id')
      .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`)
      .ilike('name', '%cana%');
    if (pe) throw new Error(`projects: ${pe.message}`);

    const projectIds = (projects || []).map((p) => p.id);

    // 2) Lotes QD 02 LT 10
    let lots: Array<Record<string, unknown>> = [];
    if (projectIds.length) {
      const { data: lotRows, error: le } = await sb
        .from('lots')
        .select('id, number, block_id, project_id, status, company_id, tenant_id')
        .in('project_id', projectIds);
      if (le) throw new Error(`lots: ${le.message}`);

      const { data: blocks, error: be } = await sb
        .from('blocks')
        .select('id, block_name, name, number, project_id')
        .in('project_id', projectIds);
      if (be) throw new Error(`blocks: ${be.message}`);

      const blockById = new Map((blocks || []).map((b) => [b.id, b]));
      lots = (lotRows || [])
        .map((lot) => {
          const block = blockById.get(lot.block_id);
          const blockLabel = String(
            block?.block_name || block?.name || block?.number || '',
          ).trim();
          const lotLabel = String(lot.number || '').trim();
          return {
            ...lot,
            blockLabel,
            lotLabel,
            match:
              (blockLabel === '02' || blockLabel === '2' || /0?2/.test(blockLabel)) &&
              (lotLabel === '10' || lotLabel === '010'),
          };
        })
        .filter((l) => l.match);
    }

    const lotIds = lots.map((l) => String(l.id));

    // 3) Vendas desses lotes
    let sales: Array<Record<string, unknown>> = [];
    if (lotIds.length) {
      const { data: saleRows, error: se } = await sb
        .from('sales')
        .select(
          'id, status, company_id, tenant_id, project_id, lot_id, block_id, customer_id, financial_account_id, total_price, down_payment, created_at, updated_at',
        )
        .in('lot_id', lotIds)
        .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`)
        .order('created_at', { ascending: false });
      if (se) throw new Error(`sales: ${se.message}`);
      sales = saleRows || [];
    }

    // Fallback: parcelas R$ 5,00 com vencimentos 16/07 e 17/07/2026 na Menezes
    const { data: amountCandidates, error: ae } = await sb
      .from('finance_receipts')
      .select(
        'id, sale_id, installment_number, due_date, amount, status, paid_at, paid_amount, company_id, tenant_id, created_at',
      )
      .or(`company_id.eq.${companyId},tenant_id.eq.${companyId}`)
      .gte('amount', 4.99)
      .lte('amount', 5.01)
      .in('due_date', ['2026-07-16', '2026-07-17'])
      .order('due_date', { ascending: true })
      .limit(50);
    if (ae) throw new Error(`finance_receipts by amount: ${ae.message}`);

    const saleIds = [
      ...new Set([
        ...sales.map((s) => String(s.id)),
        ...(amountCandidates || []).map((r) => String(r.sale_id || '')).filter(Boolean),
      ]),
    ];

    // 4) Parcelas por sale
    const receiptsBySale: Record<string, unknown[]> = {};
    for (const saleId of saleIds) {
      const { data: receipts, error: re } = await sb
        .from('finance_receipts')
        .select(
          'id, sale_id, installment_number, due_date, amount, status, paid_at, paid_amount, company_id, tenant_id, created_at, description',
        )
        .eq('sale_id', saleId)
        .order('installment_number', { ascending: true });
      if (re) throw new Error(`receipts ${saleId}: ${re.message}`);
      receiptsBySale[saleId] = receipts || [];
    }

    const installmentIds = Object.values(receiptsBySale)
      .flat()
      .map((r) => String((r as { id: string }).id));

    // 5) company_asaas_charges
    let charges: unknown[] = [];
    if (installmentIds.length) {
      const { data: chargeRows, error: ce } = await sb
        .from('company_asaas_charges')
        .select('*')
        .eq('company_id', companyId)
        .in('installment_id', installmentIds)
        .order('created_at', { ascending: false });
      if (ce) throw new Error(`company_asaas_charges: ${ce.message}`);
      charges = chargeRows || [];
    }

    // Also search charges by value ~5 near those dates
    const { data: chargesByValue, error: cve } = await sb
      .from('company_asaas_charges')
      .select('*')
      .eq('company_id', companyId)
      .gte('value', 4.99)
      .lte('value', 5.01)
      .in('due_date', ['2026-07-16', '2026-07-17'])
      .order('created_at', { ascending: false })
      .limit(30);
    if (cve) throw new Error(`charges by value: ${cve.message}`);

    const allChargeIds = [
      ...new Set([
        ...charges.map((c) => String((c as { id: string }).id)),
        ...(chargesByValue || []).map((c) => String(c.id)),
      ]),
    ];
    const paymentIds = [
      ...new Set(
        [...charges, ...(chargesByValue || [])]
          .map((c) => String((c as { asaas_payment_id?: string }).asaas_payment_id || ''))
          .filter(Boolean),
      ),
    ];

    // 6) webhook events
    let webhookEvents: unknown[] = [];
    if (paymentIds.length) {
      const { data: events, error: ee } = await sb
        .from('company_asaas_webhook_events')
        .select(
          'id, company_id, asaas_payment_id, event_type, processing_status, error_message, created_at, processed_at',
        )
        .eq('company_id', companyId)
        .in('asaas_payment_id', paymentIds)
        .order('created_at', { ascending: false })
        .limit(100);
      if (ee) throw new Error(`webhook events: ${ee.message}`);
      webhookEvents = events || [];
    }

    // 7) financial accounts + integration
    const { data: accounts, error: ace } = await sb
      .from('company_financial_accounts')
      .select(
        'id, company_id, name, environment, bank_integration_id, active, is_default, created_at, updated_at',
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (ace) throw new Error(`financial accounts: ${ace.message}`);

    const integrationIds = [
      ...new Set(
        (accounts || [])
          .map((a) => a.bank_integration_id)
          .filter(Boolean)
          .map(String),
      ),
    ];

    let integrations: unknown[] = [];
    if (integrationIds.length) {
      const { data: ints, error: ie } = await sb
        .from('bank_integrations')
        .select('id, company_id, provider, environment, status, metadata, created_at, updated_at')
        .in('id', integrationIds);
      if (ie) throw new Error(`bank_integrations: ${ie.message}`);
      integrations = (ints || []).map((row) => ({
        id: row.id,
        company_id: row.company_id,
        provider: row.provider,
        environment: row.environment,
        status: row.status,
        connectionStatus: (row.metadata as { connectionStatus?: string } | null)?.connectionStatus,
        accountValidated: (row.metadata as { accountValidated?: boolean } | null)?.accountValidated,
        updated_at: row.updated_at,
        created_at: row.created_at,
        // NÃO retornar secrets / metadata completo sensível
      }));
    }

    // credential presence (types only, no secrets)
    let credentialTypes: Array<{ integration_id: string; credential_type: string; updated_at: string }> =
      [];
    if (integrationIds.length) {
      const { data: creds, error: cre } = await sb
        .from('bank_credentials')
        .select('integration_id, credential_type, updated_at')
        .in('integration_id', integrationIds);
      if (cre) throw new Error(`bank_credentials: ${cre.message}`);
      credentialTypes = (creds || []) as typeof credentialTypes;
    }

    // cash movements linked to charges
    let cashMovements: unknown[] = [];
    const cashMovementIds = [...charges, ...(chargesByValue || [])]
      .map((c) => (c as { cash_movement_id?: string }).cash_movement_id)
      .filter(Boolean)
      .map(String);
    if (cashMovementIds.length) {
      const { data: cms, error: cme } = await sb
        .from('cash_movements')
        .select('id, company_id, type, amount, status, movement_date, category, description, metadata, created_at')
        .in('id', cashMovementIds);
      if (cme) throw new Error(`cash_movements: ${cme.message}`);
      cashMovements = cms || [];
    }

    // contracts for sales
    let contracts: unknown[] = [];
    if (saleIds.length) {
      const { data: contractRows, error: cte } = await sb
        .from('contracts')
        .select(
          'id, contract_number, sale_id, company_id, tenant_id, status, is_current, version, created_at',
        )
        .in('sale_id', saleIds)
        .order('version', { ascending: false });
      if (cte) throw new Error(`contracts: ${cte.message}`);
      contracts = contractRows || [];
    }

    return NextResponse.json({
      ok: true,
      readOnly: true,
      companyId,
      projects,
      lots,
      sales,
      amountCandidateReceipts: amountCandidates,
      receiptsBySale,
      chargesForInstallments: charges,
      chargesByValueDue: chargesByValue,
      webhookEvents,
      financialAccounts: accounts,
      integrations,
      credentialTypes,
      cashMovements,
      contracts,
      summary: {
        projectCount: projects?.length || 0,
        lotMatchCount: lots.length,
        saleCount: sales.length,
        installmentCount: installmentIds.length,
        chargeCount: allChargeIds.length,
        paymentIds,
        webhookEventCount: webhookEvents.length,
        accountEnvironments: (accounts || []).map((a) => ({
          id: a.id,
          name: a.name,
          environment: a.environment,
          active: a.active,
          bank_integration_id: a.bank_integration_id,
        })),
      },
    });
  } catch (err) {
    console.error('[diagnose-meneses-canaa-charges]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
