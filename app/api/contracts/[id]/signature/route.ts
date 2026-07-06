import { NextResponse } from 'next/server';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';
import {
  buildSaleSignatureHistory,
  listSaleContractSignatures,
  SaleContractSignatureError,
  sendSaleContractForSignature,
} from '@/lib/saleContractSignatureService';
import { loadSaleContractContext } from '@/lib/contractRegeneration';
import { normalizeSellerFromCompany } from '@/lib/contractSeller';
import { getCompanyDisplayName } from '@/lib/contractCompanyDisplay';

export const runtime = 'nodejs';

async function assertContractAccess(
  supabase: NonNullable<Awaited<ReturnType<typeof createAdminSupabase>>['client']>,
  contractId: string,
  userId: string,
) {
  const profile = await resolveCallerProfile(supabase, userId);
  const callerRole = String(profile?.role || '').toUpperCase();
  if (callerRole === 'OWNER') {
    throw new SaleContractSignatureError(
      'Perfil OWNER possui acesso somente leitura.',
    );
  }

  const contract = await loadSaleContractContext(supabase, contractId);
  const tenantId = String(contract.tenant_id || contract.company_id || '');
  const callerTenant = String(profile?.tenant_id || profile?.company_id || '');

  const isSuperAdmin = ['SUPER_ADMIN', 'MASTER-ADMIN', 'MASTER_ADMIN'].includes(callerRole);
  if (!isSuperAdmin && callerTenant && tenantId && callerTenant !== tenantId) {
    throw new SaleContractSignatureError('Sem permissão para este contrato.');
  }

  return { contract, profile };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json({ error: configError || 'Não autenticado' }, { status: 401 });
    }

    const { client: supabase, configError: adminError } = createAdminSupabase();
    if (!supabase || adminError) {
      return NextResponse.json({ error: adminError || 'Supabase não configurado' }, { status: 503 });
    }

    const { id: contractId } = await params;
    console.log('[contracts/signature]', 'load_contract', { contractId });
    const { contract } = await assertContractAccess(supabase, contractId, user.id);

    const signatures = await listSaleContractSignatures(supabase, contractId);
    const latest = signatures[0] || null;
    const history = latest ? buildSaleSignatureHistory(latest) : [];

    const tenantId = String(contract.tenant_id || contract.company_id || '');
    let vendorDefaults = {
      name: '',
      document: '',
      email: '',
      companyName: '',
    };
    if (tenantId) {
      const { data: company } = await supabase
        .from('companies')
        .select('*')
        .eq('id', tenantId)
        .maybeSingle();
      if (company) {
        const seller = normalizeSellerFromCompany(company as Record<string, unknown>);
        vendorDefaults = {
          name: seller.representative !== 'Não informado' ? seller.representative : '',
          document: seller.representativeCpf || seller.cnpj || '',
          email: seller.email !== 'Não informado' ? seller.email : '',
          companyName: getCompanyDisplayName(company as Record<string, unknown>),
        };
      }
    }

    return NextResponse.json({
      success: true,
      latest,
      history,
      signatures,
      vendorDefaults,
    });
  } catch (err) {
    const message =
      err instanceof SaleContractSignatureError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Falha ao carregar assinatura.';
    const status = err instanceof SaleContractSignatureError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json({ error: configError || 'Não autenticado' }, { status: 401 });
    }

    const { client: supabase, configError: adminError } = createAdminSupabase();
    if (!supabase || adminError) {
      return NextResponse.json({ error: adminError || 'Supabase não configurado' }, { status: 503 });
    }

    const { id: contractId } = await params;
    console.log('[contracts/signature]', 'send_start', { contractId });
    await assertContractAccess(supabase, contractId, user.id);

    const result = await sendSaleContractForSignature(supabase, contractId);

    console.log('[contracts/signature]', 'response', {
      contractId,
      hasSignUrl: Boolean(result.signUrl),
    });

    return NextResponse.json({
      success: true,
      signUrl: result.signUrl,
      signature: result.signature,
    });
  } catch (err) {
    const message =
      err instanceof SaleContractSignatureError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Falha ao enviar para assinatura.';
    const status = err instanceof SaleContractSignatureError ? 400 : 500;
    console.error('SALE_CONTRACT_SEND_SIGN_ERROR', { message });
    return NextResponse.json({ error: message }, { status });
  }
}
