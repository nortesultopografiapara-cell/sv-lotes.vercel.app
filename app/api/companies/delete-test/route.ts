import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertSuperAdmin } from '@/lib/apiSuperAdmin';
import { authorizeCompanyAdminRequest, type CompanyAdminAuthDeps } from '@/lib/companyAdminApiAuth';
import {
  COMPANY_DELETION_PROTECTED_MESSAGE,
  isCompanyDeletionProtected,
} from '@/lib/companyDeletionGuard';
import { createAdminSupabase, getRequestAuthUser } from '@/lib/supabase/server';
import { clearPrimaryAdminForCompanyTeardown } from '@/lib/companyPrimaryAdmin';

const defaultDeps: CompanyAdminAuthDeps = {
  getRequestAuthUser,
  createAdminSupabase,
  assertSuperAdmin,
};

function protectedCompanyRefusal(companyId: string | null | undefined) {
  if (!isCompanyDeletionProtected(companyId)) return null;
  return NextResponse.json({ error: COMPANY_DELETION_PROTECTED_MESSAGE }, { status: 403 });
}

export async function POST(request: Request) {
  const gate = await authorizeCompanyAdminRequest(request, defaultDeps);
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status });
  }
  return executeCompanyDeleteTest(request);
}

export async function executeCompanyDeleteTest(req: Request, supabaseClient?: SupabaseClient) {
  try {
    const body = await req.json();
    const { companyId } = body;
    const refused = protectedCompanyRefusal(companyId);
    if (refused) return refused;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseClient && (!supabaseUrl || !supabaseServiceKey)) {
      return NextResponse.json({ error: 'Service role não configurada.' }, { status: 500 });
    }

    const supabase = supabaseClient ?? createClient(supabaseUrl as string, supabaseServiceKey as string);

    const { data: company, error: fetchErr } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (fetchErr || !company) {
      return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });
    }

    if (!company.is_test_company) {
      return NextResponse.json({ error: 'Exclusão definitiva não permitida para empresas não marcadas como teste. Use desativar ou suspender.' }, { status: 400 });
    }

    const { count: contractsCount } = await supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('tenant_id', companyId);
    const { count: financeCount } = await supabase.from('finance_receipts').select('id', { count: 'exact', head: true }).eq('tenant_id', companyId);
    let salesCount = 0;
    const { count: sCount, error: salesErr } = await supabase.from('sales').select('id', { count: 'exact', head: true }).eq('tenant_id', companyId);
    if (!salesErr) salesCount = sCount || 0;

    const hasOperationalData = (contractsCount || 0) > 0 || (financeCount || 0) > 0 || salesCount > 0;

    if (hasOperationalData) {
      return NextResponse.json({
        error: 'Esta empresa possui dados operacionais vinculados. Use desativar/suspender em vez de excluir.',
        hasOperationalData: true,
      }, { status: 400 });
    }

    const refusedBeforeDelete = protectedCompanyRefusal(companyId);
    if (refusedBeforeDelete) return refusedBeforeDelete;

    try { await supabase.from('audit_logs').delete().eq('tenant_id', companyId); } catch (e) {}
    try { await supabase.from('broker_commissions').delete().eq('tenant_id', companyId); } catch (e) {}
    try { await supabase.from('finance_receipts').delete().eq('tenant_id', companyId); } catch (e) {}
    try { await supabase.from('contracts').delete().eq('tenant_id', companyId); } catch (e) {}
    try { await supabase.from('sales').delete().eq('tenant_id', companyId); } catch (e) {}
    try { await supabase.from('customers').delete().eq('tenant_id', companyId); } catch (e) {}
    try { await supabase.from('brokers').delete().eq('tenant_id', companyId); } catch (e) {}
    try { await supabase.from('street_guides').delete().eq('tenant_id', companyId); } catch (e) {}
    try { await supabase.from('blocks').delete().eq('tenant_id', companyId); } catch (e) {}
    try { await supabase.from('projects').delete().eq('tenant_id', companyId); } catch (e) {}

    await clearPrimaryAdminForCompanyTeardown(supabase, companyId);
    const { data: users } = await supabase.from('users').select('id, role').eq('tenant_id', companyId);
    if (users && users.length > 0) {
      for (const u of users) {
        if (u.role === 'SUPER_ADMIN') continue;
        await supabase.from('users').delete().eq('id', u.id);
        await supabase.auth.admin.deleteUser(u.id);
      }
    }

    const refusedCompanyDelete = protectedCompanyRefusal(companyId);
    if (refusedCompanyDelete) return refusedCompanyDelete;
    const { error: delErr } = await supabase.from('companies').delete().eq('id', companyId);
    if (delErr) {
      return NextResponse.json({ error: 'Erro ao excluir empresa: ' + delErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Empresa de teste excluída com sucesso.' });
  } catch (error: any) {
    console.error('API /companies/delete-test Error:', error);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor' }, { status: 500 });
  }
}
