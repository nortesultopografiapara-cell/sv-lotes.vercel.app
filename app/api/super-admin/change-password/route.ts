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
      return NextResponse.json({ error: 'Autorização ausente.' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[ERRO FATAL] SUPABASE_SERVICE_ROLE_KEY ausente.');
      return NextResponse.json({ error: 'Configuração de ambiente (Service Role) inválida.' }, { status: 500 });
    }

    // Client para operar como admin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Validar quem está fazendo a requisição
    const token = authHeader.replace('Bearer ', '');
    const { data: userAuth, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !userAuth?.user) {
      return NextResponse.json({ error: 'Token inválido ou expirado.' }, { status: 401 });
    }

    // Verificar se quem está chamando é de fato SUPER_ADMIN na tabela users
    const callerEmail = userAuth.user.email;
    const { data: callerData, error: callerError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', userAuth.user.id)
      .single();

    if (callerError || !callerData || callerData.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Permissão negada. Apenas SUPER_ADMIN pode alterar senhas master.' }, { status: 403 });
    }

    // Apenas permitir alterar a própria senha, ou se houver lógica adicional.
    if (callerEmail !== email) {
      return NextResponse.json({ error: 'Operação não permitida.' }, { status: 403 });
    }

    // Realizar a atualização
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userAuth.user.id,
      { password: newPassword }
    );

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Registrar log (ignorando erros se a tabela não existir)
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: userAuth.user.id,
      admin_email: userAuth.user.email,
      action: 'MASTER_PASSWORD_UPDATED',
      timestamp: new Date().toISOString(),
      ip: req.headers.get('x-forwarded-for') || 'desconhecido'
    }).catch(console.error);

    return NextResponse.json({ success: true, message: 'Senha atualizada com sucesso.' });

  } catch (error: any) {
    return NextResponse.json({ error: 'Erro interno', details: error.message }, { status: 500 });
  }
}
