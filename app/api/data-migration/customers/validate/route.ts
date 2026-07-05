import { NextResponse } from 'next/server';
import { authorizeDataMigrationRequest } from '@/lib/imports/apiAuth';
import {
  executeCustomerImportBuffer,
  validateCustomerImportBuffer,
  loadExistingCustomersForImport,
} from '@/lib/imports/modules/customers/importService';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file');
  const activeTenantId = formData.get('activeTenantId');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 });
  }

  const auth = await authorizeDataMigrationRequest(
    request,
    typeof activeTenantId === 'string' ? activeTenantId : null,
  );
  if ('error' in auth) return auth.error;

  const buffer = Buffer.from(await file.arrayBuffer());
  const existingCustomers = await loadExistingCustomersForImport(
    auth.ctx.admin,
    auth.ctx.tenantId,
  );

  const validation = await validateCustomerImportBuffer(
    buffer,
    file.name,
    existingCustomers,
  );

  return NextResponse.json({ validation });
}
