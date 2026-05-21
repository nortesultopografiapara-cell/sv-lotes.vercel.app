import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { companyId } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Service role não configurada.' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch company data
    const { data: company, error: fetchErr } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (fetchErr || !company) {
      return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });
    }

    // Never delete Master or if not test
    if (!company.is_test_company) {
      return NextResponse.json({ error: 'Exclusão definitiva não permitida para empresas não marcadas como teste. Use desativar ou suspender.' }, { status: 400 });
    }

    // Verify operational dependencies
    const queries = [];
    
    // Contratos
    const { count: contractsCount } = await supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('tenant_id', companyId);
    
    // Financeiro
    const { count: financeCount } = await supabase.from('finance_receipts').select('id', { count: 'exact', head: true }).eq('tenant_id', companyId);
    
    // Vendas/Sales (if sales exists)
    let salesCount = 0;
    const { count: sCount, error: salesErr } = await supabase.from('sales').select('id', { count: 'exact', head: true }).eq('tenant_id', companyId);
    if (!salesErr) salesCount = sCount || 0;

    const hasOperationalData = (contractsCount || 0) > 0 || (financeCount || 0) > 0 || salesCount > 0;

    if (hasOperationalData) {
      return NextResponse.json({ 
        error: 'Esta empresa possui dados operacionais vinculados. Use desativar/suspender em vez de excluir.',
        hasOperationalData: true
      }, { status: 400 });
    }

    // CASCADE DELETION
    // 1. audit_logs
    await supabase.from('audit_logs').delete().eq('tenant_id', companyId).catch(() => {});
    
    // 2. finance_receipts (none, or test)
    await supabase.from('finance_receipts').delete().eq('tenant_id', companyId);
    
    // 3. contracts (none, or test)
    await supabase.from('contracts').delete().eq('tenant_id', companyId);

    // 4. sales (if exists)
    await supabase.from('sales').delete().eq('tenant_id', companyId).catch(() => {});

    // 5. customers
    await supabase.from('customers').delete().eq('tenant_id', companyId);

    // 6. brokers
    await supabase.from('brokers').delete().eq('tenant_id', companyId).catch(() => {});

    // 7. blocks
    await supabase.from('blocks').delete().eq('tenant_id', companyId);

    // 8. street_guides
    await supabase.from('street_guides').delete().eq('tenant_id', companyId).catch(() => {});

    // 9. projects
    await supabase.from('projects').delete().eq('tenant_id', companyId);

    // 10. Users
    // Get all users from this tenant
    const { data: users } = await supabase.from('users').select('id, role').eq('tenant_id', companyId);
    if (users && users.length > 0) {
       for (const u of users) {
          if (u.role === 'SUPER_ADMIN') continue; // NEVER delete super admin
          // delete from public.users
          await supabase.from('users').delete().eq('id', u.id);
          // delete from auth.users
          await supabase.auth.admin.deleteUser(u.id);
       }
    }

    // 11. companies
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
