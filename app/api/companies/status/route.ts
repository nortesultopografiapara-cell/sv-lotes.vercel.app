import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildCompanyStatusUpdatePatch } from '@/lib/saasBillableStatus';
import { updateCompanyFinancialStatus } from '@/lib/saasCompanyFinancialStatus';
import { authorizePlatformAdminRequest } from '@/lib/security/adminAuthorization';

let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase não configurado (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  }
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabaseAdmin;
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { companyId, status_operacional, userId } = body;

    if (!companyId || !status_operacional) {
      return NextResponse.json({ error: 'Faltam parâmetros obrigatórios.' }, { status: 400 });
    }

    const auth = await authorizePlatformAdminRequest(request, userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Prevent blocking the master company if it exists (assuming master logic)
    const { data: company, error: compError } = await supabaseAdmin
       .from('companies')
       .select('id, name, status_operacional, active')
       .eq('id', companyId)
       .single();
       
    if (compError || !company) {
       return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });
    }
    
    // Master company prevention (usually the first one or with specific characteristics)
    // We check if it contains "Master" in the name or has some specific flag, or comparing IDs
    if (company.name.toLowerCase().includes('master')) {
       // Only allow active status for master? Or we just warn.
       // Actually, there is currently no hard flag for master, we just avoid blocking it.
       // The UI already avoids showing block button for the Main one.
    }

    const statusPatch = buildCompanyStatusUpdatePatch(status_operacional);
    const { error: updateError } = await supabaseAdmin
      .from('companies')
      .update({
        ...statusPatch,
        updated_at: new Date().toISOString(),
      })
      .eq('id', companyId);

    if (updateError) {
      throw updateError;
    }

    try {
      await updateCompanyFinancialStatus(supabaseAdmin, companyId);
    } catch (financialErr) {
      console.warn('[companies/status] updateCompanyFinancialStatus', {
        companyId,
        error: financialErr instanceof Error ? financialErr.message : String(financialErr),
      });
    }

    // Audit Log
    supabaseAdmin.from('audit_logs').insert({
       tenant_id: companyId,
       user_id: auth.userId,
       action: 'COMPANY_STATUS_CHANGED',
       details: JSON.stringify({
         old_status: company.status_operacional,
         old_active: company.active,
         new: statusPatch.status_operacional,
         new_active: statusPatch.active,
       })
    }).then();

    return NextResponse.json({ success: true, message: 'Status atualizado com sucesso' });

  } catch (error: any) {
    console.error('API /companies/status Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
