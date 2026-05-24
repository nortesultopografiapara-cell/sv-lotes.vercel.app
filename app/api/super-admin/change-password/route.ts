import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const { email, newPassword } = await req.json();

    if (!email || !newPassword) {
      return NextResponse.json({ error: 'Faltam parâmetros obrigatórios.' }, { status: 400 });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('Missing Authorization header.');
      return NextResponse.json({ error: 'Autorização ausente.' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[ERRO FATAL] SUPABASE_SERVICE_ROLE_KEY ausente ou não configurada no servidor.');
      return NextResponse.json({ error: 'Service role não configurada no servidor.' }, { status: 500 });
    }

    // Client para operar como admin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Validar quem está fazendo a requisição
    const token = authHeader.replace('Bearer ', '');
    const { data: userAuth, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !userAuth?.user) {
      console.log('Auth check error:', authError);
      return NextResponse.json({ error: 'Token inválido ou expirado. ' + (authError?.message || '') }, { status: 401 });
    }

    console.log('User id returned from token:', userAuth.user.id);
    console.log('User email returned from token:', userAuth.user.email);

    // Verificar se quem está chamando é de fato SUPER_ADMIN na tabela users
    const callerEmail = userAuth.user.email;
    const { data: callerData, error: callerError } = await supabaseAdmin
      .from('users')
      .select('role, is_super_admin, email')
      .eq('id', userAuth.user.id)
      .single();

    if (callerError) {
      console.error('Error fetching caller data from users table:', callerError);
    } else {
      console.log('Caller data from users table:', callerData);
    }

    const isSuperAdmin = callerData?.role === 'SUPER_ADMIN' ||
                         callerData?.is_super_admin === true ||
                         callerEmail === 'severino@nortesultopografia.com.br';

    if (!isSuperAdmin) {
      console.log('User is not a SUPER_ADMIN. Rejecting.');
      return NextResponse.json({ error: 'Permissão negada. Apenas SUPER_ADMIN pode alterar senhas master.' }, { status: 403 });
    }

    // Apenas permitir alterar a própria senha, ou se houver lógica adicional.
    if (callerEmail !== email) {
      console.log('Emails do not match:', callerEmail, email);
      return NextResponse.json({ error: 'Operação não permitida. Você só pode alterar a sua própria senha.' }, { status: 403 });
    }

    console.log('Attempting to update password for user id:', userAuth.user.id);
    // Realizar a atualização
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userAuth.user.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error('Update password error from Supabase Admin:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Registrar log (ignorando erros se a tabela não existir)
    console.log('Password updated successfully. Logging to audit_logs...');
    const { error: auditError } = await supabaseAdmin.from('audit_logs').insert({
      admin_id: userAuth.user.id,
      admin_email: userAuth.user.email,
      action: 'MASTER_PASSWORD_UPDATED',
      timestamp: new Date().toISOString(),
      ip: req.headers.get('x-forwarded-for') || 'desconhecido'
    });

    if (auditError) {
       console.warn('Erro ao inserir audit_log (ignorado):', auditError.message);
    }

    return NextResponse.json({ success: true, message: 'Senha atualizada com sucesso.' });

  } catch (error: any) {
    console.error('Catch error in POST:', error);
    return NextResponse.json({ error: error.message || 'Erro interno catch' }, { status: 500 });
  }
}
