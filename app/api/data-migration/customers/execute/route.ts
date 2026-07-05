import { NextResponse } from 'next/server';
import { authorizeDataMigrationRequest } from '@/lib/imports/apiAuth';
import { executeCustomerImportBuffer } from '@/lib/imports/modules/customers/importService';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file');
  const activeTenantId = formData.get('activeTenantId');
  const confirmed = formData.get('confirmed');

  if (confirmed !== 'true') {
    return NextResponse.json(
      { error: 'Confirmação obrigatória para executar a importação.' },
      { status: 400 },
    );
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 });
  }

  const auth = await authorizeDataMigrationRequest(
    request,
    typeof activeTenantId === 'string' ? activeTenantId : null,
  );
  if ('error' in auth) return auth.error;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await executeCustomerImportBuffer({
      admin: auth.ctx.admin,
      tenantId: auth.ctx.tenantId,
      userId: auth.ctx.user.id,
      userName: auth.ctx.userName,
      buffer,
      fileName: file.name,
    });

    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao importar clientes.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
