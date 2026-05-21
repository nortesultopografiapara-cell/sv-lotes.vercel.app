import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { companyId, confirmationName, adminEmail, adminUserId, adminPassword, destructiveConfirmation } = body;

    if (!companyId || !adminEmail || !adminUserId || !adminPassword || !confirmationName) {
      return NextResponse.json({ error: 'Faltam parâmetros obrigatórios.' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Service role não configurada.' }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 1. Authenticate Super Admin via signInWithPassword
    const supabaseAuthAuth = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error: signInError, data: signInData } = await supabaseAuthAuth.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });

    if (signInError || !signInData.user || signInData.user.id !== adminUserId) {
      return NextResponse.json({ error: 'Senha do administrador inválida.' }, { status: 401 });
    }

    // 2. Fetch User Role
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('role, tenant_id')
      .eq('id', adminUserId)
      .single();

    if (userError || !userData || userData.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Permissão negada. Apenas SUPER_ADMIN pode excluir.' }, { status: 403 });
    }

    if (userData.tenant_id === companyId) {
      return NextResponse.json({ error: 'Você não pode excluir sua própria empresa do momento.' }, { status: 403 });
    }

    // 3. Fetch Company Data
    const { data: company, error: fetchErr } = await supabaseAdmin
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (fetchErr || !company) {
      return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });
    }

    // 4. Validate name confirmation
    if (company.name !== confirmationName) {
      return NextResponse.json({ error: 'Nome de confirmação não confere.' }, { status: 400 });
    }

    // 5. Block protected companies
    // Don't mix up boolean checks with strings, wait, we must protect the main ones.
    if (company.is_master || company.slug?.toLowerCase() === 'master' || company.name.toLowerCase().includes('master')) {
       return NextResponse.json({ error: 'Empresa Master não pode ser excluída.' }, { status: 403 });
    }
    
    // Protect Severino's company or any other specifically protected one
    // "não permitir excluir ... tenant Master principal do SaaS"
    if (company.email === 'severino@nortesultopografia.com.br' || company.email === 'nortesultopografiapara@gmail.com') {
      return NextResponse.json({ error: 'Empresa Master do SaaS não pode ser excluída.' }, { status: 403 });
    }

    // 6. Check Operational Data dependencies
    let hasOperationalData = false;
    
    // Contratos
    const { count: contractsCount } = await supabaseAdmin.from('contracts').select('id', { count: 'exact', head: true }).eq('tenant_id', companyId);
    // Financeiro
    const { count: financeCount } = await supabaseAdmin.from('finance_receipts').select('id', { count: 'exact', head: true }).eq('tenant_id', companyId);
    // Vendas/Sales
    let salesCount = 0;
    const { count: sCount, error: salesErr } = await supabaseAdmin.from('sales').select('id', { count: 'exact', head: true }).eq('tenant_id', companyId);
    if (!salesErr) salesCount = sCount || 0;

    hasOperationalData = (contractsCount || 0) > 0 || (financeCount || 0) > 0 || salesCount > 0;

    // Se houver contratos, vendas ou financeiro real (e não for empresa de teste):
    if (hasOperationalData) {
      if (destructiveConfirmation !== 'APAGAR DEFINITIVAMENTE') {
        return NextResponse.json({ error: 'Confirmação destrutiva incorreta.' }, { status: 400 });
      }
    }

    // 7. Auditoria antes de excluir (COMPANY_DELETED_PERMANENTLY)
    try {
       await supabaseAdmin.from('audit_logs').insert({
          tenant_id: companyId,
          user_id: adminUserId,
          action: 'COMPANY_DELETED_PERMANENTLY',
          details: JSON.stringify({ company_name: company.name, cnpj: company.cnpj })
       });
    } catch(e) { console.warn('Could not save audit_log pre-delete', e); }

    // 8. EXCLUSÃO CASCATA
    // 1. audit_logs
    await supabaseAdmin.from('audit_logs').delete().eq('tenant_id', companyId).catch(() => {});
    // 2. finance_receipts
    await supabaseAdmin.from('finance_receipts').delete().eq('tenant_id', companyId);
    // 3. contracts
    await supabaseAdmin.from('contracts').delete().eq('tenant_id', companyId);
    // 4. sales
    await supabaseAdmin.from('sales').delete().eq('tenant_id', companyId).catch(() => {});
    // 5. customers
    await supabaseAdmin.from('customers').delete().eq('tenant_id', companyId);
    // 6. brokers
    await supabaseAdmin.from('brokers').delete().eq('tenant_id', companyId).catch(() => {});
    // 7. street_guides
    await supabaseAdmin.from('street_guides').delete().eq('tenant_id', companyId).catch(() => {});
    // 8. blocks
    await supabaseAdmin.from('blocks').delete().eq('tenant_id', companyId);
    // 9. projects
    await supabaseAdmin.from('projects').delete().eq('tenant_id', companyId);

    // 10. Users da empresa
    const { data: users } = await supabaseAdmin.from('users').select('id, role, email').eq('tenant_id', companyId);
    if (users && users.length > 0) {
       for (const u of users) {
          if (u.role === 'SUPER_ADMIN') continue; // NEVER delete super admin
          if (u.email === 'severino@nortesultopografia.com.br' || u.email === 'nortesultopografiapara@gmail.com') continue;

          // delete from public.users
          await supabaseAdmin.from('users').delete().eq('id', u.id);
          // delete from auth.users
          await supabaseAdmin.auth.admin.deleteUser(u.id);
       }
    }

    // 11. companies
    const { error: delErr } = await supabaseAdmin.from('companies').delete().eq('id', companyId);
    if (delErr) {
      return NextResponse.json({ error: 'Erro ao excluir empresa: ' + delErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Empresa excluída definitivamente com sucesso.' });

  } catch (error: any) {
    console.error('API /companies/delete Error:', error.message);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor' }, { status: 500 });
  }
}
