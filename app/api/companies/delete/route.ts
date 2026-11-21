import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { clearPrimaryAdminForCompanyTeardown } from '@/lib/companyPrimaryAdmin';
import {
  COMPANY_DELETION_PROTECTED_MESSAGE,
  isCompanyDeletionProtected,
} from '@/lib/companyDeletionGuard';

function protectedCompanyRefusal(companyId: string | null | undefined) {
  if (!isCompanyDeletionProtected(companyId)) return null;
  return NextResponse.json({ error: COMPANY_DELETION_PROTECTED_MESSAGE }, { status: 403 });
}

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

    const refused = protectedCompanyRefusal(companyId);
    if (refused) return refused;

    if (userData.tenant_id === companyId) {
      return NextResponse.json({ error: 'Você não pode excluir sua própria empresa do momento.' }, { status: 403 });
    }

    return executeCompanyPermanentDelete(supabaseAdmin, {
      companyId,
      confirmationName,
      destructiveConfirmation,
      adminUserId,
    });
  } catch (error: any) {
    console.error('API /companies/delete Error:', error.message);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor' }, { status: 500 });
  }
}

export async function executeCompanyPermanentDelete(
  supabaseAdmin: SupabaseClient,
  input: {
    companyId: string;
    confirmationName: string;
    destructiveConfirmation?: string | null;
    adminUserId: string;
  },
) {
  const { companyId, confirmationName, destructiveConfirmation, adminUserId } = input;
  const refused = protectedCompanyRefusal(companyId);
  if (refused) return refused;

  try {
    const { data: company, error: fetchErr } = await supabaseAdmin
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (fetchErr || !company) {
      return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });
    }

    const normalizedInput = confirmationName.trim().toLowerCase();
    const normalizedCompany = company.name.trim().toLowerCase();

    console.log('DELETE_COMPANY_COMPARE', {
      input: confirmationName,
      companyName: company.name,
      normalizedInput,
      normalizedCompany
    });

    if (normalizedInput !== normalizedCompany) {
      return NextResponse.json({ error: 'Nome de confirmação não confere.' }, { status: 400 });
    }

    if (company.is_master || company.slug?.toLowerCase() === 'master' || company.name.toLowerCase().includes('master')) {
       return NextResponse.json({ error: 'Empresa Master não pode ser excluída.' }, { status: 403 });
    }

    if (company.email === 'severino@nortesultopografia.com.br' || company.email === 'nortesultopografiapara@gmail.com') {
      return NextResponse.json({ error: 'Empresa Master do SaaS não pode ser excluída.' }, { status: 403 });
    }

    let hasOperationalData = false;
    const { count: contractsCount } = await supabaseAdmin.from('contracts').select('id', { count: 'exact', head: true }).eq('tenant_id', companyId);
    const { count: financeCount } = await supabaseAdmin.from('finance_receipts').select('id', { count: 'exact', head: true }).eq('tenant_id', companyId);
    let salesCount = 0;
    const { count: sCount, error: salesErr } = await supabaseAdmin.from('sales').select('id', { count: 'exact', head: true }).eq('tenant_id', companyId);
    if (!salesErr) salesCount = sCount || 0;
    hasOperationalData = (contractsCount || 0) > 0 || (financeCount || 0) > 0 || salesCount > 0;

    if (hasOperationalData && destructiveConfirmation !== 'APAGAR DEFINITIVAMENTE') {
      return NextResponse.json({ error: 'Confirmação destrutiva incorreta.' }, { status: 400 });
    }

    const refusedBeforeDelete = protectedCompanyRefusal(companyId);
    if (refusedBeforeDelete) return refusedBeforeDelete;

    try {
       await supabaseAdmin.from('audit_logs').insert({
          tenant_id: companyId,
          user_id: adminUserId,
          action: 'COMPANY_DELETED_PERMANENTLY',
          details: JSON.stringify({ company_name: company.name, cnpj: company.cnpj })
       });
    } catch (e) { console.warn('Could not save audit_log pre-delete', e); }

    try {
      const { error: err1 } = await supabaseAdmin.from('audit_logs').delete().eq('tenant_id', companyId);
      if (err1) throw err1;
    } catch (e) { console.warn('Silent skip audit_logs delete', e); }
    try {
      const { error: err2 } = await supabaseAdmin.from('broker_commissions').delete().eq('tenant_id', companyId);
      if (err2) throw err2;
    } catch (e) { console.warn('Silent skip broker_commissions delete', e); }
    try {
      const { error: err3 } = await supabaseAdmin.from('finance_receipts').delete().eq('tenant_id', companyId);
      if (err3) throw err3;
    } catch (e) { console.warn('Silent skip finance_receipts delete', e); }
    try {
      const { error: err4 } = await supabaseAdmin.from('contracts').delete().eq('tenant_id', companyId);
      if (err4) throw err4;
    } catch (e) { console.warn('Silent skip contracts delete', e); }
    try {
      const { error: err5 } = await supabaseAdmin.from('sales').delete().eq('tenant_id', companyId);
      if (err5) throw err5;
    } catch (e) { console.warn('Silent skip sales delete', e); }
    try {
      const { error: err6 } = await supabaseAdmin.from('customers').delete().eq('tenant_id', companyId);
      if (err6) throw err6;
    } catch (e) { console.warn('Silent skip customers delete', e); }
    try {
      const { error: err7 } = await supabaseAdmin.from('brokers').delete().eq('tenant_id', companyId);
      if (err7) throw err7;
    } catch (e) { console.warn('Silent skip brokers delete', e); }
    try {
      const { error: err75 } = await supabaseAdmin.from('street_guides').delete().eq('tenant_id', companyId);
      if (err75) throw err75;
    } catch (e) { console.warn('Silent skip street_guides delete', e); }
    try {
      const { error: err8 } = await supabaseAdmin.from('blocks').delete().eq('tenant_id', companyId);
      if (err8) throw err8;
    } catch (e) { console.warn('Silent skip blocks delete', e); }
    try {
      const { error: err9 } = await supabaseAdmin.from('projects').delete().eq('tenant_id', companyId);
      if (err9) throw err9;
    } catch (e) { console.warn('Silent skip projects delete', e); }

    await clearPrimaryAdminForCompanyTeardown(supabaseAdmin, companyId);
    const { data: users } = await supabaseAdmin.from('users').select('id, role, email').eq('tenant_id', companyId);
    if (users && users.length > 0) {
       for (const u of users) {
          if (u.role === 'SUPER_ADMIN') continue;
          if (u.email === 'severino@nortesultopografia.com.br' || u.email === 'nortesultopografiapara@gmail.com') continue;
          await supabaseAdmin.from('users').delete().eq('id', u.id);
          await supabaseAdmin.auth.admin.deleteUser(u.id);
       }
    }

    const refusedCompanyDelete = protectedCompanyRefusal(companyId);
    if (refusedCompanyDelete) return refusedCompanyDelete;
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
